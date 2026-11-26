# CKAD: Probes, Debugging and API Deprecations

> **The one-sentence version:** **Probes** tell Kubernetes when a container is started, ready and alive. **Logs, events, `kubectl top` and `kubectl debug`** tell *you* what's going on. Watching **API deprecations** keeps manifests working when the cluster upgrades.

CKAD's "Application Observability and Maintenance" domain (15%) is the developer's side of troubleshooting: your app, your Pod, your manifests.

## Why it matters

A misconfigured probe is one of the most common ways to break a healthy app: restart loops from an over-eager liveness probe, or a Service with no endpoints from a readiness probe on the wrong port. Debugging a distroless container with no shell is a skill every modern developer needs. And an `apiVersion` that's been removed makes a manifest fail outright.

## The three probes

| Probe | Question it answers | On failure |
|---|---|---|
| **startupProbe** | "Has it finished starting?" | Keeps checking. Liveness and readiness wait until it succeeds; if it fails past its threshold, the container is restarted |
| **readinessProbe** | "Should it get traffic right now?" | Removed from Service endpoints (**not** restarted) |
| **livenessProbe** | "Is it wedged beyond recovery?" | The container is **restarted** |

```yaml
containers:
- name: api
  image: myapp:2.0
  ports: [{ containerPort: 8080 }]
  startupProbe:
    httpGet: { path: /healthz, port: 8080 }
    failureThreshold: 30          # 30 × 5s = up to 150s to start
    periodSeconds: 5
  readinessProbe:
    httpGet: { path: /ready, port: 8080 }
    periodSeconds: 5
  livenessProbe:
    httpGet: { path: /healthz, port: 8080 }
    periodSeconds: 10
    failureThreshold: 3
```

Probe mechanisms: `httpGet` (2xx/3xx is success), `tcpSocket` (the port accepts a connection), `exec` (the command exits 0), and `grpc` (the standard gRPC health check).

🔑 **Liveness restarts, readiness redirects.** Never make a liveness probe depend on something outside the container, such as a database. If the database blips, every replica restarts at once and turns a small outage into a big one. Dependencies belong in **readiness**.

> 💡 A slow-starting app plus a strict liveness probe gives you a restart loop that looks like a crash. The `startupProbe` exists precisely to give a slow start its own generous budget, so the liveness probe can stay strict.

## Built-in CLI tools for watching apps

```bash
k get pods -w                                     # watch status changes live
k get events -n shop --sort-by=.lastTimestamp     # recent events, oldest first
k describe pod api-7d4f-x2k9p                     # probes, state, last state, events
k top pod -n shop --containers                    # CPU/memory (needs metrics-server)
k logs api-7d4f-x2k9p -c api --previous           # the crashed container's output
k logs deploy/api --since=5m -f
```

`RESTARTS` climbing in `k get pods` combined with a liveness failure event in `describe` is the signature of a probe that's too aggressive or pointed at the wrong path.

## Debugging in Kubernetes

When the image has no shell or tools, attach a temporary **ephemeral container** with `kubectl debug`:

```bash
# add a debugging container that shares the target's process namespace
k debug -it api-7d4f-x2k9p --image=busybox:1.36 --target=api -- sh
#   now: ps aux shows the app's processes; wget localhost:8080 hits it

# copy a crashing Pod and change its command, so you can poke around
k debug api-7d4f-x2k9p -it --copy-to=api-debug --container=api -- sh

# a shell on a node (the node's root filesystem is mounted at /host)
k debug node/worker1 -it --image=busybox:1.36
```

And the classic network check from a throwaway Pod:

```bash
k run curl --rm -it --image=curlimages/curl:8.11.1 --restart=Never -- \
  curl -sv http://api.shop.svc.cluster.local:8080/ready
```

🔑 **Debug from where the client is.** A request that works from inside the Pod but not from another Pod points at the Service or a NetworkPolicy, not at the app.

## API deprecations

Kubernetes removes old API versions on a published schedule. A manifest written for `extensions/v1beta1` Ingress or `batch/v1beta1` CronJob fails to apply on a modern cluster with "no matches for kind."

```bash
k api-resources | grep -i cronjob        # NAME, SHORTNAMES, APIVERSION, NAMESPACED, KIND
k api-versions | grep batch              # batch/v1 (v1beta1 is long gone)
k explain cronjob | head -3              # GROUP and VERSION of the served kind
```

To fix an old manifest, change `apiVersion` to the current one and adjust any fields that changed between versions (`kubectl explain` shows the current shape). The **Deprecated API Migration Guide** on kubernetes.io lists every removal and what replaces it, and it's allowed during the exam.

> 💡 The API server also returns a **warning** when you use a deprecated (not yet removed) version: `Warning: batch/v1beta1 CronJob is deprecated…`. Treat those warnings as a to-do list, not noise.

## Check yourself

1. Your app takes 90 seconds to start, and its liveness probe begins after 10 seconds. What happens, and what's the cleanest fix?
2. Why shouldn't a liveness probe check the database connection?
3. A container image has no shell. How do you look at its processes and network from inside the Pod?

## Key takeaways

- **startup** gates the others, **readiness** controls traffic (no restart), **liveness** restarts.
- Keep liveness checks local to the container; put dependency checks in readiness.
- `events --sort-by`, `describe`, `logs --previous` and `top` are your observation toolkit.
- `k debug` adds an ephemeral container (`--target` to share processes), copies a Pod, or opens a node shell.
- Fix removed `apiVersion`s using `api-resources`, `explain` and the Deprecated API Migration Guide.
