# Cluster Upgrades and ClusterOperator Health

> **The one-sentence version:** OpenShift upgrades itself from a single signed release payload — the Cluster Version Operator updates ~30 ClusterOperators in dependency order, then the Machine Config Operator rolls every node — and your job is to read health, pick a legal path, and know why it stalled.

## Why it matters

Upgrades are the recurring Day-2 event that touches everything: operators, nodes, workloads, and your maintenance window. "Walk me through how you'd upgrade a production cluster, and what you'd do if it hung at 63%" is a standard interview question because it exercises architecture, troubleshooting, and judgement at once.

## The mental model

🔑 **One image, many operators.** A release is a single **payload image** containing the manifests and images for every platform component. The **Cluster Version Operator (CVO)** verifies its signature, then reconciles each **ClusterOperator (CO)** toward the versions the payload declares — in a defined order, never all at once. Node OS updates come last, driven by the **MCO** pool-by-pool (lesson 19).

Two phases, then, and they fail differently:

1. **Control plane / operators** — usually fast, minutes to tens of minutes.
2. **Node rollout** — one drain + reboot per node, `maxUnavailable` at a time. This is the long tail.

## Reading health first

Never start an upgrade from an unknown state.

```bash
oc get clusterversion
oc adm upgrade                    # current version, channel, available updates
oc get co                         # AVAILABLE / PROGRESSING / DEGRADED
oc get nodes                      # all Ready? any SchedulingDisabled left over?
oc get mcp                        # all UPDATED, none paused, none DEGRADED
oc get csv -A | grep -v Succeeded # add-on operators healthy?
```

What the columns mean:

| Column | Reading |
|---|---|
| `AVAILABLE=True` | The operator is doing its job right now. |
| `PROGRESSING=True` | It's mid-change. Normal during an upgrade, suspicious when idle. |
| `DEGRADED=True` | It's working but unhealthy, **or** it can't reach desired state. Always investigate. |

```bash
oc describe co <name>             # the conditions carry a human-readable message
oc get co <name> -o jsonpath='{.status.conditions}' | jq
```

> 💡 The rule of thumb: **`AVAILABLE=True, PROGRESSING=False, DEGRADED=False` on every ClusterOperator** is the green light. A cluster with a degraded operator will refuse — or should refuse — to start a minor upgrade.

## Channels and legal paths

Channels are named `<risk>-<version>`:

| Channel | Meaning |
|---|---|
| `stable-4.y` | Released and broadly soaked. The production default. |
| `fast-4.y` | Released, earlier than stable. |
| `candidate-4.y` | Pre-release. Testing only. |
| `eus-4.y` | Extended Update Support — the channel that enables EUS-to-EUS hops. |

```bash
oc adm upgrade channel stable-4.16
oc adm upgrade --to=4.16.12          # explicit, and what you should do in production
oc adm upgrade --to-latest           # latest in the channel
```

Two rules that trip people up:

- **You cannot skip a minor version.** 4.14 → 4.16 is 4.14 → 4.15 → 4.16. The **EUS-to-EUS** path lets you avoid rebooting nodes for the intermediate version by *pausing the worker pool* across both control-plane hops and unpausing once — the nodes reboot a single time — but the control plane still goes through every minor version.
- **Update paths are curated.** OpenShift publishes an update graph; the paths offered to you exclude combinations known to be broken. Some updates are **conditional** — offered with a documented risk:

  ```bash
  oc adm upgrade --include-not-recommended   # shows conditional updates + their risks
  ```

  Read the risk before forcing anything. `--allow-not-recommended` exists; use it knowingly, not reflexively.

## Before you press go

- **Back up etcd** (lesson 20). Non-negotiable.
- **Check add-on operators.** OLM Operators have their own compatibility matrix. An Operator whose channel doesn't support the target OpenShift version can break *after* the upgrade. Update Operator subscriptions to a supported channel **first** where the vendor says so.
- **Look for `Upgradeable=False`.** Something in the cluster is objecting:

  ```bash
  oc get clusterversion version -o jsonpath='{range .status.conditions[?(@.type=="Upgradeable")]}{.status}{": "}{.message}{"\n"}{end}'
  ```

  This blocks *minor* upgrades (not patches) and its message names the reason — a deprecated API still in use, an incompatible operator, a degraded component.
