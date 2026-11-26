# CKA: Troubleshooting Clusters, Nodes and Apps

> **The one-sentence version:** Troubleshooting is 30% of the CKA, the biggest single domain, and it rewards a **method** over memory: start at the symptom, read what Kubernetes already told you (status, events, logs), and walk down the layers (Pod → node → kubelet → runtime → control plane) until the story makes sense.

The good news: Kubernetes is very chatty about what's wrong. Most broken-thing tasks are solved by reading the right output carefully, then making one small, precise fix.

## Why it matters

Expect tasks like "a node is NotReady, fix it", "the API server isn't responding after a config change", "this Deployment's Pods won't start", or "find the Pod using the most CPU and write its name to a file." Calm, systematic diagnosis turns each into a few minutes' work.

## The universal first three commands

```bash
k get pods -n app -o wide                    # STATUS, RESTARTS, NODE
k describe pod web-6f9c-abcde -n app         # Events at the bottom tell the story
k logs web-6f9c-abcde -n app --previous      # the crashed container's last words
```

🔑 **Read the Events section first.** Scheduling failures, image pull errors, probe failures, mount errors and OOMKills are all spelled out there in plain language.

## Reading Pod states

| Symptom | Usually means | Look at |
|---|---|---|
| `Pending` | Can't be scheduled: resources, taints, affinity, unbound PVC | `describe` events ("0/3 nodes are available: …") |
| `ImagePullBackOff` / `ErrImagePull` | Wrong image name/tag, or a private registry needs a pull secret | `describe` events |
| `CrashLoopBackOff` | The container starts then exits, over and over | `logs --previous`, the command/args, the probes |
| `OOMKilled` (in last state) | Exceeded its memory limit | `describe` → Last State, the `resources.limits` |
| `Running` but not `READY` | The readiness probe is failing | `describe` events, the probe's path and port |
| `CreateContainerConfigError` | A referenced ConfigMap/Secret or key doesn't exist | `describe` events |

## Container output streams

The curriculum says *manage and evaluate container output streams*. In practice:

```bash
k logs deploy/web                            # one Pod of the Deployment
k logs web-pod -c sidecar                    # a specific container
k logs web-pod --all-containers --prefix
k logs web-pod -f --since=10m                # follow, recent only
k logs -l app=web --tail=50                  # by label, last lines of each
```

Containers should log to **stdout/stderr**; the kubelet stores those streams on the node (under `/var/log/pods/`), and that's what `k logs` reads.

## Resource usage

```bash
k top nodes
k top pods -A --sort-by=memory
k top pod web-pod --containers
```

`k top` needs **metrics-server**. "error: Metrics API not available" means it isn't installed or isn't healthy, so check its Pod in `kube-system`.

## When a node is NotReady

Walk down from the API to the machine:

```bash
k get nodes
k describe node worker2              # Conditions: Ready, MemoryPressure, DiskPressure…
ssh worker2
sudo systemctl status kubelet        # running? enabled? the last log lines?
sudo journalctl -u kubelet -n 50 --no-pager
sudo systemctl status containerd     # the runtime under the kubelet
```

Common culprits, roughly by frequency:

1. **The kubelet is stopped or disabled.** `sudo systemctl enable --now kubelet`.
2. **A bad kubelet config.** A typo'd path or flag in `/var/lib/kubelet/config.yaml` or in the kubelet's systemd drop-in. `systemctl cat kubelet` prints the unit and every drop-in with its path, so you don't have to remember where your distro puts them. The journal names the problem. Fix it, then `sudo systemctl daemon-reload && sudo systemctl restart kubelet`.
3. **The container runtime is down.** Start containerd and check `crictl ps`.
4. **Expired or wrong certificates / kubeconfig** in `/etc/kubernetes/kubelet.conf`.
5. **No CNI plugin**, so the node reports "network plugin not ready."

🔑 **`journalctl -u kubelet` is the node's diary.** When a node is unhappy, the kubelet nearly always says why in its last few dozen lines.

## When the control plane is broken

If `kubectl` itself hangs or says "connection refused", the API server is down, and kubectl can't help you look. Go to the control-plane node and use the runtime directly:

```bash
ssh cp1
sudo crictl ps -a | grep -E 'kube-apiserver|etcd|scheduler|controller'
sudo crictl logs <container-id>              # why did it exit?
sudo ls /var/log/pods/ | grep apiserver      # logs survive even when crictl can't find the container
sudo vi /etc/kubernetes/manifests/kube-apiserver.yaml
```

The usual cause in an exam is a deliberately broken flag or path in a static Pod manifest: a wrong `--etcd-servers` port, a certificate path that doesn't exist, or a YAML indentation error that stops the kubelet parsing the file at all. Fix the manifest, then wait. The kubelet notices the change and recreates the Pod, which can take a minute. `watch sudo crictl ps` shows it coming back.

> ⚠️ Before editing a control-plane manifest, copy it somewhere **outside** the manifests directory (`sudo cp kube-apiserver.yaml /root/`). A backup left inside `/etc/kubernetes/manifests/` would be run as a second static Pod.

Component-specific clues:

| Broken | Symptom |
|---|---|
| kube-scheduler | New Pods stay `Pending` with **no** scheduling events at all |
| kube-controller-manager | Deployments don't create ReplicaSets; scaling does nothing |
| etcd | The API server can't start or errors on every request |
| CoreDNS | Pods run but can't resolve Service names |

## When the app is fine but unreachable

Walk the request path: **DNS → Service → endpoints → Pod port → NetworkPolicy**.

```bash
k get svc,endpointslices -n app
k get pods -n app --show-labels                      # do labels match the selector?
k run t --rm -it --image=busybox:1.36 --restart=Never -n app -- wget -qO- http://web:80
k get networkpolicy -n app
```

A temporary test Pod in the same namespace is the fastest way to tell "the app is broken" apart from "the path to it is broken."

## Check yourself

1. A node is NotReady. What are the first two commands you run once you've SSHed onto it?
2. After an edit to `kube-apiserver.yaml`, `kubectl` returns "connection refused." How do you find out what's wrong without `kubectl`?
3. New Pods stay Pending but `k describe` shows no events at all. Which component do you suspect, and why?

## Key takeaways

- **Events first**, then logs (`--previous` for crashes), then walk down the layers.
- Pod states map to causes: Pending → scheduling, BackOff → image or crash, not-READY → readiness probe.
- NotReady node → `systemctl status kubelet` and `journalctl -u kubelet`, then the runtime.
- Control plane down → `crictl ps -a` and `crictl logs` on the node; fix the static Pod manifest and wait for the kubelet.
- Unreachable app → DNS → Service → endpoints → Pod port → NetworkPolicy, tested from a throwaway Pod.
