# CKS: Supply Chain Security

> **The one-sentence version:** Supply-chain security means knowing and trusting **everything that ends up running**: small base images, an **SBOM** that lists what's inside, **scans** for known vulnerabilities, **static analysis** of your manifests, and **admission rules** so only images from permitted registries (ideally signed ones) can run.

This is 20% of the CKS. It moves the security conversation from the running cluster back to *where workloads come from*.

## Why it matters

An image is someone else's code, often hundreds of packages deep. A vulnerable library in a base image, a typosquatted image name or a compromised registry all lead to code you never reviewed running with your credentials. Each control here asks "do we know what this is, and should it run?"

## Minimise the base image footprint

🔑 **Every package you don't ship is a vulnerability you can't have.**

| Practice | Why |
|---|---|
| Use minimal bases: `-slim`, Alpine, distroless, or `scratch` for static binaries | Fewer packages, fewer CVEs, no shell for an attacker |
| **Multi-stage builds**: compile in one stage, copy only the artifact into a small final stage | Compilers and build tools never reach production |
| Pin versions, ideally by **digest** (`image@sha256:…`) | A tag can be moved; a digest can't |
| Run as a non-root `USER` | Limits the blast radius of an exploit |
| Don't bake secrets into layers | Image layers are readable by anyone who can pull the image |

```dockerfile
FROM golang:1.25 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app .

FROM gcr.io/distroless/static-debian12
COPY --from=build /app /app
USER 65532:65532
ENTRYPOINT ["/app"]
```

Tasks sometimes hand you a Dockerfile and ask you to fix its security issues: a `latest` tag, running as root, `ADD` from a URL, a secret in an `ENV`, or package-manager caches left in a layer.

## Know what's inside: SBOMs

A **Software Bill of Materials** lists every component in an artifact, with versions, in a standard format such as SPDX or CycloneDX. The CKS allows the docs for Kubernetes' own `bom` tool:

```bash
bom generate --image registry.k8s.io/kube-apiserver:v1.37.1 --output apiserver.spdx
bom document outline apiserver.spdx          # a readable tree of what's inside
```

Trivy can produce SBOMs too:

```bash
trivy image --format cyclonedx --output sbom.json nginx:1.27
trivy image --format spdx-json --output sbom.spdx.json nginx:1.27
```

> 💡 The `bom` CLI reference is one of the CKS's allowed sites, so check exact flags there (or with `bom generate --help`) rather than from memory. The idea to hold onto: an SBOM answers "are we affected?" in seconds when a new CVE is announced.

## Scan for known vulnerabilities

```bash
trivy image nginx:1.27                                   # all findings
trivy image --severity HIGH,CRITICAL nginx:1.27          # just the serious ones
trivy image --severity CRITICAL --exit-code 1 myapp:2.0  # fail a CI step on criticals
```

A classic task: "Scan the images used by the Pods in namespace `web`, and delete the Pods whose images have CRITICAL vulnerabilities." List the images with jsonpath, scan each, and act on the results.

```bash
k get pods -n web -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'
```

## Static analysis of workloads

Scanners check images; **static analysers** check your *manifests* for risky settings:

```bash
kubesec scan pod.yaml          # scores the spec; flags privileged, missing limits, root, etc.
kube-linter lint deploy.yaml   # checks against best-practice rules
```

Both explain each finding, so the fixes are the securityContext and resources fields from earlier lessons. Read the output, change the manifest, re-scan.

## Secure the supply chain: allow only what you trust

### Permitted registries, with ValidatingAdmissionPolicy

A **ValidatingAdmissionPolicy** (built in and GA since Kubernetes 1.30) rejects objects using a CEL expression, with no webhook to run:

```yaml
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicy
metadata: { name: allowed-registries }
spec:
  failurePolicy: Fail
  matchConstraints:
    resourceRules:
    - apiGroups: [""]
      apiVersions: ["v1"]
      operations: ["CREATE", "UPDATE"]
      resources: ["pods"]
  validations:
  - expression: "object.spec.containers.all(c, c.image.startsWith('registry.example.com/'))"
    message: "images must come from registry.example.com"
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingAdmissionPolicyBinding
metadata: { name: allowed-registries }
spec:
  policyName: allowed-registries
  validationActions: ["Deny"]
```

Test it: `k run bad --image=docker.io/library/nginx` should be refused with your message.

### ImagePolicyWebhook

The older, webhook-based approach is an admission plugin that asks an external service whether each image is allowed. You enable it in the API server (`--enable-admission-plugins=…,ImagePolicyWebhook` plus `--admission-control-config-file=…`), and its configuration names a kubeconfig for the backend, cache TTLs and **`defaultAllow`**, which decides what happens if the backend is unreachable.

🔑 **`defaultAllow: false` is the secure choice.** If the policy service is down, nothing new runs. That's a deliberate fail-closed trade-off, and a frequent CKS task detail.

### Signing and verifying

Signing tools (for example Sigstore's `cosign`) attach a signature to an image digest, and admission policies can require a valid signature before a Pod is admitted. For the exam, know the chain: **build → sign → push → verify at admission**, and that verifying by digest prevents a re-pushed tag from slipping through.

## Check yourself

1. Why does pinning an image by digest protect you in a way a version tag doesn't?
2. What's the difference between what Trivy checks and what kubesec checks?
3. In ImagePolicyWebhook's configuration, what does `defaultAllow: false` do when the backend is down, and why is that the secure setting?

## Key takeaways

- **Small bases, multi-stage builds, non-root users, digests, and no secrets in layers.**
- An **SBOM** (`bom`, or Trivy's `--format spdx-json`/`cyclonedx`) lists what's inside an image.
- **Trivy** scans images for CVEs (`--severity`); **kubesec** and **KubeLinter** analyse manifests.
- Restrict registries with a **ValidatingAdmissionPolicy** (CEL) or **ImagePolicyWebhook** (fail closed with `defaultAllow: false`).
- Sign images and verify signatures by digest at admission.