- **Check deprecated API usage.** The API-removal alerts (`APIRemovedInNextReleaseInUse` and friends) tell you which of your workloads is calling an API that the next version drops.
- **Verify PodDisruptionBudgets are satisfiable.** A PDB that can never be met will stall the node rollout indefinitely — this is the single most common "stuck at 63%" cause.
- **Have capacity.** Draining a node needs somewhere for its pods to go.

## Watching it, and unsticking it

```bash
oc adm upgrade                    # progress summary
watch 'oc get co; oc get mcp; oc get nodes'
oc get clusterversion -o jsonpath='{.items[0].status.conditions}' | jq
```

Newer releases include `oc adm upgrade status` for a much richer view; its availability depends on your version, so check before relying on it in a runbook.

Where upgrades actually stall:

| Symptom | Usual cause | Where to look |
|---|---|---|
| Stuck at a percentage, one CO `PROGRESSING` for ages | That operator can't reach its desired state | `oc describe co <name>`, then that operator's pod logs |
| CVO reports `ClusterOperatorDegraded` | A dependency below it is unhappy | Fix the named operator; the CVO will resume |
| Control plane done, node count not advancing | MCP rollout blocked: a drain can't complete (PDB, pod without a controller, stuck terminating pod) | `oc get mcp`, `oc describe mcp worker`, MCD logs, `oc get pdb -A` |
| A node stuck `SchedulingDisabled` | Drain blocked, or the node failed to come back after reboot | `oc describe node`, `oc debug node/<node>` |
| Nothing is progressing and no update was offered | Wrong channel, or `Upgradeable=False` | `oc adm upgrade`, the `Upgradeable` condition |

> ⚠️ Resist the urge to "help" by deleting operator pods at random. The CVO reconciles continuously; a stalled upgrade is nearly always waiting on a specific, nameable condition. Find the name first.

## Nodes and MachineSets

On installer-provisioned infrastructure, worker nodes come from **MachineSets** — the cluster-side analogue of a cloud autoscaling group.

```bash
oc get machinesets -n openshift-machine-api
oc get machines -n openshift-machine-api
oc scale machineset <name> -n openshift-machine-api --replicas=6
```

New machines boot the RHCOS image matching the cluster's current version and join their pool. A **MachineHealthCheck** can automatically replace machines that go unhealthy — powerful, and worth constraining with `maxUnhealthy` so a cluster-wide blip doesn't trigger a mass reprovision.

For extra capacity during an upgrade, scaling out *before* you start gives drains somewhere to land.

## Check yourself

1. The control plane finished upgrading an hour ago, but `oc get mcp` still shows `worker` at 12/40 updated and no progress for 20 minutes. What are the two things you check first?
2. Why does 4.14 → 4.16 require passing through 4.15, and what does the EUS path actually save you?
3. `oc adm upgrade` offers nothing at all. Name two distinct causes.

## Key takeaways

- The **CVO** reconciles a single signed release payload across all **ClusterOperators**; the **MCO** then rolls the nodes.
- Green means `AVAILABLE=True, PROGRESSING=False, DEGRADED=False` on every CO, plus healthy MCPs and nodes.
- Channels are `stable-`/`fast-`/`candidate-`/`eus-4.y`; **no minor-version skipping**, and paths are curated — conditional updates carry documented risks.
- Pre-flight: **etcd backup**, add-on Operator compatibility, `Upgradeable=False` reasons, deprecated-API alerts, PDBs, spare capacity.
- Most stalls are one named condition: a degraded operator, or a drain blocked by a PDB or an unevictable pod.
- **MachineSets** scale worker capacity; MachineHealthChecks replace bad machines automatically.
