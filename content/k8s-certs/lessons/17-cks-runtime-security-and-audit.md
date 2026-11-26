# CKS: Runtime Security, Falco and Audit Logs

> **The one-sentence version:** Runtime security assumes something *will* go wrong, and makes sure you **notice** and that the damage is **contained**: **Falco** watches system calls for suspicious behaviour, **audit logs** record who did what through the API, and **immutable containers** (read-only filesystems, no shells, no privilege) give an attacker little to work with.

This is the CKS's "Monitoring, Logging and Runtime Security" domain, 20% of the exam. Its tasks are concrete: change a Falco rule, find the offending Pod, configure an audit policy, make a container immutable.

## Why it matters

Prevention eventually fails: a zero-day, a stolen token, a misconfiguration nobody caught. What separates a contained incident from a disaster is whether you saw it happen (detection), can reconstruct it (audit) and limited what the intruder could change (immutability).

## The attack phases, briefly

The curriculum asks you to *investigate and identify phases of attack*. A useful mental model is the sequence an attacker follows: **initial access** (an exploited app, a leaked credential), **execution** (a shell in a container), **persistence** (a new workload or CronJob), **privilege escalation** (a privileged Pod, a hostPath mount, a powerful token), then **lateral movement** and **exfiltration**. Falco catches execution and escalation as they happen; audit logs show the API actions behind persistence and escalation.

## Falco: behavioural detection

Falco watches kernel events (system calls) and matches them against **rules**. A rule has a condition and an output:

```yaml
- rule: Shell spawned in a container
  desc: A shell was started inside a container
  condition: spawned_process and container and proc.name in (bash, sh, zsh)
  output: "Shell in container (user=%user.name container=%container.id image=%container.image.repository cmd=%proc.cmdline)"
  priority: WARNING
```

| File | Purpose |
|---|---|
| `/etc/falco/falco_rules.yaml` | The default rules (don't edit; updates replace it) |
| `/etc/falco/falco_rules.local.yaml` | **Your** overrides and new rules |
| `/etc/falco/falco.yaml` | Main config: outputs (file, stdout, syslog), rule files to load |

🔑 **Override in `falco_rules.local.yaml`, not in the default rules file.** A rule with the same name defined later replaces the earlier one, so copy the rule you're changing into the local file and edit it there. Recent Falco versions also offer an `override:` key that replaces only chosen fields (for example just `output`); the "Overriding" section of the Falco rules docs shows both styles.

```bash
sudo systemctl list-units | grep falco     # the unit name depends on the driver
sudo journalctl -u falco-modern-bpf -f     # follow alerts (use your unit's name)
sudo falco -U                              # or run in the foreground (-U: unbuffered output)
```

A typical task is "change the output of rule X to include the container ID and the process name, and write the alerts to `/opt/falco.log`", followed by "find which Pod triggered it." Falco gives you a container ID. Map it to a Pod on that node with `sudo crictl ps --id <id>`, then `crictl inspect` it or match the Pod name and namespace in the output.

> 💡 falco.org/docs is allowed during the CKS. The "Supported Fields" page lists every `%field` you can put in an output (`container.id`, `k8s.pod.name`, `proc.name`, `user.name`, `fd.name`…).

## Kubernetes audit logs

The API server can record every request: who, what, when and the outcome. It's off until you give it a **policy** and a **destination**.

```yaml
# /etc/kubernetes/audit/policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
omitStages: ["RequestReceived"]
rules:
- level: RequestResponse                 # full bodies, for Secrets changes
  resources: [{ group: "", resources: ["secrets"] }]
  verbs: ["create", "update", "patch", "delete"]
- level: Metadata                        # who/what/when for everything in prod
  namespaces: ["prod"]
- level: None                            # skip noisy read-only system traffic
  users: ["system:kube-proxy"]
- level: Metadata                        # a catch-all at the end
```

| Level | Records |
|---|---|
| `None` | Nothing |
| `Metadata` | User, verb, resource, timestamp, response code; no bodies |
| `Request` | Metadata plus the request body |
| `RequestResponse` | Metadata plus request and response bodies |

🔑 **The first matching rule wins.** Put specific rules first and the catch-all last; a broad `Metadata` rule at the top would swallow everything before your detailed rules are reached.

Wire it into the API server's static Pod:

```yaml
- --audit-policy-file=/etc/kubernetes/audit/policy.yaml
- --audit-log-path=/var/log/kubernetes/audit/audit.log
- --audit-log-maxage=7          # days to keep
- --audit-log-maxbackup=2       # rotated files to keep
- --audit-log-maxsize=100       # MB before rotation
volumeMounts:
- { name: audit-policy, mountPath: /etc/kubernetes/audit/policy.yaml, readOnly: true }
- { name: audit-log, mountPath: /var/log/kubernetes/audit/ }
volumes:
- { name: audit-policy, hostPath: { path: /etc/kubernetes/audit/policy.yaml, type: File } }
- { name: audit-log, hostPath: { path: /var/log/kubernetes/audit/, type: DirectoryOrCreate } }
```

> ⚠️ Without the volume mounts, the API server can't see the policy file and won't start. Forgetting them is the most common audit-task mistake. Watch the Pod restart with `crictl ps`.

Then read the log, which is one JSON event per line:

```bash
sudo tail -n 5 /var/log/kubernetes/audit/audit.log | jq '{user: .user.username, verb, uri: .requestURI, code: .responseStatus.code}'
sudo grep '"resource":"secrets"' /var/log/kubernetes/audit/audit.log | jq -r .user.username | sort | uniq -c
```

## Immutable containers at runtime

An immutable container can't be changed while it runs: no new binaries, no edited configs.

```yaml
containers:
- name: web
  image: nginx:1.27
  securityContext:
    readOnlyRootFilesystem: true
    allowPrivilegeEscalation: false
    privileged: false
  volumeMounts:                         # writable only where the app truly needs it
  - { name: cache, mountPath: /var/cache/nginx }
  - { name: run, mountPath: /var/run }
volumes:
- { name: cache, emptyDir: {} }
- { name: run, emptyDir: {} }
```

A common task: "find the Pods in namespace `x` that are not immutable and delete them." Look for `privileged: true`, a missing or false `readOnlyRootFilesystem`, or a writable `hostPath`:

```bash
k get pods -n x -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].securityContext}{"\n"}{end}'
```

Removing shells and package managers from the image (distroless) adds to this, because even a successful exploit finds no tools to use.

## Check yourself

1. You need to change what an existing Falco rule prints. Which file do you edit, and why not the default rules file?
2. Your audit policy logs Secrets at `RequestResponse`, but only `Metadata` entries appear for them. What's the likely mistake?
3. What three settings make a container meaningfully immutable, and how do you keep a read-only app working when it needs to write a cache?

## Key takeaways

- **Falco** matches kernel events to rules; override rules in **`falco_rules.local.yaml`** and map container IDs to Pods with `crictl`.
- **Audit logs** need a policy file, a log path and **hostPath volume mounts** on the API server.
- In an audit policy, **the first matching rule wins**: specific rules first, the catch-all last.
- Levels: `None` < `Metadata` < `Request` < `RequestResponse`.
- **Immutability** = `readOnlyRootFilesystem`, no privilege or escalation, and `emptyDir` only where writes are truly needed.
