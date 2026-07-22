# etcd: Health, Backups, and Disaster Recovery

> **The one-sentence version:** etcd is the cluster's only source of truth, it is exquisitely sensitive to disk latency, and the two things you must be able to do under pressure are *take a backup* and *restore quorum*.

## Why it matters

Every object you've ever created — Deployments, Secrets, RBAC, the cluster's own configuration — lives in etcd. Lose it without a backup and you don't have a damaged cluster; you have no cluster. It's also the component most likely to be quietly unhealthy on an otherwise fine-looking cluster, because slow disks degrade it long before anything turns red.

🔑 **etcd is a latency machine, not a throughput machine.** Every write is fsync'd to disk and replicated to a quorum. Storage that's "fast enough" for an app is often far too slow for etcd.

## How it runs on OpenShift

etcd runs as **static pods** on the control-plane nodes (three of them, for quorum), managed by the **cluster-etcd-operator** — not by a Deployment you can scale. You do not `oc edit` etcd's manifests; you let the operator own them.

```bash
oc get pods -n openshift-etcd -l app=etcd -o wide
oc get etcd cluster -o yaml            # the operator's CR
oc get co etcd                         # the ClusterOperator health rollup
```

Quorum with 3 members tolerates **one** failure. With 5, two. There is no such thing as a 2-member etcd cluster that survives anything, and even numbers buy you nothing.

## Checking health

Get an `etcdctl` shell inside a member pod:

```bash
oc rsh -n openshift-etcd -c etcdctl etcd-<control-plane-node-name>

# inside the pod — certs and endpoints are pre-configured in this container
etcdctl endpoint health --cluster -w table
etcdctl endpoint status --cluster -w table   # DB SIZE, RAFT TERM, IS LEADER
etcdctl member list -w table
```

`endpoint status` is the one to read carefully: it shows each member's **database size**, who the **leader** is, and the raft term. A term that keeps climbing means repeated leader elections — almost always a symptom of disk or network latency, not of etcd itself.

### The metrics that actually matter

The built-in Prometheus stack already scrapes these, and OpenShift ships alerts for them:

| Signal | Metric | Rough expectation |
|---|---|---|
| **WAL fsync latency** | `etcd_disk_wal_fsync_duration_seconds` (p99) | Low single-digit milliseconds. Sustained tens of ms is trouble. |
| **Backend commit latency** | `etcd_disk_backend_commit_duration_seconds` (p99) | Same order — this is your disk speaking. |
| **Peer round-trip** | `etcd_network_peer_round_trip_time_seconds` | Control-plane nodes should be network-close to each other. |
| **Leader changes** | `etcd_server_leader_changes_seen_total` | Should be nearly flat. Frequent changes = instability. |
| **DB size** | `etcd_mvcc_db_total_size_in_bytes` | Watch growth against the space quota. |

Corresponding alerts you'll see by name in Alertmanager: `etcdHighFsyncDurations`, `etcdHighCommitDurations`, `etcdMembersDown`, `etcdNoLeader`, `etcdGRPCRequestsSlow`.

> 💡 The standing recommendation is **dedicated, low-latency SSD/NVMe storage for etcd**, not shared with the container runtime or logs. "Slow etcd" and "noisy-neighbour disk" are the same sentence in most incidents.

### Database size and defragmentation

etcd keeps historical revisions; compaction reclaims logical space, but the file itself stays fragmented until defragmented. On OpenShift the cluster-etcd-operator performs **automatic defragmentation** when fragmentation crosses its threshold, one member at a time. That's a good reason not to script your own routine defrags — but do keep an eye on DB size, because approaching the space quota puts etcd into a read-only alarm state that will take the API server down with it.

## Taking a backup

Backups are taken **on a control-plane node** using a script that ships with the cluster:

```bash
oc debug node/<control-plane-node>
chroot /host
sudo /usr/local/bin/cluster-backup.sh /home/core/assets/backup
```

You get two artifacts:

