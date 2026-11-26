# CKA: Services, Network Policies, Ingress and the Gateway API

> **The one-sentence version:** Every Pod can reach every other Pod by default. **Services** give a stable name and IP to a changing set of Pods, **NetworkPolicies** take reachability away, and **Ingress** and the newer **Gateway API** bring outside HTTP traffic in. CoreDNS ties the names together.

"Services & Networking" is 20% of the CKA and overlaps heavily with the CKAD. It's also where troubleshooting tasks love to hide: a Service with no endpoints, a policy that blocks DNS, a route pointing at the wrong port.

## Why it matters

Almost every application task ends with "and make it reachable." Knowing exactly how a request travels from client → Service → Pod is what lets you fix the broken link quickly instead of guessing.

## The networking model in three rules

1. **Every Pod gets its own IP**, and Pods can reach each other across nodes without NAT. The CNI plugin makes this true.
2. **Services select Pods by label**, not by name. The Service's selector produces an **EndpointSlice**, the list of ready Pod IPs behind it.
3. **NetworkPolicies are additive allow-lists.** Once any policy selects a Pod for a direction (ingress or egress), only what some policy allows in that direction gets through.

## Service types

| Type | Reachable from | Notes |
|---|---|---|
| `ClusterIP` (default) | Inside the cluster | A virtual IP plus a DNS name |
| `NodePort` | `<any-node-IP>:<port>` | Port from 30000–32767 by default; builds on ClusterIP |
| `LoadBalancer` | An external IP | Asks the cloud (or something like MetalLB) for a load balancer; builds on NodePort |
| Headless (`clusterIP: None`) | DNS only | DNS returns the Pod IPs directly; used by StatefulSets |

```bash
k expose deploy web --port=80 --target-port=8080 --name=web-svc
k get endpointslices -l kubernetes.io/service-name=web-svc
k get svc web-svc -o wide
```

🔑 **"Service has no endpoints" is almost always a label mismatch or unready Pods.** Compare the Service's `selector` with the Pods' labels (`k get pods --show-labels`), and check that the Pods are `READY`. A failing readiness probe removes a Pod from the endpoints on purpose.

`port` is what clients connect to on the Service; `targetPort` is the container port traffic goes to. Getting those two backwards is the most common Service bug.

## DNS with CoreDNS

CoreDNS runs in `kube-system` behind a Service named `kube-dns`, configured by the `coredns` ConfigMap (its `Corefile`).

| Name | Resolves to |
|---|---|
| `web-svc` | The Service, from a Pod in the **same** namespace |
| `web-svc.shop` | The Service in namespace `shop` |
| `web-svc.shop.svc.cluster.local` | The fully qualified name |
| `10-244-1-7.shop.pod.cluster.local` | A Pod by its dashed IP |

```bash
k run dns-test --rm -it --image=busybox:1.36 --restart=Never -- nslookup web-svc.shop
```

If names won't resolve, check that the CoreDNS Pods are running (`k -n kube-system get pods -l k8s-app=kube-dns`) and that no NetworkPolicy blocks egress on port 53.

## NetworkPolicies

🔑 **Start from "deny all", then allow exactly what's needed.**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: shop }
spec:
  podSelector: {}                     # every Pod in the namespace
  policyTypes: [Ingress, Egress]      # no rules listed = nothing allowed
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: api-from-frontend, namespace: shop }
spec:
  podSelector: { matchLabels: { app: api } }
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: { matchLabels: { app: frontend } }   # same namespace
    - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: monitoring } }
    ports:
    - { protocol: TCP, port: 8080 }
```

> ⚠️ **Watch the dash.** Under `from:`, two separate list items (`- podSelector`, `- namespaceSelector`) mean **OR**. One item holding both selectors means **AND**: Pods with that label *in* those namespaces. This one character is the most-tested NetworkPolicy subtlety there is.

> ⚠️ An egress deny also blocks DNS. If you deny egress, add a rule allowing UDP and TCP port 53 to the `kube-dns` Pods, or names stop resolving and everything looks broken.

Every namespace automatically carries the label `kubernetes.io/metadata.name: <name>`, which makes `namespaceSelector` easy. Policies are enforced only if the CNI plugin supports them; Calico and Cilium do, plain Flannel doesn't.

## Ingress

An **Ingress** routes HTTP(S) by host and path to Services. It does nothing on its own: an **Ingress controller** must be running, and `ingressClassName` picks which one handles it.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata: { name: shop, namespace: shop }
spec:
  ingressClassName: nginx
  tls:
  - hosts: ["shop.example.com"]
    secretName: shop-tls                # a kubernetes.io/tls Secret
  rules:
  - host: shop.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend: { service: { name: api, port: { number: 8080 } } }
```

`k get ingressclass` shows the controllers available.

## The Gateway API

The Gateway API is Ingress's successor, and the CKA now asks you to use it to manage ingress traffic. It splits responsibilities across roles:

| Resource | Owned by | Says |
|---|---|---|
| **GatewayClass** | Infrastructure provider | "This controller implements gateways" (like an IngressClass) |
| **Gateway** | Cluster operator | "Listen on port 443 for `*.example.com`, with this certificate" |
| **HTTPRoute** | Application team | "Send `/api` on `shop.example.com` to Service `api:8080`" |

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: shop, namespace: shop }
spec:
  parentRefs:
  - name: main-gateway                 # the Gateway this route attaches to
    namespace: infra
  hostnames: ["shop.example.com"]
  rules:
  - matches:
    - path: { type: PathPrefix, value: /api }
    backendRefs:
    - { name: api, port: 8080 }
```

🔑 **HTTPRoute `backendRefs` take a `weight`.** Splitting traffic 90/10 between `api-v1` and `api-v2` is built in, which makes canary releases a standard feature rather than a controller-specific annotation.

`k get gateway -A` and `k describe httproute shop` show whether the route was **Accepted** by its parent Gateway; the status conditions explain a rejection. The CKA allows gateway-api.sigs.k8s.io during the exam, and its "Getting started" pages have every skeleton you need.

## Check yourself

1. A Service exists and its Pods are running, but `curl` to the Service times out. List the three things you'd check first, in order.
2. Under `ingress.from`, what's the difference between one list item with a `podSelector` and a `namespaceSelector`, and two list items with one each?
3. In the Gateway API, which resource would an application team edit to send 10% of traffic to a new version?

## Key takeaways

- Pods are all mutually reachable by default; **Services** select Pods by label and expose them through EndpointSlices.
- No endpoints usually means a **selector mismatch or unready Pods**. Mind `port` vs `targetPort`.
- DNS: `svc.namespace.svc.cluster.local`, served by CoreDNS (`kube-dns` Service, `coredns` ConfigMap).
- NetworkPolicies are allow-lists. Default-deny first, **mind the dash (OR vs AND)**, and don't forget DNS egress.
- Ingress needs a controller; the **Gateway API** splits roles into GatewayClass → Gateway → HTTPRoute, with weighted backends built in.
