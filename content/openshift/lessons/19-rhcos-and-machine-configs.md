# RHCOS and MachineConfigs: Changing an Immutable OS

> **The one-sentence version:** OpenShift nodes run immutable RHEL CoreOS, so every host-level change — files, kernel arguments, sysctls, certificates, SSH keys — is declared as a **MachineConfig** and rolled out atomically by the Machine Config Operator, one node at a time, with a reboot.

## Why it matters

The single most common anti-pattern from engineers arriving from classic RHEL is SSH-ing to a node and editing a file. On OpenShift that change is invisible to the cluster, doesn't survive a node replacement, and can put the node into a **Degraded** state that blocks the next upgrade. Knowing the declarative path isn't pedantry — it's the difference between a change that survives and one that quietly disappears.

🔑 **The node is cattle, and the herd's config is a Kubernetes object.** You don't change a node; you change the pool's desired state and let the pool converge.

## The cast

| Object / component | Role |
|---|---|
| **RHCOS** | Immutable, `rpm-ostree`-based RHEL variant. The OS is a versioned image; changes are layered transactionally, not edited in place. |
| **MachineConfig (MC)** | A cluster-scoped CR carrying **Ignition** config: files, systemd units, kernel arguments, SSH keys, OS extensions. |
| **MachineConfigPool (MCP)** | A group of nodes (`master`, `worker`, or custom) that share a rendered config. |
| **Machine Config Operator (MCO)** | Renders all MCs matching a pool into one **rendered-\<pool\>-\<hash\>** MachineConfig and drives rollout. |
| **machine-config-daemon (MCD)** | The DaemonSet pod on each node that cordons, drains, writes the config, and reboots. |

```bash
oc get mcp                       # UPDATED / UPDATING / DEGRADED per pool
oc get mc                        # every MachineConfig, including rendered ones
oc describe mcp worker
```

## Anatomy of a MachineConfig

