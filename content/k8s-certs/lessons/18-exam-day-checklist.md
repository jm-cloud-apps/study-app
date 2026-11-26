# Exam Day: The Checklist and the Last Week

> **The one-sentence version:** By exam day the knowledge is already in place. What decides the result now is **routine**: a ready machine, a calm first five minutes, the same per-task ritual every time, and the discipline to move on from a stuck task.

You've done the work. This lesson turns it into a plan so nothing on the day is a surprise.

## Why it matters

Plenty of capable people lose marks to things that have nothing to do with Kubernetes: a webcam that won't pass the room check, a task done in the wrong context, twenty minutes sunk into one broken kubelet. Every one of those is preventable.

## The week before

- **Do both killer.sh sessions**, spaced out. The simulator is deliberately harder than the real exam. Scoring lower there is normal and not a prediction. Each session stays open for 36 hours, so redo the tasks you missed.
- **Re-read the official pages**: the current curriculum for your exam, the Important Instructions page and the allowed-resources list. Details change, and the Linux Foundation's own pages are the authority.
- **Rehearse documentation navigation.** For each domain, know which kubernetes.io page has the skeleton you'd copy (NetworkPolicy, PVC, Ingress, securityContext, PSA labels, audit policy, EncryptionConfiguration…). Time yourself finding them.
- **Run the system check** for PSI's secure browser on the actual computer, network and room you'll use. One monitor only.

## The first five minutes

1. **Breathe, then read the environment instructions** shown at the start. They confirm the hosts, the tools and the copy/paste keys.
2. **Skim every task** and its weight. Note the quick wins and the ones that look long.
3. Set up your comfort, but keep it small. On each SSH host, `k` and completion are already there. Many people add only:

```bash
export do="--dry-run=client -o yaml"
export now="--force --grace-period=0"     # fast Pod deletion: k delete pod x $now
```

## The per-task ritual

Do this for **every** task, even the easy ones:

1. **`ssh` to the host the task names** (and `exit` back afterwards).
2. **Switch to the context the task names.** Copy the command from the task if it's given.
3. **Note the namespace** and either pass `-n` or set it on the context.
4. Do the work, **saving YAML to a file** named after the task.
5. **Verify** with a command that proves the end state: `get`, `describe`, `auth can-i`, a `curl` from a test Pod, `crictl ps` after a manifest edit.
6. If it's not working within your time budget, **flag it and move on.**

🔑 **The ritual is the strategy.** Steps 1–3 prevent the zero-score mistakes; step 5 catches the typos; step 6 protects the rest of the exam.

## Per-exam reminders

**CKA**
- Control-plane edits: back up the manifest *outside* `/etc/kubernetes/manifests/`, edit, then wait for the kubelet (`watch crictl ps`).
- Upgrades: `upgrade apply` on the first control plane, `upgrade node` everywhere else; drain before restarting the kubelet; uncordon after.
- Troubleshooting: events → logs → `systemctl status kubelet` → `journalctl -u kubelet`.

**CKAD**
- Generate, don't type: `k create … $do`, then add the fields the generator lacks.
- Probe tasks: check the path and port against the container's actual `containerPort`.
- Blue/green and canary: it's all labels and selectors. Check the endpoints after each change.

**CKS**
- After any API server flag change, confirm it comes back, and check that any file it references is **mounted** into its Pod.
- AppArmor: loaded **on the right node**, referenced by profile **name**.
- Audit policy: specific rules first, catch-all last.
- When asked to delete non-compliant Pods, list them first and delete exactly those, nothing else.

## When you're stuck

- **Re-read the task.** Most "impossible" tasks are a missed word: a namespace, a port, "on node X."
- **Check events and logs again.** They usually say exactly what's wrong.
- **Find the docs page** with a working example and compare your YAML line by line.
- **Move on.** The time goes to tasks you can finish, and a fresh look later often makes the answer obvious.

## A word about nerves

Feeling nervous means you care about the result. It doesn't mean you're unprepared. If your mind blanks, go back to the ritual: host, context, namespace, generate, verify. Your hands know more than your nerves do right now, so let them work.

And if this attempt doesn't go your way, your registration includes a retake. You'll walk into it with a precise map of what to practise, which is a real advantage.

## Check yourself

1. Which three steps of the per-task ritual prevent the "perfect answer, zero marks" outcome?
2. Why is scoring low on killer.sh not a reason to postpone?
3. You've spent twelve minutes on a 4% task and you're close but not done. What do you do?

## Key takeaways

- Do **both killer.sh sessions**, re-read the official instructions, and rehearse finding docs pages.
- **Ritual per task: host → context → namespace → do → verify → move on.**
- Save YAML to files; verify every task with a command that proves the end state.
- Know your exam's few sharp edges (manifest backups, `upgrade apply` vs `node`, mounts for API server files, AppArmor on the right node).
- Stuck? Re-read, check events, compare with the docs, then move on. The included retake is a real safety net.
