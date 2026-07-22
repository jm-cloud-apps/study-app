# Authentication and RBAC: Identity Providers, Groups, and Bindings

> **The one-sentence version:** OpenShift runs its own OAuth server that federates to your real identity source (LDAP, OIDC, GitHub…), turns a successful login into a `User` and an `Identity`, and then RBAC decides what that user may do through Roles bound at cluster or project scope.

## Why it matters

Authentication answers *who are you*; authorization answers *what may you do*. On a shared cluster, both questions are asked thousands of times a minute, and the fastest way to fail an audit — or to give an entire department cluster-admin — is to be fuzzy about which is which.

🔑 **Authentication is federated; authorization is local.** Your identity provider knows who you are and what groups you're in. Only the cluster knows what that means.

## The OAuth server

OpenShift ships an internal OAuth server (in `openshift-authentication`), configured by a single cluster-scoped resource:

```bash
oc get oauth cluster -o yaml
oc get co authentication
oc get pods -n openshift-authentication
```

You add one or more **identity providers** to `spec.identityProviders`. The supported kinds include **LDAP** (Active Directory and friends), **OpenID Connect** (Keycloak, Entra ID, Okta, Ping…), **htpasswd**, **GitHub**, **GitLab**, **Google**, **Keystone**, **RequestHeader**, and **BasicAuth**.

An OIDC provider, with the client secret held in a Secret (never inline):

```yaml
apiVersion: config.openshift.io/v1
kind: OAuth
metadata:
  name: cluster
spec:
  identityProviders:
    - name: keycloak
      mappingMethod: claim
      type: OpenID
      openID:
        clientID: openshift
        clientSecret:
          name: keycloak-client-secret     # a Secret in openshift-config
        issuer: https://sso.example.com/realms/corp
        ca:
          name: keycloak-ca                # a ConfigMap in openshift-config
        claims:
          preferredUsername: [preferred_username]
          name: [name]
          email: [email]
          groups: [groups]                 # the claim that becomes OpenShift groups
```

An LDAP provider follows the same shape with a `bindDN`, a `bindPassword` Secret, a `ca` ConfigMap, and an `attributes` block mapping LDAP attributes to `id`/`preferredUsername`/`name`/`email`.

> ⚠️ The supporting Secret and ConfigMap must live in the **`openshift-config`** namespace, not in the namespace you happen to be working in. This is the number-one reason a freshly added provider never appears on the login page.

After you apply the change, the authentication operator redeploys the OAuth pods — logins may briefly fail. Watch `oc get co authentication` until it settles.

### mappingMethod, briefly

| Value | Behaviour |
|---|---|
| `claim` (default) | Use the provider's preferred username; **fail** if that name is already taken by another identity. Safest. |
| `lookup` | Only log in users whose `User`/`Identity` mapping was created ahead of time. Most controlled. |
| `add` | Add this identity to an existing user with the same name — how you link a second provider to one user. |
| `generate` | Invent a unique name (`alice2`) on collision. Convenient, confusing later. |

### Users, Identities, and kubeadmin

```bash
oc get users
oc get identities        # provider-name:provider-user-id -> user
oc whoami
```

A fresh cluster has a temporary **`kubeadmin`** user. Once a real identity provider works and you've granted `cluster-admin` to a genuine user or group, **remove it**:

```bash
oc delete secret kubeadmin -n kube-system
```

> ⚠️ Do this only after you've verified the replacement login *actually works with cluster-admin*. Deleting `kubeadmin` first and discovering your IdP is misconfigured second is a bad afternoon.

## Groups: where scale comes from

Never bind roles to individual users at scale — bind them to groups, and let the identity provider own membership.

- **OIDC**: the `groups` claim flows straight through, so a group in Keycloak becomes a group name you can bind. This is the low-maintenance path.
- **LDAP/AD**: OpenShift does not read group membership at login. You **sync** it:

  ```bash
  oc adm groups sync --sync-config=ldap-sync.yaml --confirm
  oc get groups
  ```

  The sync config declares the schema (`rfc2307`, `activeDirectory`, or `augmentedActiveDirectory`), the group and user queries, and the name mappings. In production this runs as a **CronJob** with a ServiceAccount holding the bind credentials, so membership changes in AD reach the cluster without a human.

