# How the RHCE Exam Works — and What "Idempotent" Really Costs You

> **The one-sentence version:** RHCE is RHCSA's tasks done again through Ansible — you write playbooks on a control node that configure managed hosts, and the quiet grading criterion is **idempotency**: run it twice and the second run must change nothing.

If you've passed RHCSA, you already know *what* the systems must end up looking like. This exam is about expressing that as automation that another person could run tomorrow, safely.

## Why it matters

Knowing the shape of the exam changes what you practise. It isn't a memory test about YAML syntax — it's whether you can go from "configure a repository, a user, a firewall rule and a service on these hosts" to a working, re-runnable playbook without fighting the tooling. Most of the difficulty is speed and fluency, not concepts.

> 💡 **Prerequisite, not a suggestion.** Red Hat requires the RHCSA credential for the RHCE, and the tasks here are RHCSA work expressed as automation — so the **RHCSA (EX200)** topic is the companion to this one. When a task says "configure a repository, open the firewall, label the port," the *what* is RHCSA and only the *how* is new.

## What the exam is

| Fact | What follows from it |
|---|---|
| **Performance-based**, like RHCSA | You're graded on the state of the managed hosts, not on how elegant the playbook is. |
| **You need RHCSA first** | Red Hat requires the RHCSA credential for the RHCE, and expects RHCSA-level skills during the exam. |
| **Everything runs through Ansible** | A task "solved" by SSHing in and typing commands doesn't count — the grader may re-run your playbooks. |
| **Offline, with docs on the box** | `ansible-doc`, `/usr/share/doc/`, and the roles' own documentation are there. Learn to read them fast. |
| **Version-specific** | Which Ansible tooling appears (`ansible-navigator`, execution environments, collections) depends on the exam version — check the official EX294 objectives for yours. |

> 💡 Red Hat publishes the current duration, passing score, and objective list on the EX294 page. Those change between versions, so read them there rather than trusting any study guide's numbers — this one deliberately doesn't quote them.

## Idempotency is the whole game

🔑 **A playbook run twice should report `changed=0` the second time.** That's not a style preference — it's the definition of the thing you're building. A playbook that flips a config back and forth, appends a line every run, or restarts a service on every execution is *not* configuration management; it's a shell script wearing a costume.

Ansible modules give you this for free. `ansible.builtin.user` checks whether the user exists with those attributes and does nothing if so. `ansible.builtin.lineinfile` looks for the line before adding it. `ansible.builtin.dnf` asks whether the package is installed.

What doesn't come free:

```yaml
- name: NOT idempotent — runs every single time
  ansible.builtin.command: useradd ana

- name: Better — the module knows how to check
  ansible.builtin.user:
    name: ana
    state: present

- name: If you MUST shell out, tell Ansible when to skip
  ansible.builtin.command: /usr/local/bin/setup.sh
  args:
    creates: /var/lib/app/.configured    # skip if this path exists
```

> ⚠️ `command` and `shell` are the two modules that always report `changed` unless you tell them otherwise. Use `creates:`/`removes:` to make them skip, or `changed_when:` to define what "changed" means. Reaching for `shell` when a module exists is the most common way people write non-idempotent playbooks.

**Your standard verification, on every task:**

```bash
ansible-playbook site.yml          # first run: changes
ansible-playbook site.yml          # second run: changed=0  <- the actual test
```

## The working setup

You'll have a **control node** (where you write and run playbooks) and several **managed hosts**. The control node needs Ansible; the managed hosts need only Python and SSH — no agent. Practise with:

- SSH key authentication to a dedicated automation user on every managed host,
- that user able to `sudo` without a password (that's what `become: true` relies on),
- a project directory containing `ansible.cfg`, an inventory, and your playbooks.

Getting that right once, quickly, is worth rehearsing on its own — everything else depends on it.

## How to read a task

Automation tasks bundle several requirements into one sentence:

> *"Create a playbook `/home/ansible/webserver.yml` that installs httpd on the `webservers` group, ensures it is enabled and started, opens the firewall, and deploys `index.html` containing the host's fully-qualified domain name."*

That's five tasks in one play, with a specific **file path**, a specific **inventory group**, and one piece of dynamic content (an `ansible_facts` value in a template). Write the checklist first; the playbook practically types itself afterwards.

> ⚠️ Save playbooks at **exactly** the path the task names, and target **exactly** the group it names. A perfect playbook in the wrong directory scores nothing, and it's an entirely avoidable loss.

## A sane strategy

1. **Build the project skeleton first** — `ansible.cfg`, inventory, `roles/`, a working `ansible all -m ping`. Everything else fails confusingly without it.
2. **Read all the tasks** before writing anything; several usually share an inventory group or a variable file.
3. **Write, run, run again.** Never move on from a task without seeing `changed=0` on the second run.
4. **Use `ansible-doc`** rather than trying to recall a parameter name. It's on the machine and it's fast: `ansible-doc user`, or `ansible-doc -s user` for a copy-pasteable skeleton.
5. **Leave time to re-run everything at the end**, in case a later task changed something an earlier one depended on.

And if this feels like a lot: it's the same system administration you already know, expressed in a language with unusually good documentation *on the machine itself*. Fluency comes from writing a dozen small playbooks, not from reading about them.

## Check yourself

1. Why is running a playbook a second time the most important verification step, and what result are you looking for?
2. `ansible.builtin.command` reports "changed" on every run. Name two ways to fix that.
3. A task specifies a playbook path and an inventory group. Why are those worth double-checking before you start writing?

## Key takeaways

- RHCE is **performance-based automation**: the managed hosts' end state is the grade, and it must be reachable by re-running your playbooks.
- **Idempotency is the standard.** Second run = `changed=0`. Modules give it to you; `command`/`shell` don't, unless you add `creates:`/`removes:` or `changed_when:`.
- The control node needs Ansible; managed hosts need SSH, Python, and a `sudo`-capable user for `become`.
- Build the **project skeleton** (`ansible.cfg`, inventory, working `ping`) before anything else.
- Use **`ansible-doc`** instead of memory, and save files at exactly the paths tasks specify.
