# How the CKA, CKAD and CKS Exams Work

> **The one-sentence version:** All three CNCF Kubernetes exams are **two hours of live, hands-on tasks** on real clusters, graded on the end state, with the Kubernetes docs open beside you. So the skill being tested is doing correct work quickly, in the right namespace, on the right machine.

If you've taken multiple-choice exams before, these will feel refreshingly honest. Nobody asks you to recognise the right answer from four lookalikes. You're handed a terminal and a list of things that must be true when time runs out. You can't bluff it, and you also can't be tricked by wording. If you can do the work, you pass.

## Why it matters

Knowing the format changes how you study. There's little value in memorising YAML field by field, because the docs are allowed and `kubectl explain` is right there. There's enormous value in being **fast and certain** with `kubectl`: generating a manifest in one command, switching context without thinking, and checking your own work before moving on. That's what this topic drills.

> 💡 **Where this sits among the other topics.** The **Kubernetes & OpenShift** topic explains the concepts (Pods, Services, storage, scheduling). This topic is the exam-shaped companion that turns them into speed. **Containers & Docker** covers the image concepts behind the CKAD's build tasks, and **Linux & systemd** is the foundation for every `systemctl status kubelet` you'll run.

## The three exams at a glance

| | **CKA** — Administrator | **CKAD** — Application Developer | **CKS** — Security Specialist |
|---|---|---|---|
| Focus | Building, running and fixing clusters | Designing, deploying and debugging apps on a cluster | Hardening clusters, workloads and the supply chain |
| Prerequisite | None | None | **A current CKA** |
| Biggest domain | Troubleshooting (30%) | Environment, Configuration & Security (25%) | Three domains tie at 20% |
| Passing score | 66% | 66% | 67% |

What they share, per the Linux Foundation's pages as of November 2026:

- **Two hours**, online and proctored, with **15–20 performance-based tasks**.
- The environment runs a **recent Kubernetes minor version** (v1.37 at the time of writing). It moves to the newest minor within roughly 4–8 weeks of each release.
- Registration includes **one retake** and **two sessions on the killer.sh simulator**, each open for 36 hours. "-SINGLE" registrations don't include the simulator.
- Passing certifies you for **two years**. Results arrive by email within about 24 hours.

> 💡 Prices, versions, weights and policies change. Treat the official Linux Foundation exam pages and FAQ as the source of truth, and check them when you book. The numbers here are a snapshot, not a promise.

## What the exam environment is really like

You join through PSI's **Bridge** platform in its secure browser, on your own computer with **one monitor**. The proctor watches by webcam. Inside, you get a remote Linux desktop with a terminal and a browser.

A few details that catch people the first time:

- **Each task names an SSH host.** You start on a node called `base`, and each task tells you to `ssh <nodename>` first. Nested SSH isn't supported, so `exit` back to `base` before going to the next host. Don't reboot `base`.
- **`kubectl` with the `k` alias and bash completion is preconfigured on the SSH hosts**, along with `yq`, `curl`, `wget` and man pages. The `base` node has none of these.
- **Copy and paste differ by app.** In the terminal it's `Ctrl+Shift+C` / `Ctrl+Shift+V`; elsewhere it's `Ctrl+C` / `Ctrl+V`. `Ctrl+W` would close a browser tab, so the instructions suggest `Ctrl+Alt+W`. The `Insert` key is blocked, so use `i` and `Esc` in vi.
- **`sudo -i`** is allowed when a task needs root on a node.

Practise in a setup like this: a terminal, a browser on kubernetes.io/docs, and nothing else.

## What documentation you can use

| Exam | Allowed sites (plus the task-specific links in the Quick Reference box) |
|---|---|
| CKA | kubernetes.io/docs, kubernetes.io/blog, helm.sh/docs, gateway-api.sigs.k8s.io |
| CKAD | kubernetes.io/docs, kubernetes.io/blog, helm.sh/docs |
| CKS | kubernetes.io/docs, kubernetes.io/blog, falco.org/docs, etcd.io/docs, docs.cilium.io, istio.io/latest/docs, the ingress-nginx configuration guide, and the `bom` CLI reference |

You may use the search box *on* kubernetes.io, but you may not open external search results. Man pages and files under `/usr/share` on the hosts are fair game too.

🔑 **The docs are a reference, not a textbook.** You won't have time to learn a feature from them during the exam. You will have time to copy a YAML skeleton you already understand. Practise *finding* the page for NetworkPolicy, PersistentVolumeClaim or an AppArmor profile in under thirty seconds.

## The rule that decides more results than any other

🔑 **Right object, right namespace, right cluster.** Each task tells you which context to use and often which namespace. A perfect Deployment created in `default` instead of `payments` scores zero. So does one created on the wrong cluster.

Build one habit and never break it: **the first thing you do on every task is set the context it gives you.**

```bash
kubectl config use-context <context-from-the-task>   # every single task
kubectl config set-context --current --namespace=payments   # if the task is namespace-heavy
kubectl config get-contexts                            # the * shows where you are
```

Then **verify before moving on**: `k get`, `k describe`, `k auth can-i`, `curl` from a test Pod. Grading checks the end state, so your own check is how you catch the typo before the grader does.

## A sane time strategy

1. **Skim all the tasks first.** Their weights are shown, so note the cheap, high-value ones.
2. **Bank the quick wins.** A three-line Role and RoleBinding worth 4% beats wrestling a broken kubelet worth 7% for twenty minutes.
3. **Flag and move on.** The exam UI lets you flag tasks. Ten minutes stuck on one task can cost three easy ones.
4. **Leave ten minutes at the end** to revisit flagged tasks and re-check contexts.

Tasks are mostly independent, so a task you can't finish doesn't block the others.

## Which one first?

If you run clusters, **CKA** first. It's the prerequisite for **CKS**, and CKS assumes CKA-level fluency under time pressure. If you mainly ship applications, **CKAD** is the most direct path, and about half of it overlaps the CKA's workload, configuration and networking material. Many people take CKAD and CKA close together for that reason. This topic is ordered CKA → CKAD → CKS, but the CKAD lessons stand on their own.

Whichever you choose: nobody memorises all of this, and the people who pass aren't the ones who never look anything up. They're the ones whose hands already know the motions. That's repetition, not talent, and it's very learnable.

## Check yourself

1. You wrote a flawless manifest, but the task said "in namespace `ops` on cluster `k8s-b`". What two commands should have come first?
2. Why is practising *finding* things in the Kubernetes docs more valuable than memorising YAML?
3. Which exam requires another to be passed first, and why does that order make sense?

## Key takeaways

- All three exams are **two hours of live tasks graded on end state**, with the official docs open.
- **Set the context and namespace the task gives you, every time.** The wrong place scores zero.
- **Verify your work with a command** before moving to the next task.
- Skim first, bank quick wins, flag the hard ones, and keep ten minutes in reserve.
- Exam details change, so treat the Linux Foundation's pages as the source of truth when you book.
