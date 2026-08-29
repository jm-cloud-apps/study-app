# How the RHCSA Exam Actually Works

> **The one-sentence version:** RHCSA is a **performance-based** exam — no multiple choice, no essays, just a live system and a list of things that must be true on it when time runs out — so the whole skill is doing real work correctly and making it survive a reboot.

If you've only ever taken multiple-choice certifications, this one feels different in a good way: nothing is asking you to recognise the right answer. You're given systems and tasks, and a grading script checks the end state. You cannot bluff it, and you also can't be tricked by clever wording.

## Why it matters

Knowing the format changes how you study. There's no value in memorising which flag *looks* right — you'll have `man` pages on the machine. There's enormous value in being able to create a logical volume, mount it persistently, and fix it when it doesn't come back after a reboot, without hesitating. That's what this topic drills.

> 💡 **Where this sits among the other topics.** The **Linux & systemd** topic is the conceptual companion to this one — the process model, unit files, journald, and cgroups explained rather than drilled; read it alongside lessons 6, 7 and 11 if a mechanism feels like memorisation. **Containers & Docker** covers the image and registry concepts behind lesson 10. And once you hold the RHCSA, the **RHCE (EX294)** topic is the same tasks again, done through Ansible.

## What the format means in practice

| Reality | What it changes about how you work |
|---|---|
| **Graded on end state, not method** | Any correct way is correct. Use the tool you're fastest and safest with. |
| **No internet, no notes** | But the system's own docs are there: `man`, `--help`, `/usr/share/doc/`. Practise *finding* things there. |
| **You get root** | Which also means you can destroy the system. Slow down on `rm -rf`, `mkfs`, and partitioning. |
| **Tasks are largely independent** | A task you can't do doesn't block the rest. Skip and come back. |
| **The system is rebooted before grading** | This is the one that catches people. See below. |

> 💡 Red Hat publishes the current duration, passing score, RHEL version, and objective list on the official EX200 page. Those details change between exam versions, so check them there rather than trusting any study guide's numbers — including this one, which deliberately doesn't quote them.

## The rule that decides more results than any other

🔑 **If it doesn't survive a reboot, it didn't happen.** Grading happens on a freshly booted system. A mount you did with `mount /dev/vg/lv /data` but never added to `/etc/fstab` is gone. A service you started with `systemctl start` but never `enable`d is stopped. A firewall rule added without `--permanent` has evaporated. A `chcon` label vanishes on the next relabel.

The habit that fixes this permanently: **for every change, ask "what makes this persistent?"** and do both halves in one motion.

| Temporary | Persistent partner |
|---|---|
| `systemctl start foo` | `systemctl enable foo` (or `enable --now` for both) |
| `mount /dev/…` | an `/etc/fstab` entry, then `systemctl daemon-reload && mount -a` |
| `firewall-cmd --add-service=http` | the same command with `--permanent`, then `--reload` |
| `setenforce 1` | `SELINUX=enforcing` in `/etc/selinux/config` |
| `chcon -t …` | `semanage fcontext -a -t …` then `restorecon` |
| `ip addr add …` | an `nmcli con mod` on a connection profile |
| `swapon /dev/…` | an `/etc/fstab` swap line |

Then — and this is the part people skip because it's slow — **actually reboot** near the end and re-verify. A reboot that reveals one broken `fstab` line is the cheapest ten minutes you'll ever spend.

> ⚠️ A broken `/etc/fstab` can stop a system from booting into a usable state, which is far worse than the task being wrong. After every `fstab` edit, run `systemctl daemon-reload` and then `mount -a` and confirm it exits cleanly and mounts what you expect. Fix it *while you still have a running shell.*

## Reading a task like a grader

Tasks are written precisely. Read them twice and turn each into a checklist:

> *"Create a group `devs`. Add users `ana` and `raj` to it. Their home directories should not be readable by anyone else. `ana` must be able to run any command as root without a password."*

That's four verifiable facts: the group exists; both users are members; home directory modes are `0700`; a sudo rule with `NOPASSWD:` exists for `ana`. Write the checklist down, do the work, then verify each line with a command (`id raj`, `ls -ld /home/ana`, `sudo -lU ana`). Verification is not optional politeness — it's how you find the typo before the grader does.

> 💡 When a task names a specific value — a UUID, a size, a username, a port — copy it exactly rather than retyping from memory. Most "I did that task" failures are a transposed character.

## A sane time strategy

1. **Read every task first** (a couple of minutes). You'll spot which ones are quick wins and which one depends on another.
2. **Do the fast, certain ones first.** Points are points, and early momentum settles the nerves.
3. **Do the destructive ones deliberately.** Partitioning and filesystem work deserve your full attention, not the last five minutes.
4. **Reboot with time to spare**, then walk the checklist again on the freshly booted system.
5. If something won't work, **leave it and move on**. Ten minutes stuck on one task can cost three easy ones.

> 🔑 Almost everything you need is already installed and documented on the machine. `man -k` (apropos) searches man page descriptions; `/usr/share/doc/<package>/` has real example configs. Practise using them *now*, so that under time pressure looking something up feels normal instead of like defeat.

## How to practise

Build a scratch VM you're happy to destroy — a RHEL developer subscription, CentOS Stream, AlmaLinux, or Rocky all behave close enough for practice. Then work in this rhythm: do a task, reboot, verify it held. Snapshot the VM when it's clean so you can roll back and repeat the ones that hurt. The practice tasks in this topic are written for exactly that loop.

And a word about how this feels: nobody remembers all of this at first, and the people who pass are not the ones who never look anything up. They're the ones who've done these motions enough times that their hands know the order. Repetition, not talent.

## Check yourself

1. You started and configured a service, added a firewall rule, and mounted a new filesystem. Name the extra step each of those needs to still be true after a reboot.
2. Why is it worth rebooting *before* you run out of time rather than after the last task?
3. Where can you find documentation and example configuration files on an offline exam system?

## Key takeaways

- RHCSA is **performance-based and graded on end state** — any correct method counts, and there's no partial credit for intent.
- **Persistence is the exam.** Every temporary change has a persistent partner; do both halves together, then reboot and verify.
- Turn each task into a **checklist of verifiable facts**, and verify each one with a command before moving on.
- Read all tasks first, bank the quick wins, take the destructive ones slowly, and don't get stuck.
- The system's own docs (`man`, `man -k`, `--help`, `/usr/share/doc/`) are available and are meant to be used — build the habit now.