Writing a file (note the `role` label — that's what binds it to a pool):

```yaml
apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfig
metadata:
  name: 99-worker-chrony
  labels:
    machineconfiguration.openshift.io/role: worker
spec:
  config:
    ignition:
      version: 3.2.0
    storage:
      files:
        - path: /etc/chrony.conf
          mode: 0644
          overwrite: true
          contents:
            # Ignition takes file contents as a data: URL —
            # base64 or URL-encoded, not raw text.
            source: data:text/plain;charset=utf-8;base64,c2VydmVyIHRpbWUuZXhhbXBsZS5jb20K
```

Setting a **sysctl** is the same shape — drop a file in `/etc/sysctl.d/`. Setting **kernel arguments** has its own field:

```yaml
spec:
  kernelArguments:
    - systemd.unified_cgroup_hierarchy=1
```

> ⚠️ The naming convention `99-worker-*` is a convention for ordering and readability, not magic. What actually selects the pool is the `machineconfiguration.openshift.io/role` **label**.

Two higher-level CRs generate MachineConfigs for you, and you should prefer them when they fit:

- **KubeletConfig** — kubelet tunables (pod limits, eviction thresholds, allowed unsafe sysctls).
- **ContainerRuntimeConfig** — CRI-O settings (log size, pids limit).

## What a rollout actually does

1. You create or edit a MachineConfig.
2. The MCO re-renders the pool's config; the MCP's `UPDATED` goes `False`.
3. For each node, up to `maxUnavailable` at a time (**default 1**), the MCD:
   - cordons and **drains** the node (respecting PodDisruptionBudgets),
   - writes the files/units and stages the OS change,
   - **reboots** the node,
   - verifies the applied config matches the desired one, then uncordons.

So a config change on a 60-node worker pool is 60 sequential drains and reboots. That's slow by design, and it's why you batch changes rather than trickling them out one at a time.

```bash
# Which config does the node have vs. want?
oc get node <node> -o jsonpath='{.metadata.annotations}' | jq \
  '{current: ."machineconfiguration.openshift.io/currentConfig",
    desired: ."machineconfiguration.openshift.io/desiredConfig",
    state:   ."machineconfiguration.openshift.io/state"}'
```

Speeding up a big pool (only when you understand the capacity impact):

```bash
oc patch mcp worker --type merge -p '{"spec":{"maxUnavailable":3}}'
```

Pausing a pool — essential during EUS-to-EUS upgrades and during maintenance windows:

```bash
oc patch mcp worker --type merge -p '{"spec":{"paused":true}}'
# ...work...
oc patch mcp worker --type merge -p '{"spec":{"paused":false}}'
```

> ⚠️ A paused pool accumulates pending changes **including certificate rotation**. Leaving a pool paused for a long time is a well-known way to end up with nodes whose kubelet certificates have expired. Pause deliberately, unpause promptly.

## Custom pools

Want different kernel args on your infra nodes only? Make a pool.

```yaml
apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfigPool
metadata:
  name: infra
spec:
  machineConfigSelector:
    matchExpressions:
      - key: machineconfiguration.openshift.io/role
        operator: In
        values: [worker, infra]     # inherit worker's config, then layer infra's
  nodeSelector:
    matchLabels:
      node-role.kubernetes.io/infra: ""
```

Label a node `node-role.kubernetes.io/infra=""` and it joins the pool. Note the selector deliberately includes `worker` so the infra nodes keep the baseline worker configuration.

## Debugging a Degraded pool

```bash
oc get mcp                                  # DEGRADED=True on which pool?
oc describe mcp worker                      # the condition message names the node
oc get node <node> -o jsonpath='{.metadata.annotations.machineconfiguration\.openshift\.io/reason}{"\n"}'
oc logs -n openshift-machine-config-operator ds/machine-config-daemon -c machine-config-daemon --tail=100
oc debug node/<node>                        # root shell; host fs under /host (read-only inspection!)
```

The most frequent causes:

| Cause | Fix |
|---|---|
| A node's on-disk file was edited by hand and no longer matches the expected content | Restore the file to the MCO-managed content (or re-image the node); then express the change as a MachineConfig. |
| A drain won't complete — a PDB blocks eviction, or a pod has no controller | Fix the PDB or delete the stuck pod. `oc get pdb -A` and the MCD log name the pod. |
| Two MachineConfigs write the same path with different content | Consolidate them; last-writer-wins is not a strategy. |
| Bad Ignition (wrong `version`, malformed `data:` URL) | The MCD log says so explicitly. Fix and re-apply. |

> 💡 SSH access itself is managed: the `core` user's authorized keys come from a MachineConfig (`passwd.users`), not from you appending to `authorized_keys`. And `oc debug node/<node>` is the supported way in — it needs no SSH at all.

## Check yourself

1. Someone raises a sysctl on one node with `sysctl -w` and the problem "goes away." What will happen to that change, and what should they have done?
2. Why does a two-line MachineConfig change take an hour on a large cluster?
3. You paused the worker pool three weeks ago during a migration and forgot. What risk have you accumulated?

## Key takeaways

- RHCOS is immutable; host changes are **MachineConfig** objects, applied by the **MCO** via the per-node **MCD**.
- MCs are bound to a **MachineConfigPool** by the `machineconfiguration.openshift.io/role` label, and rendered into one `rendered-<pool>-<hash>` config.
- Rollout = cordon → drain → apply → **reboot** → verify, `maxUnavailable` nodes at a time (default 1).
- Prefer **KubeletConfig** / **ContainerRuntimeConfig** over hand-written MCs when they cover your need.
- `oc get mcp` is your rollout dashboard; a Degraded pool names the offending node in its conditions.
- Pausing a pool is a real tool but stalls certificate rotation — unpause promptly.
- Manually editing node files is the cardinal anti-pattern: invisible, non-durable, and a common cause of Degraded nodes.
