# CSI in Depth: Dynamic Provisioning, Snapshots, and Why a PVC Won't Bind

> **The one-sentence version:** Every storage backend on OpenShift speaks one API — the **Container Storage Interface** — through a *controller* half that creates and attaches volumes and a *node* half that mounts them, and nearly every storage incident you'll debug is one of those halves failing in a way the PVC reports as a quiet `Pending`.

Lesson 11 gave you the three objects a developer touches: PVC, PV, StorageClass. This lesson goes one layer down, to what actually happens between `oc apply -f pvc.yaml` and a running container with a disk under `/data` — because that's the layer you debug from.

## Why it matters

Storage is where platform work stops being tidy. A Deployment that won't roll out because two Pods are fighting over one disk, a PVC that sits `Pending` with no obvious error, a volume that can't be expanded during an incident — these are ordinary Tuesday problems, and they're all downstream of how CSI works. "A PVC is stuck Pending. Walk me through it" is one of the most common Day-2 interview questions, and it's really asking whether you know there are two halves.

## The two halves of a CSI driver

🔑 **Controller = the warehouse. Node plugin = the delivery to your door.** One creates the volume somewhere in the storage system; the other makes it appear inside a container on a specific machine. They fail independently, and the fix is different each time.

| Half | Runs as | Does |
|---|---|---|
| **Controller plugin** | A Deployment (usually 2 replicas, on control-plane nodes) | Creates, deletes, attaches, resizes, and snapshots volumes by talking to the storage API |
| **Node plugin** | A DaemonSet — one Pod per node | Formats, mounts, and bind-mounts the volume into the Pod's directory on that node |

The controller doesn't run the driver alone. Kubernetes ships **sidecars** that watch the API and translate objects into CSI calls:

| Sidecar | Watches | Calls |
|---|---|---|
| `external-provisioner` | PVCs | `CreateVolume` / `DeleteVolume` |
| `external-attacher` | VolumeAttachments | `ControllerPublishVolume` (attach the disk to a node) |
| `external-resizer` | PVC size changes | `ControllerExpandVolume` |
| `external-snapshotter` | VolumeSnapshots | `CreateSnapshot` / `DeleteSnapshot` |
| `node-driver-registrar` | (node side) | Registers the driver with the kubelet |

The full path, in order — worth being able to recite:

1. You create a **PVC**. `external-provisioner` sees it, matches the StorageClass, calls `CreateVolume`.
2. A **PV** object appears and binds to the PVC.
3. A Pod using the PVC is **scheduled** to a node.
4. `external-attacher` creates a **VolumeAttachment**; the driver attaches the disk to that node.
5. The kubelet calls **`NodeStageVolume`** (format if needed, mount once to a global staging path), then **`NodePublishVolume`** (bind-mount into the Pod's own directory).
6. The container starts.

```bash
oc get csidrivers                                  # which drivers this cluster speaks
oc get csinodes                                    # which drivers each node has registered
oc -n openshift-cluster-csi-drivers get pods       # the controller Deployments + node DaemonSets
```

On OpenShift you don't install any of this by hand. The **Cluster Storage Operator** installs the CSI Driver Operator for your platform, which runs the driver and creates a default StorageClass (on AWS that's typically `gp3-csi`). The old in-tree volume plugins were migrated to CSI drivers over the 4.x line, so on a current cluster "the AWS EBS plugin" *is* a CSI driver.

## The StorageClass, field by field

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

| Field | What it decides |
|---|---|
| `provisioner` | Which CSI driver handles PVCs of this class |
| `parameters` | Driver-specific knobs (disk type, IOPS, encryption, filesystem) |
| `reclaimPolicy` | `Delete` destroys the backing volume when the PVC goes; `Retain` keeps it for manual recovery |
| `allowVolumeExpansion` | Whether a PVC of this class may be grown later |
| `volumeBindingMode` | `Immediate` provisions as soon as the PVC exists; `WaitForFirstConsumer` waits until a Pod is scheduled |

> 🔑 **`WaitForFirstConsumer` exists because of topology.** With `Immediate`, a disk can be created in availability zone A while the scheduler later decides the Pod belongs in zone B — and the Pod never starts. Waiting means the volume is created where the Pod actually landed. On zonal cloud storage this is the setting you want.

> ⚠️ Exactly **one** default StorageClass. A PVC with no `storageClassName` relies on the default, so zero defaults means it never binds and multiple defaults make the outcome depend on cluster version rather than on your intent. `oc get sc` shows `(default)` in the NAME column — check it after installing any storage operator, since some add a class of their own.

