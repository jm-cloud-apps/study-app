# CKA: Workloads, Autoscaling and Scheduling

> **The one-sentence version:** Deployments roll Pods forward and back, ConfigMaps and Secrets feed them configuration, an HPA scales them on metrics, and **requests, node affinity, taints and tolerations** decide which node each Pod lands on.

This is the CKA's "Workloads & Scheduling" domain (15%). Much of it is shared with the CKAD, so time spent here pays twice.

## Why it matters

These are the bread-and-butter tasks: roll out a new image and roll it back, mount a ConfigMap, make a Deployment autoscale, keep a workload off a special node or pin it to one. Each one is quick if you know the shape, and fiddly if you're guessing.

## Rolling updates and rollbacks

A Deployment manages ReplicaSets. Changing its Pod template creates a new ReplicaSet and shifts Pods across gradually, governed by `strategy.rollingUpdate.maxSurge` and `maxUnavailable`.

```bash
k set image deploy/web nginx=nginx:1.27.1      # 'nginx' is the CONTAINER name
k rollout status deploy/web                     # wait for it to finish
k rollout history deploy/web
k rollout undo deploy/web                       # back to the previous revision
k rollout undo deploy/web --to-revision=2
k rollout restart deploy/web                    # new Pods, same spec (e.g. to reload config)
```

> 💡 `k annotate deploy/web kubernetes.io/change-cause="bump to 1.27.1"` sets the CHANGE-CAUSE column that `rollout history` shows. That's handy when a task asks you to record why.

`strategy.type: Recreate` kills every old Pod before starting new ones. Choose it when two versions must never run side by side, and accept the downtime.

## Configuration: ConfigMaps and Secrets

```yaml
spec:
  containers:
  - name: app
    image: myapp:2
    envFrom:
    - configMapRef: { name: app-cfg }          # every key becomes an env var
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef: { name: db, key: password }
    volumeMounts:
    - { name: cfg, mountPath: /etc/app }       # each key becomes a file
  volumes:
  - name: cfg
    configMap: { name: app-cfg }
```

🔑 **Mounted ConfigMaps update in place, environment variables don't.** A volume-mounted ConfigMap is refreshed in the running container after a short delay (unless it's mounted with `subPath`). Environment variables are read once, at container start, so changing them needs a `rollout restart`.

> ⚠️ A Secret is base64-*encoded*, not encrypted. Anyone who can read the Secret object can decode it. Protecting Secrets properly (RBAC, encryption at rest) is a CKS topic.

## Autoscaling with the HPA

The HorizontalPodAutoscaler scales a Deployment's replica count to hold a target metric. It needs **metrics-server** for CPU and memory, and it needs the Pods to declare **resource requests**, because utilisation is measured as a percentage of the request.

```bash
k autoscale deploy web --min=2 --max=8 --cpu-percent=70
k get hpa web                      # TARGETS shows current/target utilisation
k describe hpa web                 # events explain decisions (or "missing request for cpu")
```

> 💡 Recent kubectl versions may suggest newer flag spellings for `autoscale`; `k autoscale --help` on the exam cluster is the authority. For memory targets or custom behaviour, write an `autoscaling/v2` HPA in YAML; the "HorizontalPodAutoscaler Walkthrough" doc page has a full example.

## Self-healing primitives

The curriculum asks you to understand what makes a deployment *robust and self-healing*:

- **ReplicaSets** keep the desired number of Pods running.
- **Probes** restart wedged containers (liveness) and keep unready ones out of Service endpoints (readiness). There's more on probes in the CKAD observability lesson.
- **Resource requests and limits** let the scheduler place Pods sensibly and stop one Pod starving its neighbours.
- **PodDisruptionBudgets** stop voluntary disruptions (like `drain`) from taking down too many replicas at once: `k create pdb web --selector=app=web --min-available=2`.

## Requests and limits

```yaml
resources:
  requests: { cpu: "250m", memory: "128Mi" }   # what the scheduler reserves
  limits:   { cpu: "500m", memory: "256Mi" }   # the ceiling at runtime
```

The scheduler places a Pod only on a node whose **allocatable** capacity minus existing **requests** can fit it. Exceeding the CPU limit throttles the container. Exceeding the memory limit gets it **OOMKilled**. A Pod that stays `Pending` with "Insufficient cpu" in its events is asking for more than any node has free.

## Steering Pods onto (or off) nodes

| Tool | Direction | Use it when |
|---|---|---|
| `nodeSelector` | Pod → node | "Must run on nodes labelled `disk=ssd`", the simple version |
| **Node affinity** | Pod → node | The same with operators (`In`, `NotIn`, `Exists`) and preferred vs required rules |
| **Taints + tolerations** | Node repels Pods | "Only GPU workloads may run here": the node says no unless the Pod tolerates it |
| Pod (anti-)affinity | Pod ↔ Pod | "Spread replicas across nodes" or "co-locate with the cache" |

```bash
k label node worker2 disk=ssd
k taint node worker3 gpu=true:NoSchedule
k taint node worker3 gpu=true:NoSchedule-      # the trailing '-' removes it
```

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - { key: disk, operator: In, values: ["ssd"] }
  tolerations:
  - { key: gpu, operator: Equal, value: "true", effect: NoSchedule }
```

🔑 **A toleration permits; it doesn't attract.** Tolerating `gpu=true:NoSchedule` lets a Pod onto the GPU node but doesn't send it there. To *dedicate* nodes, combine the taint (keep others off) with node affinity or a nodeSelector (bring these Pods on).

The effects: `NoSchedule` blocks new Pods, `PreferNoSchedule` is a soft version, and `NoExecute` also evicts running Pods that don't tolerate it. Control-plane nodes carry `node-role.kubernetes.io/control-plane:NoSchedule`, which is why your workloads don't land there.

## Admission at the Pod level

"Configure Pod admission and scheduling" also covers namespace guardrails: a **LimitRange** sets default and maximum requests and limits per container, and a **ResourceQuota** caps a namespace's totals. A Pod rejected at creation with "exceeded quota" or "must specify limits" has hit one of these, and the error message names it.

## Check yourself

1. You changed a ConfigMap. Pods that mount it as a volume see the change, but Pods using it via `envFrom` don't. Why, and what fixes the second group?
2. An HPA shows `<unknown>/70%` in TARGETS. Name two likely causes.
3. You tainted a node for GPU workloads and added a matching toleration to the GPU Deployment, but its Pods still land on other nodes. What's missing?

## Key takeaways

- `set image` → `rollout status` → `rollout undo` is the update-and-rollback loop; `rollout restart` re-reads env config.
- ConfigMaps and Secrets feed Pods as env vars (read at start) or volumes (updated in place). Secrets are only base64-encoded.
- The HPA needs **metrics-server and resource requests**; `k describe hpa` explains its decisions.
- Requests drive scheduling, limits drive throttling and OOMKills.
- **Taints repel, tolerations permit, affinity attracts.** Dedicating nodes uses the taint plus affinity together.