- `snapshot_<timestamp>.db` — the etcd snapshot itself.
- `static_kuberesources_<timestamp>.tar.gz` — the static pod manifests and the certificates/keys needed to reconstruct the control plane.

> ⚠️ **Both files matter, and both are secrets.** The snapshot contains every Secret in the cluster in plaintext (unless etcd encryption-at-rest is enabled). Copy them **off the node** to secure storage immediately — a backup that only exists on the machine you're about to lose is not a backup.

Practical hygiene:

- Take backups on a **schedule** (a common baseline is daily, retained per your RPO), and **before every risky change**: an upgrade, a certificate operation, a CRD deletion.
- Take one **before and after** major changes, so you can roll back to a known-good *and* verify the new state.
- Recent OpenShift versions offer an automated backup API for scheduling this natively; whether it's GA on your cluster depends on the version, so check your release's documentation rather than assuming.
- Restores are **cluster-version-specific**: restore a snapshot onto a cluster at the same version it was taken from.

## Recovery, in two very different flavours

### 1. One member is unhealthy, quorum is intact

This is the routine case and it is *not* a disaster. You remove the bad member and let the operator rebuild it: remove it from the member list with `etcdctl member remove <id>`, delete the failed member's etcd secrets in `openshift-etcd` (the peer/serving/metrics certs for that node), and delete its pod. The cluster-etcd-operator notices a member is missing and re-adds it, re-issuing certificates. Follow the documented procedure for your version — the ordering matters — and watch `oc get co etcd` return to Available.

> 🔑 **Never reach for a quorum restore when quorum is healthy.** Restoring rolls the whole cluster back in time. Rebuilding one member costs you nothing.

### 2. Quorum is lost — the disaster restore

When you've lost a majority of control-plane nodes, you rebuild from a snapshot:

1. Pick **one** surviving control-plane node as the recovery host and copy the snapshot pair to it.
2. Stop the other control-plane nodes' etcd (the procedure has you take them out of the picture so they can't rejoin with stale data).
3. On the recovery host, run the restore script:

   ```bash
   sudo /usr/local/bin/cluster-restore.sh /home/core/assets/backup
   ```

   This stops the static pods, moves the old data aside, restores the snapshot as a **single-member** cluster, and restarts the control plane.
4. Bring the remaining control-plane nodes back as **new, empty** members so they resync from the recovery host.
5. Afterwards: force a certificate/leader rotation as the procedure directs, then verify — `oc get nodes`, `oc get co`, `oc get pods -A` — and expect operators to churn for a while as they reconcile.

Everything created **after** the snapshot is gone. Anything running that etcd doesn't know about (stale pods on nodes) has to be reconciled.

> ⚠️ This is a procedure to **rehearse on a throwaway cluster**, not to read for the first time during an outage. The exact steps change between releases; always run your version's documented runbook.

## Check yourself

1. `etcdctl endpoint status` shows a raft term that has incremented 40 times in an hour. What's your hypothesis, and which metric would confirm it?
2. One of three control-plane nodes is down. Why is a snapshot restore the wrong response?
3. You have last night's `snapshot.db` but not the matching `static_kuberesources` tarball. What have you lost?

## Key takeaways

- etcd runs as static pods on the control plane, managed by the **cluster-etcd-operator**; 3 members tolerate 1 failure.
- Health lives in **latency**: WAL fsync and backend commit durations, peer RTT, leader changes. Give etcd dedicated fast disks.
- `oc rsh -n openshift-etcd -c etcdctl etcd-<node>` then `etcdctl endpoint status --cluster -w table` is your first look.
- Back up with `cluster-backup.sh`; keep **both** artifacts, treat them as secrets, and copy them off-cluster.
- A single unhealthy member is repaired by removing and re-adding it — not by restoring.
- `cluster-restore.sh` on one recovery host is the **lost-quorum** procedure; it rolls the cluster back to the snapshot's moment in time.
- Rehearse the restore before you need it, using the runbook for your exact cluster version.
