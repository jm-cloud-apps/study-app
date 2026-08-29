# Exam-Day Review: Checklist, Module Recall, and Traps

> **The one-sentence version:** A self-audit for EX294 — walk the objective map, recall the module for each administration task from memory, and finish every task the same way: run it twice and look for `changed=0`.

Like the RHCSA review, this is a gap finder rather than new material. Cover the answers and see which rows make you pause.

> ⚠️ Red Hat publishes the authoritative objective list for **your** exam version on the EX294 page, along with which Ansible tooling it targets. Reconcile this map against it — and remember the exam expects **RHCSA-level skills** too, since you're automating exactly those tasks.

## The objective map

| Can you… | Answer | Lesson |
|---|---|---|
| Build a self-contained project | `./ansible.cfg` + inventory + `roles/`; `ansible --version` proves which config is live | 2 |
| Say where Ansible looks for its config | `$ANSIBLE_CONFIG` → `./ansible.cfg` → `~/.ansible.cfg` → `/etc/ansible/ansible.cfg`, first match wins, never merged | 2 |
| Explain why a project config is ignored | Wrong directory, or the directory is **world-writable** | 2 |
| Write an inventory with nested groups | `[production:children]`; verify with `ansible-inventory --graph` | 2 |
| Put data where it belongs | `group_vars/<group>.yml`, `host_vars/<host>.yml` — host beats group | 2, 5 |
| Prove connectivity and escalation | `ansible all -m ping`, `-b`; needs a key plus passwordless sudo | 2 |
| Find a module and its parameters offline | `ansible-doc -l \| grep …`, then **`ansible-doc -s <module>`** | 3 |
| Write a play with handlers | `notify:` matching a handler `name:`; runs once, at the end, only if changed | 4 |
| Loop over a list of dictionaries | `loop:` with `item.field` | 4 |
| Write a conditional | `when: ansible_facts['os_family'] == "RedHat"` — **no `{{ }}`** | 4 |
| Act on a command's result | `register:` then `rc`, `stdout`, `changed` | 4 |
| Name the precedence extremes | `--extra-vars` wins; role `defaults/` loses | 5 |
| Use a fact in a template | `ansible_facts['fqdn']`, `['default_ipv4']['address']`; find names with `-m setup -a "filter=…"` | 5, 6 |
| Add custom facts | `/etc/ansible/facts.d/*.fact` → `ansible_local` | 5 |
| Protect a secret | `ansible-vault create/edit/view/rekey`, `encrypt_string`, `vault_password_file` + `no_log: true` | 5 |
| Render a per-host config file | `template:` with a `*.j2` in `templates/` | 6 |
| Generate a config listing other hosts | `{% for h in groups['webservers'] %}` + `hostvars[h]` | 6 |
| Install a file safely | `validate: 'visudo -cf %s'` / `'sshd -t -f %s'` | 6 |
| Edit one line of a file idempotently | `lineinfile` **with `regexp:`** | 6 |
| Build a role | `ansible-galaxy init`; overridable values in **`defaults/`**, internals in `vars/` | 7 |
| Install roles and collections locally | `requirements.yml` + `ansible-galaxy … install -r … -p ./collections` | 7 |
| Use a RHEL system role | Set its **variables**; read `/usr/share/doc/rhel-system-roles/<role>/` | 7 |
| Manage users, packages, services, cron | `user` (**`append: true`**), `dnf` (`state: present`), `service`, `cron` (stable **`name:`**) | 8 |
| Provision storage | `parted` → `lvg` → `lvol` → `filesystem` → `mount` with **`state: mounted`** | 8 |
| Configure firewall and SELinux | `firewalld` (**`permanent` + `immediate`**), `seboolean` (`persistent: true`), `sefcontext` + a `restorecon` handler | 8 |
| Handle expected failures | `failed_when`, `ignore_errors`, `block`/`rescue`/`always` | 9 |
| Keep re-runs clean | **`changed_when: false`** on read-only commands; `creates:` on `command` | 9, 1 |
| Preview a change | `--check --diff`, `--syntax-check`, `--list-tasks` | 9 |
| Roll a change out safely | `serial:` with `max_fail_percentage` | 10 |
| Act on another host mid-play | `delegate_to:` (+ `run_once: true`) | 10 |
| Survive a long task or a reboot | `async`/`poll` + `async_status`; the `reboot` module | 10 |
| Use a dynamic inventory | A plugin config or JSON script; verify with `ansible-inventory --graph` | 10 |

## The two-run rule

🔑 **Every task ends the same way:**

```bash
ansible-playbook <task>.yml        # first run: it does the work
ansible-playbook <task>.yml        # second run: PLAY RECAP must show changed=0
```

If the second run reports changes, walk this list before anything else:

| Symptom | Cause | Fix |
|---|---|---|
| A `command`/`shell` task always changed | Ansible can't know what it did | `changed_when:` or `args: creates:` |
| A package task always changed | `state: latest` | `state: present` |
| A file grows each run | `lineinfile` without `regexp:` | Add `regexp:`, or switch to `template` |
| A template always changed | A timestamp or other volatile value inside it | Remove it from the rendered file |
| A service restarts every run | A handler notified by an always-changed task | Fix the task, not the handler |

That last one is why idempotency is correctness rather than tidiness: a task that always reports changed **restarts a production service on every run**.

## Traps that cost marks

1. **A playbook saved at the wrong path**, or targeting the wrong group. Re-read the task's exact wording.
2. **`{{ }}` inside `when:`** — it's already an expression.
3. **An unquoted value starting with `{{`** — invalid YAML.
4. **`usermod`-style group loss**: `user:` without `append: true`.
5. **`firewalld` with `permanent` but not `immediate`** (or the reverse).
6. **`seboolean` without `persistent: true`.**
7. **`mount` with `state: present`** when the task wanted `mounted`.
8. **A role variable in `vars/`** that was supposed to be overridable in `defaults/`.
9. **A handler that never fires** because `notify:` doesn't match the handler's `name:` exactly.
10. **`command: reboot`** instead of the `reboot` module.
11. **A vault password file that's world-readable**, or committed alongside the vault.
12. **Tabs in YAML**, or inconsistent indentation.

## A sane final week

- **Days 1–3:** the practice tasks here, on real managed hosts — one category a day, each finished only when a second run is clean.
- **Day 4:** roles. Convert two of your earlier playbooks into roles, and use one RHEL system role from its documentation alone.
- **Day 5:** a timed mock — build the project skeleton from scratch, then do eight tasks against it.
- **Day 6:** revisit the objective-map rows you hesitated on, and practise `ansible-doc -s` until reaching for it is automatic.
- **Day 7:** rest; re-read the trap list.

> 💡 The single highest-leverage habit on exam day: **build the project skeleton first** (`ansible.cfg`, inventory, `ansible all -m ping` answering), before writing a line of any playbook. Every later task depends on it, and a broken skeleton makes correct playbooks look wrong.

## Check yourself

1. What's the one command pair that tells you a task is finished, and what output are you looking for?
2. Name the four idempotency killers and their fixes.
3. Which objective-map rows made you pause? Those are your revision list.

## Key takeaways

- Use the map as a **self-audit**, and reconcile it with Red Hat's official objectives for your exam version.
- **Two runs, `changed=0`** is the finish line for every single task.
- The idempotency killers are `command`/`shell` without `changed_when`/`creates`, `state: latest`, `lineinfile` without `regexp:`, and volatile template content.
- Most lost marks are a **wrong path, a wrong group, or a missing persistence flag** — not a misunderstood concept.
- **Build the project skeleton first**; `ansible-doc -s` is faster and more accurate than memory.
