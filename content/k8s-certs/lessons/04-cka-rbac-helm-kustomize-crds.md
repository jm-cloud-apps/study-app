# CKA: RBAC, Helm, Kustomize and Extending Kubernetes

> **The one-sentence version:** RBAC answers "**who** may do **what** to **which** resources": a Role lists verbs on resources, and a RoleBinding hands it to a user, group or ServiceAccount. Helm, Kustomize, CRDs and operators are how you install and extend what the cluster can do.

This lesson covers the rest of the CKA's architecture domain: access control and the extension story. Both reward a clear mental model more than memorised YAML.

## Why it matters

"Give the ServiceAccount `deployer` permission to manage Deployments in `ci`" is a near-certain task shape. So is "install this chart with these values" or "add this patch with Kustomize." And because operators and CRDs are now named in the curriculum, you should be comfortable meeting a resource type you've never seen and finding out what it does.

## RBAC in four objects

| Object | Scope | Says |
|---|---|---|
| **Role** | One namespace | "These verbs on these resources, here" |
| **ClusterRole** | Cluster-wide | The same, for cluster-scoped resources (nodes, PVs) or for reuse across namespaces |
| **RoleBinding** | One namespace | "Grant this Role (or ClusterRole) to these subjects, here" |
| **ClusterRoleBinding** | Cluster-wide | "Grant this ClusterRole to these subjects, everywhere" |

🔑 **A RoleBinding can reference a ClusterRole.** The permissions then apply only inside the binding's namespace. That's how you reuse one "pod-reader" definition across many namespaces without granting it cluster-wide.

```bash
k create role deploy-mgr -n ci --verb=get,list,watch,create,update,patch,delete \
  --resource=deployments
k create rolebinding deploy-mgr -n ci --role=deploy-mgr --serviceaccount=ci:deployer

# verify, as that identity
k auth can-i create deployments -n ci --as=system:serviceaccount:ci:deployer   # yes
k auth can-i delete pods -n ci --as=system:serviceaccount:ci:deployer          # no
```

> 💡 Resource names in `--resource` are plural and lowercase (`deployments`, `pods`, `secrets`). A subresource such as Pod logs is written `pods/log`. `k api-resources` lists every resource name with its API group and whether it's namespaced.

### Users come from certificates

Kubernetes has no user database. A "user" is whoever presents a client certificate signed by the cluster CA (or a token from a configured authenticator). The certificate's CN becomes the username and its O fields become groups. To onboard a user through the API:

```bash
openssl genrsa -out jane.key 2048
openssl req -new -key jane.key -subj "/CN=jane/O=dev" -out jane.csr
# wrap it in a CertificateSigningRequest object:
#   apiVersion: certificates.k8s.io/v1, kind: CertificateSigningRequest
#   spec.request: base64 of jane.csr (one line)
#   spec.signerName: kubernetes.io/kube-apiserver-client
#   spec.usages: ["client auth"]
k apply -f jane-csr.yaml
k certificate approve jane
k get csr jane -o jsonpath='{.status.certificate}' | base64 -d > jane.crt
```

Then bind a Role to `User` `jane` (or the `Group` `dev`) the same way as for a ServiceAccount.

## Helm: installing packaged applications

A **chart** is a bundle of templated manifests. A **release** is one installed copy of it.

```bash
helm repo add acme https://charts.acme.example     # the URL comes from the task
helm repo update
helm search repo acme
helm show values acme/web | less               # what can be configured
helm install web acme/web -n web --create-namespace --set replicaCount=2
helm list -A                                   # releases in every namespace
helm upgrade web acme/web -n web --set replicaCount=3
helm history web -n web
helm rollback web 1 -n web
helm uninstall web -n web
helm template web acme/web --set replicaCount=2    # render locally, install nothing
```

`-f values.yaml` applies a whole file of overrides, and `--version` pins a chart version. `acme` is a made-up example: in the exam, use exactly the repository name and URL the task gives you.

## Kustomize: patching YAML without templating

Kustomize is built into kubectl. A directory with a `kustomization.yaml` describes a base set of manifests plus changes:

```yaml
# overlays/prod/kustomization.yaml
resources:
  - ../../base
namespace: prod
namePrefix: prod-
images:
  - name: nginx
    newTag: "1.27.1"
patches:
  - path: replicas.yaml          # a partial Deployment with just spec.replicas
```

```bash
k kustomize overlays/prod        # render and show the result; changes nothing
k apply -k overlays/prod         # apply the rendered result
```

🔑 **Helm templates, Kustomize patches.** Helm fills placeholders in templates with values. Kustomize starts from plain, valid YAML and layers changes on top. Both are on the CKA (and the CKAD), and the curriculum frames them as ways to *install cluster components*, such as a CNI plugin, an ingress controller or an operator.

## CRDs and operators

A **CustomResourceDefinition** teaches the API server a new resource type. Once a CRD for `Certificate` exists, `k get certificates` works like any built-in type. On its own a CRD only stores objects. An **operator** is a controller that watches those objects and does the work they describe.

When you meet an unfamiliar custom resource:

```bash
k get crd                                  # what's been added
k api-resources --api-group=cert-manager.io
k explain certificate.spec                 # the schema, from the live CRD
k get certificates -A
k describe certificate web-tls -n web      # the operator writes status and events here
```

Installing an operator is usually "apply its manifests" or "install its Helm chart". After that you create its custom resources and check its controller Pod's logs if nothing happens.

## Extension interfaces: CNI, CSI, CRI

Kubernetes delegates three jobs to plugins through standard interfaces:

| Interface | Delegates | Examples |
|---|---|---|
| **CRI** (Container Runtime Interface) | Running containers on a node | containerd, CRI-O |
| **CNI** (Container Network Interface) | Pod networking and IPs | Calico, Cilium, Flannel |
| **CSI** (Container Storage Interface) | Provisioning and attaching volumes | Cloud disks, Ceph, NFS drivers |

`crictl` talks to the CRI runtime directly (`crictl ps`, `crictl logs`, `crictl images`), which is invaluable when the API server itself is down. CNI configuration lives in `/etc/cni/net.d/` on each node. CSI drivers appear as `k get csidrivers`.

## Check yourself

1. You bound a ClusterRole to a ServiceAccount with a RoleBinding in namespace `ci`. Can it read Pods in `default`? Why or why not?
2. How would you confirm, without logging in as it, that a ServiceAccount can list Secrets in `prod`?
3. When would you reach for Kustomize rather than Helm?

## Key takeaways

- **Role/ClusterRole say what; RoleBinding/ClusterRoleBinding say who and where.** A RoleBinding to a ClusterRole is scoped to one namespace.
- Verify every RBAC task with `k auth can-i … --as=…`.
- Users are certificate identities; the CSR API plus `k certificate approve` issues them.
- **Helm** installs templated charts as releases (`install`, `upgrade`, `rollback`); **Kustomize** patches plain YAML (`k apply -k`).
- CRDs add types, operators act on them, and `k explain` works on both. CNI, CSI and CRI are where networking, storage and runtimes plug in.
