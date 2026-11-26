# CKA: Building and Upgrading Clusters with kubeadm

> **The one-sentence version:** `kubeadm` turns prepared Linux machines into a cluster: `init` on the first control-plane node, `join` on the rest. Upgrades go **one minor version at a time, control plane first**: kubeadm, then the plan and apply, then kubelet on each node, which you drain first.

This is the heart of the CKA's 25% "Cluster Architecture, Installation & Configuration" domain. It's also the work that feels scariest, because you're touching the machinery everything else runs on. It's very learnable, because kubeadm does the hard parts and tells you what it's doing.

## Why it matters

The curriculum asks you to *prepare infrastructure*, *create and manage clusters using kubeadm*, *manage the cluster lifecycle* and *understand a highly-available control plane*. In practice that means three task shapes: get a node ready, join it, and upgrade a cluster by one version without breaking it.

## What a kubeadm cluster is made of

🔑 **The control plane runs as static Pods.** The kubelet on each control-plane node watches `/etc/kubernetes/manifests/` and runs whatever Pod manifests it finds there: `kube-apiserver`, `kube-controller-manager`, `kube-scheduler` and `etcd`. There's no Deployment behind them. Edit the file and the kubelet restarts the Pod.

| Path | What lives there |
|---|---|
| `/etc/kubernetes/manifests/` | Static Pod manifests for the control plane |
| `/etc/kubernetes/pki/` | The cluster CA and component certificates (etcd's are under `pki/etcd/`) |
| `/etc/kubernetes/admin.conf` | A cluster-admin kubeconfig |
| `/etc/kubernetes/kubelet.conf` | The kubelet's own kubeconfig |
| `/var/lib/kubelet/config.yaml` | The kubelet's configuration |

## Preparing a node

Every node needs the same foundation before kubeadm will be happy:

```bash
# 1. a container runtime (containerd here), using the systemd cgroup driver
#    in /etc/containerd/config.toml:  SystemdCgroup = true
sudo systemctl enable --now containerd

# 2. IPv4 forwarding, persistently
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/k8s.conf
sudo sysctl --system

# 3. swap: the kubelet refuses to start with swap on unless configured to allow it
sudo swapoff -a      # and remove the swap line from /etc/fstab so it stays off

# 4. kubeadm, kubelet and kubectl from pkgs.k8s.io, held at one version
sudo apt-mark hold kubeadm kubelet kubectl
```

> 💡 Some CNI plugins also need the `br_netfilter` module and the `net.bridge.bridge-nf-call-iptables` sysctl. If a task's node prep mentions them, it's because of the network plugin. The "Installing kubeadm" and "Container Runtimes" pages on kubernetes.io have the exact current steps. Bookmark them in your head.

## Creating and joining

```bash
# first control-plane node
sudo kubeadm init --pod-network-cidr=10.244.0.0/16
mkdir -p $HOME/.kube && sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
# then install a CNI plugin; until you do, nodes stay NotReady

# on the control plane, print a fresh join command (tokens expire after 24h by default)
kubeadm token create --print-join-command

# on the worker, run what it printed:
sudo kubeadm join 10.0.0.10:6443 --token abcdef.0123456789abcdef \
  --discovery-token-ca-cert-hash sha256:<hash>
```

The `--pod-network-cidr` must match what your CNI plugin expects. Use whatever the task or the plugin's docs give you.

### A highly-available control plane, in concept

For HA you put a **load balancer** in front of several API servers and tell kubeadm about it with `--control-plane-endpoint`. You also share the control-plane certificates (`--upload-certs`) so further control-plane nodes can join with `kubeadm join … --control-plane`. etcd then runs either **stacked** (one member on each control-plane node, the kubeadm default) or **external** (its own cluster). Stacked is simpler. External survives the loss of a control-plane node without losing an etcd member too. Expect to explain this trade-off more than to build it from scratch in two hours.

## Upgrading: the exact order

🔑 **One minor version at a time, control plane before workers, and drain before you touch a node's kubelet.**

On the **first control-plane node**:

```bash
# point the package repo at the NEW minor version (pkgs.k8s.io has one repo per minor),
# e.g. edit /etc/apt/sources.list.d/kubernetes.list from v1.36 to v1.37
sudo apt-mark unhold kubeadm
sudo apt-get update && sudo apt-get install -y kubeadm='1.37.1-*'
sudo apt-mark hold kubeadm

kubeadm version
sudo kubeadm upgrade plan               # shows what it will do and which versions are available
sudo kubeadm upgrade apply v1.37.1      # upgrades the static Pods and their config

kubectl drain cp1 --ignore-daemonsets   # run where kubectl works
sudo apt-mark unhold kubelet kubectl
sudo apt-get install -y kubelet='1.37.1-*' kubectl='1.37.1-*'
sudo apt-mark hold kubelet kubectl
sudo systemctl daemon-reload && sudo systemctl restart kubelet
kubectl uncordon cp1
```

On **each worker**: upgrade kubeadm the same way, run `sudo kubeadm upgrade node` (not `apply`), then drain, upgrade kubelet and kubectl, restart the kubelet and uncordon.

> ⚠️ `kubeadm upgrade apply` is for the **first** control-plane node only. Other control-plane nodes and all workers use `kubeadm upgrade node`. Mixing them up is the classic upgrade mistake.

Verify with `kubectl get nodes`: the VERSION column shows each kubelet's version, and every node should report the new one and `Ready`.

## Backing up etcd

etcd holds the whole cluster state, so a snapshot is a whole-cluster backup. The current CKA bullet list doesn't name etcd backup explicitly, but it's part of managing a cluster's lifecycle, and it's a classic task worth being able to do.

```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /opt/etcd-backup.db
```

To restore, recent etcd versions use `etcdutl snapshot restore /opt/etcd-backup.db --data-dir /var/lib/etcd-restore`. Then point the etcd static Pod's data `hostPath` volume at the new directory. The certificate paths come straight from the flags in `/etc/kubernetes/manifests/etcd.yaml`, so read them there rather than remembering them.

## Certificates

```bash
sudo kubeadm certs check-expiration     # what expires when
sudo kubeadm certs renew all            # renew; then restart the control-plane static Pods
```

kubeadm also renews certificates automatically during every `upgrade apply`. That's one more reason regular upgrades keep a cluster healthy.

## Check yourself

1. Why does editing `/etc/kubernetes/manifests/kube-apiserver.yaml` change the running API server without any `kubectl` command?
2. A worker needs upgrading. Which kubeadm subcommand does it use, and what must happen to its workloads before you restart its kubelet?
3. Where would you look to find the certificate paths for an `etcdctl snapshot save` on an unfamiliar cluster?

## Key takeaways

- The control plane runs as **static Pods** from `/etc/kubernetes/manifests/`; the kubelet reacts to file changes.
- Node prep: a container runtime with the systemd cgroup driver, IP forwarding, swap handled, and held kubeadm/kubelet/kubectl versions.
- `kubeadm init` then `kubeadm join` (`token create --print-join-command` makes a fresh one). Install a CNI plugin or nodes stay NotReady.
- Upgrade **one minor at a time**: kubeadm → `upgrade plan` → `upgrade apply` (first control plane) or `upgrade node` (the rest) → drain → kubelet/kubectl → restart → uncordon.
- `etcdctl snapshot save` with the certs from the etcd manifest is a full-cluster backup.
