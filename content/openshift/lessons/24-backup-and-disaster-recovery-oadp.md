# Backup and Disaster Recovery with OADP

> **The one-sentence version:** etcd backups protect the *cluster*; **OADP** — OpenShift's packaging of Velero — protects *applications*, backing up a namespace's API objects plus its persistent volume data to object storage so you can restore it here, or somewhere else entirely.

## Why it matters

"We have etcd backups" is not a DR plan. An etcd restore is an all-or-nothing rollback of the entire cluster to a moment in time — you cannot use it to bring back one namespace that someone deleted on Friday, and it's useless if the cluster itself is gone. Application-level backup is a different tool for a different failure, and interviewers ask precisely because people conflate the two.

🔑 **Two layers, two tools.** Control-plane state → `cluster-backup.sh` / etcd (lesson 20). Application state → **OADP**.

## What OADP is

The **OADP Operator** (OpenShift API for Data Protection) installs and manages **Velero** plus OpenShift-aware plugins. Its parts:

| Piece | Job |
|---|---|
| **Velero** | The controller. Watches `Backup`/`Restore`/`Schedule` CRs and does the work. |
| **Plugins** | `openshift` (handles OpenShift-specific objects), `csi` (volume snapshots), plus cloud plugins (`aws`, `azure`, `gcp`). The `aws` plugin also serves any S3-compatible store. |
| **node-agent** | A DaemonSet that copies **file-level** volume data, using **Kopia** (or Restic) as the uploader. Needed when you can't or don't want to use CSI snapshots. |
| **Object storage** | Where backups land: S3, Azure Blob, GCS, or on-cluster S3-compatible storage such as ODF/NooBaa/MinIO. |

## Configuring it: the DataProtectionApplication

One CR drives the install:

```yaml
apiVersion: oadp.openshift.io/v1alpha1
kind: DataProtectionApplication
metadata:
  name: dpa
  namespace: openshift-adp
spec:
  configuration:
    velero:
      defaultPlugins:
        - openshift
        - csi
        - aws
    nodeAgent:
      enable: true
      uploaderType: kopia
  backupLocations:
    - velero:
        provider: aws
        default: true
        credential:
          name: cloud-credentials      # a Secret in openshift-adp
          key: cloud
        objectStorage:
          bucket: ocp-backups
          prefix: prod-cluster
        config:
          region: ca-central-1
```

Then confirm the storage location is reachable — this is the step people skip:

```bash
oc get backupstoragelocation -n openshift-adp    # PHASE should be Available
oc get pods -n openshift-adp
```

> ⚠️ A `BackupStorageLocation` stuck in `Unavailable` means credentials, bucket name, region, or network egress. Every backup will fail until it's `Available`, and Velero will happily keep creating `PartiallyFailed` backups while you're not looking.

## Taking a backup

```yaml
apiVersion: velero.io/v1
kind: Backup
metadata:
  name: payments-2026-07-21
  namespace: openshift-adp
spec:
  includedNamespaces: [payments]
  # excludedResources: [events, events.events.k8s.io]
  storageLocation: default
  ttl: 720h0m0s                 # 30 days, then Velero expires it
  defaultVolumesToFsBackup: true   # file-level PV backup via node-agent
```

Scheduled, which is how it should really run:

```yaml
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: payments-nightly
  namespace: openshift-adp
spec:
  schedule: "0 2 * * *"
  template:
    includedNamespaces: [payments]
    ttl: 168h0m0s
```

Checking on it:

```bash
oc get backups -n openshift-adp
oc describe backup payments-2026-07-21 -n openshift-adp
oc logs -n openshift-adp deploy/velero
```

Phases: `InProgress` → `Completed`, or `PartiallyFailed` / `Failed`. **Treat `PartiallyFailed` as failed** — it usually means some volumes didn't get captured, which is exactly the part you'll want back.

## Volumes: snapshots vs. filesystem backup

This is the design decision that matters most.

| Approach | How | Good at | Weak at |
|---|---|---|---|
| **CSI snapshots** | The storage system snapshots the volume | Fast, low overhead, large volumes | Usually **cluster/storage-local** — not a portable copy unless your storage replicates it elsewhere |
| **Filesystem backup** (node-agent + Kopia/Restic) | Reads the files and uploads them to object storage | **Portable** — restore into a different cluster, different storage class, different cloud | Slower; heavier on large or very busy volumes |

