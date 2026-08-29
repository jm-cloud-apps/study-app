# Playbooks: Plays, Tasks, Handlers, Loops, and Conditionals

> **The one-sentence version:** A playbook is a YAML list of **plays**, each pairing a set of hosts with an ordered list of **tasks** — and four features (handlers, loops, conditionals, and `register`) turn that list into something that adapts to what it finds.

## Why it matters

This is the core skill the exam measures. Every task ends as a playbook, and the difference between a fluent attempt and a slow one is whether these four patterns come out of your fingers without thinking.

## The anatomy

```yaml
---
- name: Configure web servers                 # a PLAY
  hosts: webservers
  become: true
  vars:
    http_port: 80

  tasks:
    - name: Install httpd                     # a TASK
      ansible.builtin.dnf:
        name: httpd
        state: present

    - name: Deploy the configuration
      ansible.builtin.template:
        src: httpd.conf.j2
        dest: /etc/httpd/conf/httpd.conf
        owner: root
        group: root
        mode: '0644'
      notify: Restart httpd                   # fires a HANDLER, only if changed

    - name: Start and enable httpd
      ansible.builtin.service:
        name: httpd
        state: started
        enabled: true

  handlers:
    - name: Restart httpd
      ansible.builtin.service:
        name: httpd
        state: restarted
```

Things worth noticing straight away: every task has a **`name`** (it's what you read in the output when something fails), tasks run **in order**, and modes like `'0644'` are **quoted** so YAML doesn't read them as a number and drop the leading zero.

> ⚠️ YAML is whitespace-sensitive and does not accept tabs. Two-space indentation, consistently. `ansible-playbook --syntax-check site.yml` catches structural mistakes in a second — run it before every real run while you're learning.

## Handlers

🔑 **A handler runs only if the task that notified it reported `changed`, and only once, at the end of the play.** That's exactly the behaviour you want for restarts: deploy a config on ten hosts, and only the hosts where the file actually changed get restarted — and a host that had three config changes still restarts once.

Two details that come up:

- Handlers are matched **by name**, so the `notify:` string must match the handler's `name` exactly.
- They run at the **end of the play**. If you need them sooner — say, the service must be restarted before a later task talks to it — force it with `- ansible.builtin.meta: flush_handlers`.

## Loops

```yaml
- name: Create several users
  ansible.builtin.user:
    name: "{{ item }}"
    state: present
  loop:
    - ana
    - raj
    - mia

- name: Create users with attributes
  ansible.builtin.user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
    state: present
  loop:
    - { name: ana, groups: devs }
    - { name: raj, groups: devs,ops }

- name: Loop over a variable defined elsewhere
  ansible.builtin.user:
    name: "{{ item.name }}"
  loop: "{{ users }}"                 # from group_vars, host_vars, or vars_files
```

`item` is the loop variable. For a list of dictionaries, address the fields as `item.name`, `item.groups`, and so on. (Older playbooks use `with_items`; `loop` is the current form and what you should write.)

## Conditionals

```yaml
- name: Install Apache the Red Hat way
  ansible.builtin.dnf:
    name: httpd
    state: present
  when: ansible_facts['os_family'] == "RedHat"

- name: Only on hosts with real memory
  ansible.builtin.debug:
    msg: "Big machine"
  when: ansible_facts['memtotal_mb'] > 4096

- name: Multiple conditions (a list means AND)
  ansible.builtin.service:
    name: httpd
    state: started
  when:
    - ansible_facts['os_family'] == "RedHat"
    - http_enabled | bool
```

> 💡 Inside `when:`, you're already in a Jinja2 expression context — so write `when: ansible_facts['os_family'] == "RedHat"`, **without** the surrounding `{{ }}`. Elsewhere (in module arguments, templates, strings) you do need `{{ }}`. Mixing these up is the most common Ansible syntax error there is.

A list under `when:` is an implicit **AND**; use `or` inside a single expression when you need it.

## register: acting on results

```yaml
- name: Check whether the service is running
  ansible.builtin.command: systemctl is-active httpd
  register: httpd_status
  changed_when: false           # a read-only check never "changes" anything
  failed_when: false            # a non-zero exit is information here, not failure

- name: Report it
  ansible.builtin.debug:
    msg: "httpd says: {{ httpd_status.stdout }}"

- name: Start it only if it wasn't running
  ansible.builtin.service:
    name: httpd
    state: started
  when: httpd_status.rc != 0
```

A registered variable holds the module's whole result. The fields you'll use constantly: **`rc`** (exit code), **`stdout`** / **`stdout_lines`**, **`changed`**, and **`failed`**.

> 🔑 **`changed_when: false` on read-only commands is an idempotency fix, not decoration.** Without it, a `command` that merely *checks* something reports `changed` on every run, and your second run never reaches `changed=0`.

## Tags and controlled runs

```yaml
- name: Install packages
  ansible.builtin.dnf:
    name: httpd
    state: present
  tags:
    - packages
```

```bash
ansible-playbook site.yml --tags packages
ansible-playbook site.yml --skip-tags packages
ansible-playbook site.yml --list-tasks          # what would run, in order
ansible-playbook site.yml --list-tags
ansible-playbook site.yml --limit web1          # one host
ansible-playbook site.yml --check --diff        # dry run, showing file differences
ansible-playbook site.yml --start-at-task "Deploy the configuration"
```

`--check --diff` is worth building into your habits: it tells you what *would* change and shows the actual text differences in files, which catches a wrong template long before it reaches production.

## Check yourself

1. A config template task notifies a restart handler. You run the playbook twice. How many restarts happen, and why?
2. Why is `when: ansible_facts['os_family'] == "RedHat"` written without `{{ }}` when a module argument would need them?
3. A `command` task that only reads state makes your playbook report changes on every run. Which one line fixes it?

## Key takeaways

- A playbook is plays (hosts + tasks); name every task, quote modes like `'0644'`, and use two-space indentation.
- **Handlers run once, at the end, and only if notified by a task that changed** — `meta: flush_handlers` when you need them sooner.
- `loop` provides `item`; a list of dictionaries gives you `item.field`.
- In `when:` you're already inside a Jinja2 expression — no `{{ }}`; a list of conditions means AND.
- `register` captures results (`rc`, `stdout`, `changed`), and **`changed_when: false`** keeps read-only commands from breaking idempotency.
- `--syntax-check`, `--list-tasks`, `--check --diff`, `--limit`, and `--tags` are the everyday control surface.
