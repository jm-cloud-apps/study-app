# CKAD: Configuration, Resources and Application Security

> **The one-sentence version:** CKAD's largest domain (25%) is about the environment a Pod runs in: its **ConfigMaps and Secrets**, its **requests and limits** under namespace **quotas**, its **ServiceAccount** identity, and its **securityContext**, which says which user it runs as and what it's allowed to do.

These are small fields with big consequences. Most tasks are "add exactly this to the Pod spec" and are quick once you know where each field lives.

## Why it matters

Expect "run this container as user 1000 with no privilege escalation", "this Pod must use ServiceAccount `reporter` and must not mount a token", "limit the namespace to 2 CPUs", and "inject this Secret as an environment variable." Each one is one block of YAML in exactly the right place.

## Where each field lives

🔑 **Pod-level vs container-level is the whole trick.** Some security settings apply to the Pod, some to each container, and some to both, in which case the container value wins.

| Field | Pod `spec.securityContext` | Container `securityContext` |
|---|---|---|
| `runAsUser`, `runAsGroup`, `runAsNonRoot` | ✅ (default for all containers) | ✅ (overrides) |
| `fsGroup` | ✅ only | — |
| `seccompProfile` | ✅ | ✅ |
| `allowPrivilegeEscalation` | — | ✅ only |
| `capabilities` (add/drop) | — | ✅ only |
| `readOnlyRootFilesystem` | — | ✅ only |
| `privileged` | — | ✅ only |

```yaml
spec:
  securityContext:
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000              # volumes become group-owned by 2000
  containers:
  - name: app
    image: myapp:2.0
    securityContext:
      runAsNonRoot: true
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
        add: ["NET_BIND_SERVICE"]   # bind ports below 1024 without root
```

Verify from inside: `k exec app -- id` shows the uid and gid, and `k exec app -- touch /x` should fail on a read-only root filesystem.

> ⚠️ `runAsNonRoot: true` makes the kubelet **refuse to start** a container whose image runs as root and has no numeric `runAsUser` set. The Pod shows `CreateContainerConfigError`. That's the setting working as intended, not a bug.

## ConfigMaps and Secrets, consumed every way

```bash
k create cm web-cfg --from-literal=MODE=prod --from-file=nginx.conf
k create secret generic api-keys --from-literal=TOKEN=abc123
```

```yaml
containers:
- name: web
  image: nginx:1.27
  env:
  - name: MODE
    valueFrom: { configMapKeyRef: { name: web-cfg, key: MODE } }
  - name: TOKEN
    valueFrom: { secretKeyRef: { name: api-keys, key: TOKEN } }
  envFrom:
  - secretRef: { name: api-keys }            # all keys as env vars
  volumeMounts:
  - { name: conf, mountPath: /etc/nginx/conf.d }
  - { name: keys, mountPath: /etc/keys, readOnly: true }
volumes:
- name: conf
  configMap:
    name: web-cfg
    items: [{ key: nginx.conf, path: default.conf }]   # pick a key, rename the file
- name: keys
  secret: { secretName: api-keys, defaultMode: 0400 }
```

Decode a Secret value to check it: `k get secret api-keys -o jsonpath='{.data.TOKEN}' | base64 -d`.

## Requests, limits, quotas and LimitRanges

- **Requests and limits** are set per container (the CKA workloads lesson covers what they do).
- A **ResourceQuota** caps a namespace's totals: `k create quota team-q -n team --hard=requests.cpu=2,requests.memory=4Gi,limits.cpu=4,limits.memory=8Gi,pods=20`.
- A **LimitRange** sets per-container defaults and bounds. It's YAML-only:

```yaml
apiVersion: v1
kind: LimitRange
metadata: { name: defaults, namespace: team }
spec:
  limits:
  - type: Container
    default:        { cpu: "500m", memory: "256Mi" }   # becomes the limit if none is set
    defaultRequest: { cpu: "100m", memory: "128Mi" }   # becomes the request if none is set
    max:            { cpu: "2",    memory: "1Gi" }
```

🔑 **A CPU or memory quota makes requests and limits mandatory.** Once a namespace has a compute quota, a Pod that doesn't declare those values is rejected. A LimitRange with defaults fixes that for everyone at once. `k describe quota -n team` shows used versus hard.

## ServiceAccounts

Every Pod runs as a ServiceAccount (`default` if you don't choose). Its token lets the Pod call the API with whatever RBAC grants that account.

```bash
k create sa reporter -n team
k create token reporter -n team --duration=1h     # a short-lived token, e.g. for testing
```

```yaml
spec:
  serviceAccountName: reporter
  automountServiceAccountToken: false   # this Pod doesn't need API access
```

> 💡 Set `automountServiceAccountToken: false` on Pods that never talk to the API. It's free hardening. Pair it with a dedicated ServiceAccount per app so RBAC grants are narrow.

## Authentication, authorization and admission, in one pass

Every API request goes through three gates, in order:

1. **Authentication**: who are you? A certificate, a ServiceAccount token, or an OIDC token.
2. **Authorization**: may you do this? Usually **RBAC**. Check with `k auth can-i … --as=…`.
3. **Admission**: should this object be accepted, or changed? Admission controllers enforce quotas, LimitRange defaults, Pod Security, and any webhooks or policies.

When a create fails, the error says which gate refused: "Unauthorized" (authentication), "forbidden: User … cannot …" (RBAC), or a message naming the quota or policy (admission).

## Discovering extensions: CRDs and operators

The CKAD also asks you to *discover and use* resources that extend Kubernetes:

```bash
k get crd | grep -i backup
k explain backup.spec --recursive
k get backups -A
```

Create a custom resource exactly like any built-in one, then watch the operator act on it through its `status` and events.

## Check yourself

1. You set `allowPrivilegeEscalation: false` under the Pod's `spec.securityContext` and `kubectl apply` rejects it. Why?
2. After adding a ResourceQuota on CPU, new Pods in the namespace are rejected. What's the cleanest fix that doesn't require editing every Deployment?
3. A Pod never calls the Kubernetes API. Which two settings reduce what a compromised container could do with its identity?

## Key takeaways

- **Know Pod-level vs container-level**: `fsGroup` is Pod-only; capabilities, `allowPrivilegeEscalation` and `readOnlyRootFilesystem` are container-only.
- Consume config as env vars (`valueFrom`, `envFrom`) or files (volumes with `items` to pick keys).
- **A compute quota makes requests and limits mandatory**; a LimitRange supplies defaults.
- Give each app its own ServiceAccount, and disable token automount when the API isn't needed.
- Requests pass **authentication → authorization → admission**; the error message names the gate.
