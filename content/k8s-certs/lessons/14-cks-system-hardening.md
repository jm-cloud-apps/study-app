# CKS: System Hardening with AppArmor and seccomp

> **The one-sentence version:** System hardening shrinks what the **node** and the **kernel** expose: fewer packages, services and open ports on the host, least-privilege identities, and kernel-level confinement, with **AppArmor** limiting which files and capabilities a process may use and **seccomp** limiting which system calls it may make.

This domain is 10% of the CKS. Its two kernel tools appear in tasks often, because each one is a precise, checkable change to a Pod spec.

## Why it matters

Containers share the host's kernel. If a process inside one can make any system call or write anywhere it likes, a single bug becomes a host compromise. AppArmor and seccomp put a fence between the container and the kernel that holds even if the application is compromised.

## Minimising the host

Fewer things running means fewer things to exploit:

```bash
systemctl list-units --type=service --state=running   # what's actually running?
sudo systemctl disable --now cups bluetooth           # stop and disable what isn't needed
ss -tlnp                                              # what's listening, and which process owns it
sudo apt purge <package>                              # remove what shouldn't be installed
```

Tasks often look like "a service is listening on port 8080 on node X; find what it is and stop it permanently." `ss -tlnp` names the process; `systemctl status <pid>` maps a PID to its unit; then `disable --now`.

Least-privilege identity on the host means the same as in the cluster: no shared root logins, SSH keys instead of passwords, and `sudo` for specific needs. For network exposure, firewall node ports to what's needed (`ufw` or the cloud security group).

## AppArmor

AppArmor is a Linux Security Module that confines a program according to a **profile**: which files it may read or write, which capabilities it may use, and whether it may use the network.

On the node:

```bash
sudo aa-status                                    # loaded profiles and their modes
sudo apparmor_parser -q /etc/apparmor.d/k8s-deny-write   # load (or reload with -r) a profile
sudo aa-status | grep k8s-deny-write              # confirm it's loaded, in enforce mode
```

🔑 **The profile must be loaded on the node where the Pod runs.** Kubernetes doesn't distribute AppArmor profiles. If the profile isn't loaded on that node, the container fails to start, and `describe` tells you so. In a task, load it on the named node and make sure the Pod lands there (a `nodeName` or `nodeSelector`).

In the Pod spec (the `securityContext` field has been the way since Kubernetes 1.30; the older annotation is deprecated):

```yaml
spec:
  nodeName: worker1                     # where the profile is loaded
  containers:
  - name: app
    image: nginx:1.27
    securityContext:
      appArmorProfile:
        type: Localhost
        localhostProfile: k8s-deny-write   # the profile's NAME, not its file path
```

`type` can also be `RuntimeDefault` (the container runtime's default profile) or `Unconfined`. Verify from inside the container: `k exec app -- cat /proc/1/attr/current` shows the profile name and mode, and a write the profile forbids fails with "Permission denied."

> 💡 The profile **name** is declared inside the file (`profile k8s-deny-write flags=(attach_disconnected) { … }`) and may differ from the filename. `aa-status` shows the loaded names, so use what it prints.

## seccomp

seccomp filters **system calls**. A profile is JSON with a default action and a list of syscalls with their own actions.

```yaml
spec:
  securityContext:
    seccompProfile:
      type: RuntimeDefault              # the runtime's sensible default filter
```

🔑 **`RuntimeDefault` is the easy, strong win.** It blocks dozens of rarely needed, dangerous syscalls, and the Pod Security `restricted` level requires it (or a Localhost profile). Many tasks are simply "make these Pods use the runtime's default seccomp profile."

For a custom profile, the file goes in the kubelet's seccomp directory on the node, which defaults to **`/var/lib/kubelet/seccomp/`**, and the Pod references it by a path **relative to that directory**:

```bash
sudo mkdir -p /var/lib/kubelet/seccomp/profiles
sudo cp audit.json /var/lib/kubelet/seccomp/profiles/audit.json
```

```yaml
securityContext:
  seccompProfile:
    type: Localhost
    localhostProfile: profiles/audit.json     # relative to /var/lib/kubelet/seccomp/
```

A minimal profile that logs every syscall instead of blocking it, useful for discovering what an app needs:

```json
{ "defaultAction": "SCMP_ACT_LOG" }
```

and one that allows a list and blocks everything else:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    { "names": ["read", "write", "exit_group", "futex", "nanosleep"], "action": "SCMP_ACT_ALLOW" }
  ]
}
```

> ⚠️ A tight allow-list profile can stop a container from even starting, because runtimes and shells need more syscalls than you'd guess. In practice you either use `RuntimeDefault` or the profile the task hands you. Build allow-lists only from observed behaviour.

## AppArmor vs seccomp

| | AppArmor | seccomp |
|---|---|---|
| Controls | Files, capabilities, network access, per program | Which **syscalls** can be made |
| Profile lives | Loaded into the kernel on each node (`apparmor_parser`) | A JSON file in the kubelet's seccomp dir, or the runtime default |
| Pod field | `securityContext.appArmorProfile` | `securityContext.seccompProfile` |
| Quick win | `RuntimeDefault` | `RuntimeDefault` |

They complement each other, and combining them with `allowPrivilegeEscalation: false`, dropped capabilities and a non-root user is defence in depth.

## Check yourself

1. A Pod referencing a Localhost AppArmor profile is stuck failing to start on one node but runs on another. What's the likely cause?
2. Where does a custom seccomp profile file go, and how does the Pod spec refer to it?
3. Why is `RuntimeDefault` usually a better first step than writing your own seccomp allow-list?

## Key takeaways

- Harden the host first: disable unneeded services, find listeners with `ss -tlnp`, and remove packages.
- **AppArmor** profiles are loaded per node (`apparmor_parser`, `aa-status`) and referenced by **name** in `securityContext.appArmorProfile`.
- **seccomp** profiles live under `/var/lib/kubelet/seccomp/` and are referenced by **relative path**; `RuntimeDefault` is the strong default.
- Make sure the Pod runs on the node where its AppArmor profile is loaded.
- Combine both with non-root, no privilege escalation and dropped capabilities.