For "the namespace got deleted, put it back" — snapshots are lovely. For "the cluster is gone, rebuild in the DR region" — you need the data in object storage, so filesystem backup (or storage-level replication of your snapshots).

> ⚠️ Neither approach makes a database consistent by itself. A backup taken mid-write is a backup of a torn file.

## Hooks: making backups consistent

Velero can run commands in a pod before and after the snapshot — flush and lock, then unlock:

```yaml
spec:
  hooks:
    resources:
      - name: quiesce-postgres
        includedNamespaces: [payments]
        labelSelector:
          matchLabels: { app: postgres }
        pre:
          - exec:
              container: postgres
              command: ["/bin/bash", "-c", "psql -c 'CHECKPOINT;'"]
              onError: Fail
        post:
          - exec:
              container: postgres
              command: ["/bin/bash", "-c", "echo done"]
```

> 💡 For real databases, prefer the database's own dump/backup tooling for logical backups and use OADP for the surrounding namespace — or at minimum, use hooks that genuinely quiesce writes. `onError: Fail` is the right setting when consistency matters: a backup that silently skipped the quiesce is worse than no backup, because you'll trust it.

## Restoring

```yaml
apiVersion: velero.io/v1
kind: Restore
metadata:
  name: payments-restore
  namespace: openshift-adp
spec:
  backupName: payments-2026-07-21
  # restore into a different namespace:
  namespaceMapping:
    payments: payments-dr
  existingResourcePolicy: none   # 'update' to overwrite existing objects
```

```bash
oc get restores -n openshift-adp
oc describe restore payments-restore -n openshift-adp
```

Things to expect on restore:

- **Namespace-scoped by nature.** OADP restores what you backed up. Cluster-scoped objects can be included, but it is not a cluster rebuild tool.
- **Restoring to a new cluster** is the migration path: the `openshift` plugin handles OpenShift-specific objects, and image references may need attention if the app pulled from the source cluster's internal registry.
- **Some things shouldn't come back**: node-specific objects, and objects owned by controllers that will recreate them. Velero skips a sensible set by default.
- **Restore is not automatically idempotent** — check `existingResourcePolicy` before restoring over a live namespace.

## What OADP does *not* cover

- **The cluster itself** — control-plane config, ClusterOperators, node config. That's etcd backup plus your install-time IaC (`install-config.yaml`, MachineSets, MachineConfigs — ideally all in Git; see lesson 15).
- **External data** — an RDS database or an object store your app uses lives outside the cluster and needs its own backup.
- **Secrets you never want restored** — think about what re-appearing credentials mean in a DR cluster.

## A real DR plan, in one list

1. Cluster config in **Git** (GitOps), so the cluster is rebuildable.
2. **etcd snapshots** on a schedule, stored off-cluster, for in-place recovery.
3. **OADP schedules** per application namespace, to portable object storage.
4. **Documented RPO/RTO** per app, so the schedule frequency is a decision rather than an accident.
5. **Rehearsed restores.** Restore into a scratch namespace or a test cluster on a cadence.

> 🔑 The only backup you can trust is one you have restored. An untested backup is a hypothesis.

## Check yourself

1. Someone deletes the `payments` namespace at 4 p.m. You have last night's etcd snapshot and last night's OADP backup. Which do you use, and why not the other?
2. You back up volumes with CSI snapshots only, and the cluster's storage array is lost. What do you actually have?
3. Why is `PartiallyFailed` a status you should page on rather than skim past?

## Key takeaways

- **OADP = Velero + OpenShift plugins**, configured by a **DataProtectionApplication** CR in `openshift-adp`.
- It backs up **namespaced application state** to object storage — a different layer from etcd's cluster-state backup.
- `Backup`, `Schedule`, and `Restore` are the day-to-day CRs; confirm the **BackupStorageLocation is `Available`** first.
- **CSI snapshots** are fast but usually cluster-local; **filesystem backup** (node-agent + Kopia/Restic) is portable and is what makes cross-cluster restore possible.
- Use **hooks** to quiesce databases, with `onError: Fail` when consistency matters.
- OADP doesn't back up the control plane, external data, or your IaC — pair it with etcd backups and GitOps.
- Rehearse restores. An untested backup is a hypothesis.
