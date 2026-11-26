# CKS: Pod Security, Secrets, Isolation and Pod-to-Pod Encryption

> **The one-sentence version:** Minimising microservice vulnerabilities means **enforcing Pod Security Standards** per namespace, **protecting Secrets** (RBAC plus encryption at rest in etcd), **isolating workloads** (namespaces, policies, sandboxed runtimes like gVisor), and **encrypting traffic between Pods** with Cilium or Istio.

This domain is 20% of the CKS, and it's where the most YAML-heavy security tasks live.

## Why it matters

Most real container breakouts start with a Pod that was allowed to be privileged, mount the host filesystem or run as root. Most data leaks start with a Secret readable by too many identities, or stored in plain text in etcd. Each control in this lesson closes one of those doors, and each one is directly checkable.

## Pod Security Standards and Pod Security Admission

Kubernetes defines three **Pod Security Standards**:

| Level | Allows | For |
|---|---|---|
| **privileged** | Anything | System components that genuinely need it |
| **baseline** | Blocks known privilege escalations (privileged containers, hostPath, host namespaces…) | Most workloads, with minimal changes |
| **restricted** | Baseline plus hardened defaults: non-root, no privilege escalation, `drop: ["ALL"]`, a seccomp profile | Security-sensitive apps |

The built-in **Pod Security Admission** controller enforces them with namespace labels:

```bash
k label ns payments \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted
```

| Mode | Effect on a violating Pod |
|---|---|
| `enforce` | **Rejected** |
| `warn` | Allowed, with a warning shown to the user |
| `audit` | Allowed, with an annotation in the audit log |

🔑 **Enforcement applies to Pods, and to new ones.** Labelling a namespace `enforce=restricted` doesn't evict Pods already running. But a Deployment's ReplicaSet will fail to create *new* Pods that violate the policy, and `k get events` (or `describe rs`) shows "violates PodSecurity". Use `warn` first to see what would break.

A Pod that passes `restricted`:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile: { type: RuntimeDefault }
  containers:
  - name: app
    image: myapp:2.0
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: { drop: ["ALL"] }
```

> 💡 Dry-run a label to see what it would reject: `k label --dry-run=server --overwrite ns payments pod-security.kubernetes.io/enforce=restricted`. The API server prints warnings for each existing Pod that would fail.

## Managing Secrets

Protect Secrets in three layers:

1. **RBAC**: very few identities should be able to `get`/`list` Secrets. `list` returns every Secret's content, not just the names.
2. **Mount, don't expose**: prefer volume mounts with tight `defaultMode` over environment variables, which leak into crash dumps and `env` output.
3. **Encryption at rest**: by default, Secrets are stored in etcd base64-encoded, effectively plain text. Turn on encryption:

```yaml
# /etc/kubernetes/enc/enc.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
- resources: ["secrets"]
  providers:
  - aescbc:
      keys:
      - name: key1
        secret: <base64 of 32 random bytes>   # head -c 32 /dev/urandom | base64
  - identity: {}                              # still able to read old, unencrypted data
```

```yaml
# in kube-apiserver.yaml: the flag, plus a volume so the Pod can see the file
- --encryption-provider-config=/etc/kubernetes/enc/enc.yaml
volumeMounts:
- { name: enc, mountPath: /etc/kubernetes/enc, readOnly: true }
volumes:
- { name: enc, hostPath: { path: /etc/kubernetes/enc, type: DirectoryOrCreate } }
```

🔑 **The first provider encrypts; the others can only decrypt.** Order matters: `aescbc` first means new writes are encrypted, and `identity` afterwards keeps old plain-text Secrets readable. Existing Secrets stay unencrypted until rewritten:

```bash
k get secrets -A -o json | k replace -f -
```

To check, read the raw value from etcd: `etcdctl … get /registry/secrets/<ns>/<name> | hexdump -C`. An encrypted value starts with `k8s:enc:aescbc:v1:key1`.

## Isolation techniques

- **Multi-tenancy basics**: a namespace per team or tenant, with RBAC, ResourceQuota, default-deny NetworkPolicies and Pod Security labels on each.
- **Sandboxed containers**: a **RuntimeClass** selects a different runtime handler, such as **gVisor** (`runsc`), which intercepts syscalls in a user-space kernel, or Kata Containers (lightweight VMs).

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata: { name: gvisor }
handler: runsc             # must match a handler configured in the node's container runtime
---
apiVersion: v1
kind: Pod
metadata: { name: untrusted }
spec:
  runtimeClassName: gvisor
  containers: [{ name: app, image: nginx:1.27 }]
```

Verify the sandbox: inside a gVisor Pod, `k exec untrusted -- dmesg` shows gVisor's own kernel messages, not the host's.

## Pod-to-Pod encryption

The curriculum names two approaches:

- **Cilium**: transparent encryption of Pod traffic between nodes using **WireGuard** (or IPsec), enabled in Cilium's configuration (for example through its Helm values). `cilium status` (or `cilium-dbg status` inside the agent) reports whether encryption is on.
- **Istio**: a service mesh that gives every Pod an identity and **mutual TLS**. A `PeerAuthentication` in `STRICT` mode refuses plain-text traffic:

```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata: { name: default, namespace: payments }
spec:
  mtls: { mode: STRICT }
```

The CKS allows docs.cilium.io and istio.io during the exam, and both have the exact configuration for these tasks. Know *what* each does and *where* it's configured; the docs supply the syntax.

## Check yourself

1. You labelled a namespace `enforce=restricted`, yet a privileged Pod is still running in it. Why, and what will happen when its Deployment rolls?
2. In an EncryptionConfiguration, why does putting `identity` first defeat the purpose?
3. What does a RuntimeClass change about how a Pod runs, and what must already exist on the node?

## Key takeaways

- **Pod Security Admission** enforces privileged / baseline / restricted through namespace labels (`enforce`, `warn`, `audit`); it acts on new Pods.
- `restricted` needs non-root, no privilege escalation, `drop ALL` and a seccomp profile.
- Encrypt Secrets at rest with an **EncryptionConfiguration** (first provider encrypts), then rewrite existing Secrets.
- Isolate with namespaces + RBAC + quotas + policies, and sandbox untrusted workloads with a **RuntimeClass** (gVisor, Kata).
- Pod-to-pod encryption: **Cilium** WireGuard/IPsec or **Istio** mTLS (`PeerAuthentication: STRICT`).