## Growing a volume

If the class allows expansion, you edit the claim — never the PV:

```bash
oc patch pvc data -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
oc get pvc data -o jsonpath='{.status.capacity.storage}{"\n"}'
```

Many drivers do this **online**, while the Pod runs. Some need the filesystem step to happen at mount time — you'll see a `FileSystemResizePending` condition on the PVC, which clears when the Pod is restarted. Two rules that don't bend: you **cannot shrink** a PVC, and expansion is only as available as the class's `allowVolumeExpansion`.

## Snapshots

Snapshots are their own API group, `snapshot.storage.k8s.io`, with three objects that mirror the PV/PVC pattern: a **VolumeSnapshotClass** (the how), a **VolumeSnapshot** (your request), and a **VolumeSnapshotContent** (the real snapshot in the storage system).

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata: { name: data-before-upgrade }
spec:
  volumeSnapshotClassName: csi-snapclass
  source:
    persistentVolumeClaimName: data
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: data-restored }
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: fast-ssd
  resources: { requests: { storage: 20Gi } }
  dataSource:                                  # restore = a new PVC from the snapshot
    name: data-before-upgrade
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
```

> ⚠️ A CSI snapshot almost always lives **on the same storage system as the volume**. It's an excellent undo button before a risky migration, and it is *not* a backup — lose the array and you lose both. That's exactly the trade-off lesson 24 draws between CSI snapshots and OADP's filesystem backup into object storage.

## When a PVC won't bind: the ladder

Always start with the events. The provisioner writes its reasoning there.

```bash
oc describe pvc data | tail -20
oc get sc
oc get volumeattachment | grep <pv-name>
oc -n openshift-cluster-csi-drivers logs deploy/<driver>-csi-driver-controller -c csi-provisioner
```

| What you see | What it usually means |
|---|---|
| `waiting for first consumer to be created before binding` | Nothing is wrong. The class is `WaitForFirstConsumer` — go look at why the **Pod** isn't scheduling. |
| PVC `Pending`, no events at all | The `storageClassName` doesn't exist, or there's no default class. |
| Provisioner error about quota/capacity/permissions | The storage backend refused. Read the driver's message; it's usually a cloud quota or an IAM permission. |
| `Multi-Attach error for volume ...` | An **RWO** volume is still attached to another node — often a Pod that hasn't finished terminating on a drained node. Check `oc get volumeattachment` and the old Pod. |
| Pod `ContainerCreating` with `MountVolume.SetUp failed` | The **node** half. Check the driver's node Pod on *that* node, and the mount/permission path — including the arbitrary-UID rules from lesson 2. |
| PVC stuck `Terminating` | The `kubernetes.io/pvc-protection` finalizer is doing its job: something still mounts it. Find and remove the consumer rather than stripping the finalizer. |

> 💡 RWX (`ReadWriteMany`) is a property of the **backend**, not a checkbox. Most cloud block storage is RWO only; RWX comes from a file backend — NFS, or CephFS via OpenShift Data Foundation. If an app needs many writers, that's a storage-platform decision made before the first PVC.

## Check yourself

1. A PVC is `Pending` with the event "waiting for first consumer to be created before binding." Where do you look next, and why is this *not* a storage bug?
2. You take a CSI snapshot of a database volume every hour. The storage array fails. What do you actually have, and what should have been in place instead?
3. A node was drained and a StatefulSet Pod is stuck `ContainerCreating` with a Multi-Attach error. What's holding the volume, and what do you check first?

## Key takeaways

- A CSI driver has **two halves**: a controller (provision, attach, resize, snapshot) and a node DaemonSet (stage and publish the mount). Knowing which half failed is most of the debugging.
- The **sidecars** — provisioner, attacher, resizer, snapshotter — are what turn PVC/VolumeAttachment/VolumeSnapshot objects into CSI calls; their logs are where the real error message lives.
- `volumeBindingMode: WaitForFirstConsumer` prevents the classic zonal mismatch; keep **exactly one** default StorageClass.
- Expand by editing the **PVC** (never the PV), only if the class allows it, and never shrink.
- **CSI snapshots are cluster-local undo, not backup** — pair them with OADP for anything that must survive losing the storage system.
- **RWX comes from the backend** (NFS, CephFS/ODF), not from asking for it in the claim.
