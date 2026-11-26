# CKA: Storage Classes, Volumes and Claims

> **The one-sentence version:** A Pod asks for storage with a **PersistentVolumeClaim**; the claim is satisfied by a **PersistentVolume**, either one an admin created by hand or one a **StorageClass** provisions on demand. Access modes and reclaim policies decide who can mount it and what happens when the claim goes away.

Storage is only 10% of the CKA, but it's dense with small rules, and each rule is a classic "why is my Pod Pending?" puzzle.

## Why it matters

Stateless apps can lose a Pod and not care. Databases, queues and anything with files can't. The exam checks that you can give a workload durable storage, pick the right access mode, and explain why a claim isn't binding.

## The three layers

🔑 **Claims are requests, volumes are supply, classes are factories.**

| Object | Scope | Role |
|---|---|---|
| **PersistentVolume (PV)** | Cluster | A real piece of storage: a disk, an NFS export, a hostPath |
| **PersistentVolumeClaim (PVC)** | Namespace | "I need 5Gi, ReadWriteOnce, of class `fast`" |
| **StorageClass** | Cluster | How to provision PVs dynamically: provisioner, parameters, policies |

A PVC **binds** to exactly one PV that satisfies it. With a StorageClass, the provisioner creates that PV for you when the claim appears (or when the first Pod using it is scheduled).

## Dynamic provisioning

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"   # optional: make it the default
provisioner: rancher.io/local-path          # whatever CSI driver the cluster runs
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: data, namespace: db }
spec:
  storageClassName: fast
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 5Gi } }
```

```yaml
# using it in a Pod
spec:
  containers:
  - name: db
    image: postgres:17
    volumeMounts: [{ name: data, mountPath: /var/lib/postgresql/data }]
  volumes:
  - name: data
    persistentVolumeClaim: { claimName: data }
```

> 💡 `k get sc` shows every class and marks the default. A PVC with no `storageClassName` gets the default class. To create a PVC that must bind to a hand-made PV and never trigger provisioning, set `storageClassName: ""` explicitly.

### `WaitForFirstConsumer`

With `Immediate` binding, the volume is provisioned as soon as the claim exists, possibly in a zone or on a node where the Pod can't run. **`WaitForFirstConsumer`** delays provisioning until a Pod using the claim is scheduled, so the volume is created where the Pod lands. A PVC showing `Pending` with "waiting for first consumer" is normal until a Pod uses it.

## Static provisioning

When there's no provisioner (common in exam labs), you create the PV yourself:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata: { name: pv-logs }
spec:
  capacity: { storage: 2Gi }
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath: { path: /mnt/logs }
```

A PVC binds to it if its class, access mode and requested size are all satisfiable: same `storageClassName`, an access mode the PV offers, and a request no larger than the PV's capacity.

> ⚠️ `hostPath` stores data on whichever node the Pod happens to run on. It's fine for labs and single-node demos and a poor choice for real data. Exam tasks use it because it needs no infrastructure.

## Access modes

| Mode | Short | Meaning |
|---|---|---|
| ReadWriteOnce | RWO | Read-write by Pods on **one node** at a time |
| ReadOnlyMany | ROX | Read-only by many nodes |
| ReadWriteMany | RWX | Read-write by many nodes (NFS, CephFS and similar) |
| ReadWriteOncePod | RWOP | Read-write by **a single Pod** in the whole cluster |

🔑 **RWO is per node, not per Pod.** Two Pods on the same node can both mount an RWO volume. If you need "exactly one Pod, ever", that's RWOP. And the mode must be something the storage backend actually supports: asking a block-disk provisioner for RWX leaves the claim Pending.

## Reclaim policies

What happens to the PV when its PVC is deleted:

- **Delete**: the PV and the underlying storage are deleted. This is the usual default for dynamic classes.
- **Retain**: the PV becomes `Released` and keeps the data. An admin must clean it up or re-bind it manually; a new PVC won't bind to a Released PV until its `claimRef` is cleared.

You can change a PV's policy at any time with `k patch pv pv-logs -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'`. That's how you protect a dynamically provisioned volume you've decided you care about.

## Expanding a claim

If the StorageClass has `allowVolumeExpansion: true`, edit the PVC's `spec.resources.requests.storage` to a larger value (`k edit pvc data`). Shrinking isn't supported. Some backends finish resizing the filesystem only once the volume is next mounted, which `k describe pvc` reports in its conditions.

## Ephemeral storage, briefly

Not every volume needs a claim:

- **`emptyDir`**: scratch space that lives as long as the Pod, shared between its containers (with `medium: Memory`, it's RAM-backed).
- **`configMap` / `secret` / `projected`**: files generated from API objects.
- **Generic ephemeral volumes** (`ephemeral.volumeClaimTemplate`): a PVC created and deleted with the Pod, provisioned by a StorageClass.

## Diagnosing a Pending claim

```bash
k get pvc -n db                     # STATUS Pending? check its events:
k describe pvc data -n db           # "no persistent volumes available", "waiting for first consumer"…
k get pv                            # is there a PV with matching class/mode/size, and is it Available?
k get sc                            # does the class exist? is its provisioner running?
```

Most Pending claims come down to one of four mismatches: class name, access mode, size, or a provisioner that isn't running.

## Check yourself

1. A PVC requests 5Gi RWO with class `manual`. There's an Available 10Gi RWO PV with class `standard`. Will it bind? Why?
2. Two Pods on the same node both mount an RWO volume successfully. Is something wrong?
3. You deleted a PVC whose PV had `Retain`. A new PVC with the same spec stays Pending. What's going on?

## Key takeaways

- **PVC = request, PV = supply, StorageClass = factory** for dynamic PVs.
- `WaitForFirstConsumer` provisions where the Pod lands; Pending until then is normal.
- Binding needs a matching **class, access mode and enough size**; `storageClassName: ""` means "static PVs only".
- **RWO is per node; RWOP is per Pod.** The backend must support the mode you ask for.
- `Delete` removes the data with the claim; `Retain` keeps it as a Released PV for manual cleanup.
