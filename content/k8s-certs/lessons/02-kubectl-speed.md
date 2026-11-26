# kubectl Speed: Generate, Don't Type

> **The one-sentence version:** Almost every object on these exams can be **generated** by an imperative `kubectl` command with `--dry-run=client -o yaml`, so you rarely write YAML from scratch. You generate a skeleton, edit the two lines the task cares about, apply it and verify.

Two hours for 15–20 tasks is about six to eight minutes each, and that includes reading the task. The candidates who finish comfortably aren't faster typists. They type *less*.

## Why it matters

Hand-written YAML is slow and error-prone: one wrong indent and `kubectl apply` complains, or worse, a field lands in the wrong place and is silently ignored. Generated YAML is correctly shaped every time. Your job shrinks to "add the field the generator doesn't support."

## The pattern you'll use fifty times

```bash
export do="--dry-run=client -o yaml"        # set once per SSH session

k run web --image=nginx:1.27 $do > web.yaml   # a Pod
k create deploy api --image=nginx:1.27 --replicas=3 $do > api.yaml
vi api.yaml                                   # add the field the generator lacks
k apply -f api.yaml
k get deploy api                              # verify
```

🔑 **Write the file, then apply it.** Keeping `api.yaml` on disk means a mistake is a quick `vi` and re-apply, not a rebuild from memory. Name files after the task (`t7-netpol.yaml`) so you can find them again when you revisit a flagged task.

> 💡 The `export` lives in the current shell only. Each new `ssh` to a task host starts fresh, so re-run it (or just type the flags; completion helps).

## Generators worth knowing cold

| Object | Command |
|---|---|
| Pod | `k run p --image=busybox:1.36 --restart=Never -- sleep 3600` |
| Deployment | `k create deploy d --image=nginx --replicas=2 --port=80` |
| Service for a Deployment | `k expose deploy d --port=80 --target-port=8080 --type=NodePort` |
| ConfigMap | `k create cm app-cfg --from-literal=MODE=prod --from-file=app.conf` |
| Secret | `k create secret generic db --from-literal=password=s3cret` |
| TLS Secret | `k create secret tls web-tls --cert=tls.crt --key=tls.key` |
| Job | `k create job once --image=busybox -- date` |
| CronJob | `k create cronjob tick --image=busybox --schedule="*/5 * * * *" -- date` |
| ServiceAccount | `k create sa builder` |
| Role / RoleBinding | `k create role r --verb=get,list --resource=pods` then `k create rolebinding rb --role=r --serviceaccount=ns:builder` |
| ResourceQuota | `k create quota q --hard=pods=10,requests.cpu=2,limits.memory=4Gi` |
| Ingress | `k create ingress web --rule="shop.example.com/*=web:80"` |
| Token for a ServiceAccount | `k create token builder` |

Everything after `--` in `k run` and `k create job` becomes the container's command. That's an easy way to give a test Pod something to do.

## Don't guess field names: `kubectl explain`

```bash
k explain pod.spec.containers.securityContext            # one level, with descriptions
k explain deploy.spec.strategy.rollingUpdate
k explain pod.spec --recursive | less                    # the whole tree, field names only
```

`explain` reads the schema from the live API server, so it's always right for the cluster's version, including CRDs that operators install. It's often faster than finding the right docs page.

## Moving around without getting lost

```bash
k config get-contexts                                    # where am I? (* marks current)
k config use-context k8s-b
k config set-context --current --namespace=payments     # default namespace for this context
k get pods -A                                            # all namespaces at once
k get all -n payments                                    # a quick look at a namespace
```

> ⚠️ Setting a default namespace is a speed win, but it's also a trap if you forget you did it. When a later task says "in `default`", either pass `-n default` or reset the context's namespace.

## Reading the cluster precisely

Some tasks ask you to *find* something and write it to a file. Learn three output tools:

```bash
k get pods -o wide                                       # node and Pod IP columns
k get pods --sort-by=.metadata.creationTimestamp
k get pods -l app=web --show-labels

# jsonpath: pull exact fields
k get nodes -o jsonpath='{.items[*].metadata.name}'
k get pod web -o jsonpath='{.spec.containers[0].image}'
k get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.nodeInfo.kubeletVersion}{"\n"}{end}'

# custom-columns: a quick table
k get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName

# the busiest Pod (needs metrics-server)
k top pods -A --sort-by=cpu | head -5
```

When a task says "write the name of … to `/opt/answers/t3.txt`", redirect the exact command output (`> /opt/answers/t3.txt`) rather than retyping it, then `cat` the file to check it.

## Editing live objects safely

| Tool | When |
|---|---|
| `k edit deploy api` | Quick changes to fields that can change in place |
| `k set image deploy/api nginx=nginx:1.27.1` | Changing an image (this triggers a rollout) |
| `k scale deploy api --replicas=5` | Replica count |
| `k label` / `k annotate` | Metadata |
| `k replace --force -f pod.yaml` | Pods, whose spec mostly can't change in place |

Most of a running Pod's spec is immutable. If `k edit pod` refuses to save, kubectl writes your edited copy to a temp file under `/tmp` and prints its path. `k replace --force -f /tmp/kubectl-edit-….yaml` deletes and recreates the Pod with your change.

## A tiny vi survival kit

If vi isn't your daily editor, these keystrokes are enough:

- `i` to insert, `Esc` to stop, `:wq` to save and quit, `:q!` to bail out.
- `dd` deletes a line, `u` undoes, and `/text` searches.
- `:set paste` before pasting YAML stops auto-indent from mangling it.
- `>>` and `<<` indent and unindent a line by one `shiftwidth`.

Some people add `set expandtab tabstop=2 shiftwidth=2` to `~/.vimrc` at the start, so a tab never sneaks into YAML (YAML forbids tab indentation).

## Check yourself

1. You need a Deployment with a `readinessProbe`. Which part do you generate, and which part do you add by hand?
2. `k edit pod web` won't save your change to the container image's command. What's happening, and how do you get the change applied?
3. How would you write just the Pod IPs of every Pod labelled `app=web` into a file?

## Key takeaways

- **Generate skeletons** with `--dry-run=client -o yaml`, save them to a file, edit, apply, verify.
- `kubectl explain` (with `--recursive`) is a schema reference that is always right for the live cluster.
- **Set the context first**, and be deliberate about default namespaces.
- `jsonpath`, `custom-columns` and `--sort-by` turn "find X" tasks into one command; redirect it straight to the answer file.
- Running Pods are mostly immutable, so `replace --force` is the honest way to change them.
