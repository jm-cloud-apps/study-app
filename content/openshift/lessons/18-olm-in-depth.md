# OLM in Depth: CRDs, CSVs, and Failing Subscriptions

> **The one-sentence version:** Operator Lifecycle Manager turns "install this Operator" into a chain of objects — CatalogSource → Subscription → InstallPlan → ClusterServiceVersion → CRDs — and troubleshooting OLM is really just walking that chain to find the first link that didn't resolve.

Lesson 12 introduced the Operator pattern. This one goes a level deeper, because on a real cluster the question is rarely "what is an Operator?" — it's "why has this Subscription been stuck for two hours?"

## Why it matters

Almost every capability you add to OpenShift arrives as an Operator: logging, service mesh, GitOps, pipelines, storage, virtualization, your database. When an Operator install hangs or an upgrade half-lands, the symptom the user reports is "my CRD doesn't exist" or "the operand pod never appeared." The cause is always further up the chain, and the chain is short enough to memorize.

## The five objects, in order

| Object | Scope | What it means |
|---|---|---|
| **CatalogSource** | namespace (`openshift-marketplace`) | A pod serving an index of available Operator bundles. The Red Hat defaults are `redhat-operators`, `certified-operators`, `community-operators`, `redhat-marketplace`. |
| **OperatorGroup** | namespace | Declares which namespaces the Operator will *watch*. Must match an install mode the Operator supports. |
| **Subscription** | namespace | Your intent: "install package X from catalog Y, channel Z, and keep it updated." |
| **InstallPlan** | namespace | The concrete step OLM generated to satisfy that intent — the resources it will create. Approved automatically or by you. |
| **ClusterServiceVersion (CSV)** | namespace | The installed Operator itself: its Deployment, RBAC, the CRDs it owns, its version, and its upgrade edges. |

🔑 **The CSV is the unit of "an installed Operator version."** The Subscription is the *desire*, the InstallPlan is the *transaction*, the CSV is the *result*.

```bash
oc get catalogsource -n openshift-marketplace
oc get og,sub,ip,csv -n <install-namespace>
```

## A Subscription, annotated

```yaml
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-gitops-operator
  namespace: openshift-operators
spec:
  channel: latest              # the upgrade stream you're subscribing to
  name: openshift-gitops-operator   # the package name in the catalog
  source: redhat-operators     # which CatalogSource
  sourceNamespace: openshift-marketplace
  installPlanApproval: Manual  # Automatic (default) or Manual
  startingCSV: openshift-gitops-operator.v1.12.0   # optional: pin the first version
```

> 💡 `installPlanApproval: Manual` is the grown-up setting for production. It means a new Operator version is *staged* as an InstallPlan and waits for you, instead of upgrading itself at 3 a.m.

Approving a staged plan:

```bash
oc get installplan -n openshift-operators
oc patch installplan <name> -n openshift-operators \
  --type merge -p '{"spec":{"approved":true}}'
```

## Install modes and the OperatorGroup trap

An Operator declares which install modes it supports: `AllNamespaces`, `SingleNamespace`, `OwnNamespace`, `MultiNamespace`. The OperatorGroup in the install namespace declares what you're asking for (an empty `spec.targetNamespaces` means all namespaces).

> ⚠️ Two classic failures: (1) installing an `AllNamespaces` Operator into a namespace whose OperatorGroup targets a single namespace, and (2) **two OperatorGroups in one namespace** — OLM refuses to act and every CSV in that namespace fails. `openshift-operators` already has a cluster-wide OperatorGroup; don't add another.

## CRDs: the dynamic API surface

When a CSV installs, it registers the **CustomResourceDefinitions** it owns. That's what makes `oc get subscription` (OLM's own CRD) or `oc get argocd` possible at all — the API server's surface grows at runtime.

```bash
oc get crd | grep -i argoproj          # what got registered
oc explain argocd.spec                 # docs come from the CRD's schema
oc get csv -n openshift-gitops-operator -o jsonpath='{.items[*].spec.customresourcedefinitions.owned[*].kind}{"\n"}'
```