You can also make local groups by hand for cluster-only concepts:

```bash
oc adm groups new platform-sre
oc adm groups add-users platform-sre alice bob
```

## RBAC: four objects, one rule

| Object | Scope | Grants |
|---|---|---|
| **Role** | namespace | Permissions inside that namespace |
| **ClusterRole** | cluster | Permissions cluster-wide, *or* a reusable permission set |
| **RoleBinding** | namespace | Binds a Role **or a ClusterRole** to subjects, effective in that namespace |
| **ClusterRoleBinding** | cluster | Binds a ClusterRole to subjects, effective everywhere |

🔑 **The useful trick: a RoleBinding can reference a ClusterRole.** That's how one definition of "admin" is reused in 500 projects — the ClusterRole holds the rules, the namespaced RoleBinding scopes them. Binding that same ClusterRole with a *ClusterRoleBinding* would grant it everywhere; this single distinction is the most common RBAC accident.

Default roles you should know by name:

| Role | Means |
|---|---|
| `view` | Read most things in a project — **but not Secrets**. |
| `edit` | Read/write most objects; cannot change RBAC. |
| `admin` | Full control of a project, including its RBAC and quotas. |
| `cluster-reader` | Read everything, cluster-wide. |
| `cluster-admin` | Everything. Grant it to as few subjects as you can name. |
| `self-provisioner` | May create new projects. Bound by default to `system:authenticated:oauth`. |

Granting, the idiomatic way:

```bash
oc adm policy add-role-to-group edit dev-team -n payments          # namespace scope
oc adm policy add-cluster-role-to-group cluster-reader platform-sre # cluster scope
oc adm policy remove-cluster-role-from-group self-provisioner \
  system:authenticated:oauth                                        # stop self-service projects
```

Those commands just create RoleBindings/ClusterRoleBindings — write them as YAML in Git when you're doing GitOps.

### Verifying, instead of hoping

```bash
oc auth can-i create deployments -n payments
oc auth can-i delete pods -n payments --as alice
oc auth can-i --list -n payments --as alice
oc adm policy who-can delete secrets -n payments
```

> 💡 `--as` impersonation is the single most useful RBAC debugging tool: it answers "what can Alice actually do?" without asking Alice to log in. Impersonation itself is a privilege, so it's available to cluster admins.

### ServiceAccounts are users too

Workloads authenticate as **ServiceAccounts** (`system:serviceaccount:<ns>:<name>`), and they're bound with the same RBAC objects. Give each workload its own SA with the narrowest role that works — the default SA in a namespace should stay boring. This is also where RBAC meets **SCCs** (lesson 02): an SCC is granted *to* a ServiceAccount via RBAC, which is why `oc adm policy add-scc-to-user anyuid -z myapp` is an RBAC operation in disguise.

## Check yourself

1. You bound the `admin` ClusterRole with a ClusterRoleBinding instead of a RoleBinding. What did you just grant?
2. A user logs in successfully but sees no projects. Is that an authentication or an authorization problem, and which command proves it?
3. Why does an LDAP-backed cluster need a group-sync CronJob, while an OIDC-backed one usually doesn't?

## Key takeaways

- The internal **OAuth server** (`oauth/cluster`) federates to LDAP/OIDC/htpasswd/etc.; supporting Secrets and ConfigMaps live in **`openshift-config`**.
- Login produces a `User` + `Identity`; `mappingMethod` decides how collisions are handled.
- Delete the temporary **`kubeadmin`** secret once a real cluster-admin login is verified.
- Bind to **groups**, not users. OIDC passes a `groups` claim; LDAP needs `oc adm groups sync`, usually on a CronJob.
- **RoleBinding + ClusterRole** = reusable permissions scoped to one namespace; using a ClusterRoleBinding instead grants them everywhere.
- Verify with `oc auth can-i --as` and `oc adm policy who-can` rather than assuming.
- ServiceAccounts are first-class subjects, and SCC grants are RBAC grants.
