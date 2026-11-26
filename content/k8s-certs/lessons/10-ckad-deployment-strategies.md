# CKAD: Deployment Strategies, Helm and Kustomize

> **The one-sentence version:** A rolling update is built into every Deployment. **Blue/green** and **canary** are built from ordinary primitives: two Deployments plus a Service whose selector (or replica ratio) decides who gets traffic. **Helm** and **Kustomize** install and vary the whole bundle.

CKAD's "Application Deployment" domain (20%) is about getting new versions out safely. None of it needs special tooling; it's labels, selectors and replica counts used deliberately.

## Why it matters

"Switch traffic from v1 to v2 with no downtime" and "send roughly 20% of traffic to the new version" are classic tasks. Once you see that a Service routes to *whatever matches its selector*, every strategy becomes a small edit.

## Rolling updates, tuned

```yaml
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # at most 1 extra Pod above 4 during the rollout
      maxUnavailable: 0    # never drop below 4 ready Pods
  minReadySeconds: 10      # a new Pod must stay ready 10s before it counts
```

🔑 **Readiness probes make rolling updates safe.** The rollout only proceeds as new Pods become *ready*. Without a readiness probe, "ready" just means "the process started", and a broken version can roll out completely before anyone notices.

```bash
k set image deploy/web web=myapp:2.0
k rollout status deploy/web
k rollout pause deploy/web      # stop part-way (a manual canary)
k rollout resume deploy/web
k rollout undo deploy/web
```

## Blue/green: flip the selector

Run both versions side by side and move all traffic at once by changing one label in the Service.

```bash
k create deploy web-blue  --image=myapp:1.0 --replicas=3 $do > blue.yaml
k create deploy web-green --image=myapp:2.0 --replicas=3 $do > green.yaml
# edit both: selector and Pod template labels become { app: web, version: blue|green }
k apply -f blue.yaml -f green.yaml
```

```yaml
# the Pod templates carry: labels: { app: web, version: blue }   (or green)
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  selector: { app: web, version: blue }   # change to green to cut over
  ports: [{ port: 80, targetPort: 8080 }]
```

```bash
k patch svc web -p '{"spec":{"selector":{"app":"web","version":"green"}}}'
k get endpointslices -l kubernetes.io/service-name=web -o wide   # now green Pod IPs
```

> ⚠️ `k create deploy` sets the Pod label `app=<name>`, so `web-blue` Pods get `app=web-blue`, not `app=web`. For blue/green, generate the YAML (`$do`) and set the Pod template labels yourself, so both Deployments share `app: web` and differ only in `version`. The selector in the Deployment must match its own template labels too.

Rollback is the same patch in reverse, instantly, because the old Pods are still running. That's blue/green's whole appeal, paid for with double the capacity during the switch.

## Canary: share the selector, set the ratio

Point one Service at a label **both** versions share, and let the replica counts set the traffic split:

```yaml
# web-stable: replicas: 4, Pod labels { app: web, track: stable }
# web-canary: replicas: 1, Pod labels { app: web, track: canary }
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  selector: { app: web }       # matches both tracks
  ports: [{ port: 80, targetPort: 8080 }]
```

With 4 stable and 1 canary Pod, roughly 20% of new connections reach the canary. Scale the canary up and the stable down to shift further; delete the canary to abort.

🔑 **Replica-ratio canaries are approximate.** Traffic splits per connection, not per request, and only in proportion to Pod count. For exact percentages, use weighted `backendRefs` in a Gateway API HTTPRoute, or a service mesh.

## Helm for application teams

The CKAD asks you to *use Helm to deploy existing packages*. The everyday loop:

```bash
helm repo add acme https://charts.acme.example      # the URL comes from the task
helm show values acme/web > values.yaml            # read the knobs
vi values.yaml
helm install web acme/web -n shop --create-namespace -f values.yaml
helm status web -n shop
helm upgrade web acme/web -n shop --set image.tag=2.0
helm rollback web -n shop                            # to the previous revision
helm list -n shop
```

`helm get values web -n shop` shows what you overrode, which is the quickest answer to "what did someone change?"

## Kustomize for variants

Kustomize keeps one base and small per-environment overlays:

```
web/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml     # resources: [deployment.yaml, service.yaml]
└── overlays/
    └── staging/
        └── kustomization.yaml
```

```yaml
# overlays/staging/kustomization.yaml
resources: ["../../base"]
namespace: staging
labels:
- pairs: { env: staging }
  includeSelectors: false
images:
- { name: myapp, newTag: "2.0-rc1" }
replicas:
- { name: web, count: 2 }
configMapGenerator:
- name: web-cfg
  literals: ["MODE=staging"]
```

```bash
k kustomize web/overlays/staging | less     # inspect before applying
k apply -k web/overlays/staging
```

> 💡 `configMapGenerator` adds a hash suffix to the ConfigMap's name and rewrites every reference to it. Changing a literal therefore produces a *new* ConfigMap name, which triggers a rolling update automatically. That's a neat trick, and a common source of "why is my ConfigMap called `web-cfg-7g2m9`?"

## Check yourself

1. In a blue/green setup, what single change moves all traffic to green, and why is rollback instant?
2. With 9 stable Pods and 1 canary behind one Service, roughly what share of traffic does the canary get? Why is that only approximate?
3. Why does a missing readiness probe make a rolling update riskier?

## Key takeaways

- Rolling updates are tuned with `maxSurge`, `maxUnavailable` and `minReadySeconds`, and **made safe by readiness probes**.
- **Blue/green** = two Deployments plus a Service selector flip; rollback is the reverse flip.
- **Canary** = a shared selector, with the split set by replica counts (approximate). Use HTTPRoute weights for precision.
- Helm: `show values` → `install -f` → `upgrade` / `rollback`; `get values` shows overrides.
- Kustomize: base plus overlays, `k kustomize` to preview, `k apply -k` to apply.