Two consequences worth internalizing:

- **A CRD is cluster-scoped even when the Operator isn't.** Two versions of the same Operator in different namespaces still share one CRD — which is why conflicting versions cause trouble.
- **Deleting a CSV does not delete its CRDs or its custom resources.** Uninstalling an Operator cleanly means removing the Subscription, the CSV, and then deciding deliberately about the CRDs (deleting a CRD deletes every object of that kind, cluster-wide — that is a data-loss operation).

## Troubleshooting: walk the chain

Start at the Subscription and move outward. The `status` blocks are unusually informative here.

```bash
# 1. What does the Subscription think is wrong?
oc describe sub <name> -n <ns>
oc get sub <name> -n <ns> -o jsonpath='{.status.conditions}' | jq

# 2. Was an InstallPlan even created — and is it waiting on you?
oc get ip -n <ns>                       # APPROVAL=Manual + APPROVED=false means it's your turn

# 3. Did the CSV land?
oc get csv -n <ns>                      # PHASE should be Succeeded
oc describe csv <name> -n <ns>          # phase reasons live at the bottom

# 4. Is the catalog itself healthy?
oc get catalogsource -n openshift-marketplace     # want READY
oc get pods -n openshift-marketplace

# 5. OLM's own components
oc get pods -n openshift-operator-lifecycle-manager
oc logs -n openshift-operator-lifecycle-manager deploy/catalog-operator
oc logs -n openshift-operator-lifecycle-manager deploy/olm-operator
```

Conditions you'll actually meet:

| Symptom | Likely cause |
|---|---|
| Subscription condition `ResolutionFailed` / `ConstraintsNotSatisfiable` | The requested package/channel/version doesn't exist in that catalog, or a dependency can't be satisfied. Check the exact `name`, `channel`, and `source` spelling. |
| Subscription stuck, no InstallPlan | CatalogSource pod not `READY` — often no registry access (disconnected cluster, expired pull secret, proxy). |
| InstallPlan exists, nothing installs | `installPlanApproval: Manual` and nobody approved it. |
| CSV phase `Failed` / `Pending` with RBAC errors | OperatorGroup mismatch, or the Operator's ServiceAccount lacks permissions it expects. |
| CSV `Succeeded` but the operand never appears | The Operator is running — the problem is now in the *custom resource* you created. Read the operator pod's logs and the CR's `status`. |

> 🔑 A **degraded ClusterOperator** (`oc get co`) is a *platform* Operator managed by the Cluster Version Operator; a **failed CSV** is an *add-on* Operator managed by OLM. Different systems, different debugging. Don't look for logging-operator problems in `oc get co`.

## A note on OLM v1

Newer OpenShift releases ship a next-generation OLM alongside the classic one, with a simplified `ClusterExtension`-style API. The classic chain above is still what you'll find on the clusters you operate today. Because the details differ by release, check the docs for **your** cluster version before assuming an API exists.

## Check yourself

1. A Subscription has existed for an hour, there is no InstallPlan, and `oc get catalogsource -n openshift-marketplace` shows the source is not READY. What's your next command, and why?
2. Why is deleting a CRD a more dangerous act than deleting a CSV?
3. Your teammate says "the Operator is broken" and shows you `oc get co` output that's all healthy. What have they misunderstood?

## Key takeaways

- The chain is **CatalogSource → (OperatorGroup) → Subscription → InstallPlan → CSV → CRDs**; troubleshoot by walking it in order.
- The **CSV** represents one installed Operator version; `PHASE: Succeeded` is the goal.
- `installPlanApproval: Manual` stages upgrades for human approval — the production-safe choice.
- Most stuck installs are a bad `name`/`channel`/`source`, an unhealthy catalog pod, an unapproved InstallPlan, or an OperatorGroup mismatch.
- CRDs are cluster-scoped and outlive the Operator; deleting one deletes all its custom resources.
- OLM Operators and platform ClusterOperators are separate systems with separate health commands.
