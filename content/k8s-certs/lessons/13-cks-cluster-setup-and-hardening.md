# CKS: Cluster Setup and Cluster Hardening

> **The one-sentence version:** Hardening a cluster means **checking it against a benchmark** (CIS, with kube-bench), **closing network paths** (default-deny policies, blocked metadata endpoints, TLS on Ingress), **verifying what you install**, and **shrinking who can do what**: tight RBAC, careful ServiceAccounts, a locked-down API server, and staying patched.

These two CKS domains are 15% each. They build directly on the CKA: same objects, now asked "what's the least we can allow?"

## Why it matters

An attacker who lands in one Pod looks for the next step: other Pods it can reach, a cloud metadata endpoint that hands out credentials, a ServiceAccount token with too much power, an API server that's reachable and permissive. Each section here removes one of those steps.

## CIS benchmarks with kube-bench

The CIS Kubernetes Benchmark is a checklist of secure settings for each component. **kube-bench** runs those checks and prints `[PASS]`, `[FAIL]` and `[WARN]` lines, each with a remediation.

```bash
kube-bench run --targets master        # control-plane checks
kube-bench run --targets node          # worker/kubelet checks
kube-bench run --targets master --check 1.2.16   # re-run one check after fixing it
```

A typical fix is a flag in a static Pod manifest or a kubelet config field. For example:

```bash
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml   # add or adjust the flag
sudo vi /var/lib/kubelet/config.yaml                    # kubelet settings
sudo systemctl restart kubelet                          # after kubelet config changes
```

🔑 **Read the remediation text; it's the answer key.** kube-bench tells you exactly which file and which setting. Your job is to apply it without breaking the component, so back up the manifest first (outside the manifests directory) and watch the Pod come back with `crictl ps`.

Common kubelet hardening in `/var/lib/kubelet/config.yaml`:

```yaml
authentication:
  anonymous: { enabled: false }
  webhook: { enabled: true }
authorization:
  mode: Webhook          # not AlwaysAllow
readOnlyPort: 0
```

## Network security policies

Everything from the CKA networking lesson applies, now as a security control:

- **Default-deny** ingress and egress per namespace, then allow specific flows.
- Restrict *cluster-level* access, for example only the ingress controller's namespace may reach the frontend.

### Protecting node metadata

On cloud VMs, the instance metadata service at **169.254.169.254** can hand out credentials. Block Pods from reaching it with an egress policy that allows everything **except** that address:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: deny-metadata, namespace: apps }
spec:
  podSelector: {}
  policyTypes: [Egress]
  egress:
  - to:
    - ipBlock:
        cidr: 0.0.0.0/0
        except: ["169.254.169.254/32"]
```

## Ingress with TLS

```bash
k create secret tls shop-tls -n shop --cert=shop.crt --key=shop.key
```

Then reference it in the Ingress's `spec.tls` (`hosts` plus `secretName`), exactly as in the CKA networking lesson. Verify with `curl -kv https://shop.example.com --resolve shop.example.com:443:<ingress-ip>`; the certificate's subject should match. The CKS allows the ingress-nginx configuration docs, which cover controller-wide options such as forcing an HTTPS redirect.

## Verifying platform binaries

Before you trust a `kubelet`, `kubectl` or `kubeadm` binary, compare its hash with the one the Kubernetes project publishes:

```bash
sha512sum /usr/bin/kubelet
# compare with the published hash for exactly that version and architecture, e.g.
curl -LO https://dl.k8s.io/release/v1.37.1/bin/linux/amd64/kubelet.sha512
echo "$(cat kubelet.sha512)  /usr/bin/kubelet" | sha512sum --check
```

A task might hand you several binaries and ask you to delete the ones whose hashes don't match. Compare the full hash, not the first few characters.

## RBAC to minimise exposure

The CKS twist on RBAC is *removing* access:

- Prefer **Roles over ClusterRoles**, and specific verbs and resources over `*`.
- Watch for dangerous grants: `secrets` get/list, `pods/exec`, `create` on Pods (which can mount any Secret), `escalate`/`bind`/`impersonate`, and anything on `nodes/proxy`.
- Audit what an identity can do: `k auth can-i --list --as=system:serviceaccount:apps:web -n apps`.

## Careful with ServiceAccounts

```yaml
# don't let the namespace default SA hand out tokens
apiVersion: v1
kind: ServiceAccount
metadata: { name: default, namespace: apps }
automountServiceAccountToken: false
```

- One ServiceAccount per app, with only the RBAC it needs.
- `automountServiceAccountToken: false` on the SA or the Pod when the API isn't needed.
- Prefer short-lived tokens (`k create token`, or the projected tokens the kubelet rotates) over long-lived token Secrets.

## Restricting access to the API server

Settings to know in `kube-apiserver.yaml`:

| Setting | Why |
|---|---|
| `--authorization-mode=Node,RBAC` | Never `AlwaysAllow` |
| `--enable-admission-plugins=NodeRestriction,…` | Kubelets may only modify their own Node and Pods |
| `--anonymous-auth=false` | No unauthenticated requests. Check the API server's health probes still pass afterwards, because some setups rely on anonymous access to health endpoints |
| No public exposure | Keep the `kubernetes` Service as `ClusterIP`, and firewall port 6443 to trusted networks |

> ⚠️ After any API server flag change, `kubectl` goes away for a minute while the static Pod restarts. If it doesn't come back, `crictl ps -a` and the logs under `/var/log/pods/` on that node tell you which flag it disliked.

## Upgrade to avoid vulnerabilities

Kubernetes patches security issues in patch releases of the supported minor versions. Staying current is a control in its own right, and the CKS can ask you to perform a kubeadm upgrade exactly as in the CKA lifecycle lesson: one minor at a time, control plane first, drain before kubelet.

## Check yourself

1. kube-bench reports a FAIL on a kubelet setting. Where do you change it, and what do you do afterwards?
2. Write the egress rule that lets Pods reach everything except the cloud metadata endpoint.
3. Name three RBAC permissions that are more dangerous than they look, and why.

## Key takeaways

- **kube-bench** checks the CIS benchmark; its remediation text tells you exactly what to change.
- Default-deny NetworkPolicies, an **ipBlock `except` for 169.254.169.254**, and TLS on every Ingress.
- Verify binaries against the **published hashes** for that exact version.
- Minimise RBAC (watch Secrets, exec, Pod create, escalate/bind/impersonate) and audit with `can-i --list`.
- Disable SA token automount where unneeded; keep `Node,RBAC` authorization and `NodeRestriction`; stay patched.
