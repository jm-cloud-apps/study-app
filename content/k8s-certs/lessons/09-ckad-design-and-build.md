# CKAD: Designing and Building Applications

> **The one-sentence version:** CKAD's "Application Design and Build" domain asks you to **build a container image**, **choose the right workload type** (Deployment, StatefulSet, DaemonSet, Job, CronJob), **compose Pods from several containers** (init containers and sidecars), and give them the right **volumes**.

This is where the CKAD begins: before you can deploy, scale or debug an application, you have to package it and pick the right shape for it.

## Why it matters

Picking the wrong workload type is a quiet mistake that grading catches: a batch task done as a Deployment never "completes", and a per-node agent done as a Deployment doesn't run on every node. Multi-container patterns show up constantly, because they're how real apps add logging, proxies and setup steps without changing the main container.

## Building an image

The exam hosts provide a container tool for build tasks. Use whichever the task names (Docker or Podman, which are command-compatible for these basics).

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER 1001
CMD ["python", "app.py"]
```

```bash
podman build -t myapp:1.0 .            # or: docker build -t myapp:1.0 .
podman images | grep myapp
podman save -o /opt/myapp.tar myapp:1.0     # "export the image to a tarball"
podman tag myapp:1.0 registry.local:5000/myapp:1.0
podman push registry.local:5000/myapp:1.0
```

> 💡 Read build tasks closely for the exact tag, file path and output format. "Save the image as an OCI archive" means `--format oci-archive` with `podman save`. When in doubt, `podman save --help` lists the formats.

The **Containers & Docker** topic covers layers, caching and multi-stage builds in depth; for the exam, the commands above are the core.

## Choosing the workload type

| Need | Workload | Why |
|---|---|---|
| Stateless replicas, rolling updates | **Deployment** | The default for web apps and APIs |
| Stable identity and per-replica storage | **StatefulSet** | Pods are `db-0`, `db-1`… with their own PVCs, started in order |
| One Pod on every (matching) node | **DaemonSet** | Log shippers, node agents, CNI components |
| Run to completion once | **Job** | Migrations, batch processing |
| Run to completion on a schedule | **CronJob** | Nightly reports, cleanup |

🔑 **Ask "does it finish?" first.** If the work ends, it's a Job or CronJob, and its Pods use `restartPolicy: Never` or `OnFailure`. If it runs forever, it's a Deployment, StatefulSet or DaemonSet.

### Jobs and CronJobs in detail

```yaml
apiVersion: batch/v1
kind: Job
metadata: { name: resize }
spec:
  completions: 6            # total successful Pods needed
  parallelism: 2            # how many at once
  backoffLimit: 3           # retries before the Job is marked failed
  activeDeadlineSeconds: 300
  template:
    spec:
      restartPolicy: Never
      containers:
      - { name: worker, image: busybox:1.36, command: ["sh", "-c", "echo resizing; sleep 5"] }
```

```bash
k create cronjob report --image=busybox:1.36 --schedule="0 2 * * *" $do -- sh -c 'date' > cj.yaml
k create job report-now --from=cronjob/report      # run a CronJob once, right now
k get jobs,pods -l job-name=report-now
```

CronJob fields worth knowing: `concurrencyPolicy` (`Allow`, `Forbid`, `Replace`), `successfulJobsHistoryLimit`, `failedJobsHistoryLimit`, and `startingDeadlineSeconds`.

## Multi-container Pods

Containers in one Pod share the **network namespace** (they talk over `localhost`) and can share **volumes**. The curriculum names the patterns:

| Pattern | What it does | How it's declared |
|---|---|---|
| **Init container** | Runs to completion **before** the app starts (wait for a DB, fetch config) | `initContainers:` |
| **Sidecar** | Runs **alongside** the app for its whole life (log shipper, proxy) | `initContainers:` with `restartPolicy: Always` |
| **Ambassador** | A sidecar proxy for outbound connections | A sidecar, by role |
| **Adapter** | A sidecar that reshapes output (e.g. metrics format) | A sidecar, by role |

🔑 **Native sidecars are init containers that keep running.** Since Kubernetes 1.33 (stable), giving an init container `restartPolicy: Always` makes it a sidecar: it starts before the app containers, keeps running alongside them, and is stopped after them. Before that feature, sidecars were just extra entries in `containers:`, which still works but gives no start-order guarantee.

```yaml
spec:
  initContainers:
  - name: wait-for-db
    image: busybox:1.36
    command: ["sh", "-c", "until nc -z db 5432; do sleep 2; done"]
  - name: log-shipper                    # native sidecar
    image: busybox:1.36
    restartPolicy: Always
    command: ["sh", "-c", "tail -F /var/log/app/app.log"]
    volumeMounts: [{ name: logs, mountPath: /var/log/app }]
  containers:
  - name: app
    image: myapp:1.0
    volumeMounts: [{ name: logs, mountPath: /var/log/app }]
  volumes:
  - name: logs
    emptyDir: {}
```

Init containers run **in order**, each to completion, before the next starts. A Pod stuck at `Init:0/2` is waiting on its first init container, so `k logs <pod> -c wait-for-db` shows why.

## Persistent and ephemeral volumes

The CKAD expects you to choose sensibly:

- **`emptyDir`** for scratch space or for sharing files between containers in one Pod. It's deleted with the Pod.
- **`configMap` / `secret`** volumes for configuration files.
- **A PersistentVolumeClaim** when data must outlive the Pod. Reference the claim by name in `volumes:` (the CKA storage lesson covers claims in depth).
- **StatefulSet `volumeClaimTemplates`** when each replica needs its own claim.

```bash
k explain statefulset.spec.volumeClaimTemplates
```

## Check yourself

1. A task says "process the queue once and stop." A colleague wrote a Deployment. What's wrong, and what should it be?
2. What's the difference between a container listed under `containers:` and an init container with `restartPolicy: Always`?
3. A Pod sits at `Init:1/2`. What does that tell you, and which command shows the cause?

## Key takeaways

- Build with `podman`/`docker build -t`, export with `save -o`, and follow the task's exact tag and format.
- **Does it finish?** Job/CronJob. **Forever?** Deployment (stateless), StatefulSet (identity + storage), DaemonSet (per node).
- Init containers run first, in order; **native sidecars** are init containers with `restartPolicy: Always`.
- Containers in a Pod share `localhost` and can share volumes; `emptyDir` is the usual shared scratch space.
- Choose ephemeral volumes for scratch and config, PVCs for data that must survive the Pod.
