# Roles, Collections, and RHEL System Roles

> **The one-sentence version:** A **role** is a playbook's contents split into a standard directory layout so it can be reused and shared, a **collection** is how roles and modules are packaged and installed, and **RHEL system roles** are ready-made, Red-Hat-supported roles for common administration jobs.

## Why it matters

Roles are an explicit exam objective, and system roles are the fastest way to complete several tasks — configuring time synchronisation or SELinux via a supported role is quicker *and* more robust than writing the tasks yourself. Knowing they exist and how to read their documentation is worth real time.

## The role directory layout

```
roles/apache/
├── defaults/main.yml     # variables users are EXPECTED to override (lowest precedence)
├── vars/main.yml         # role-internal variables (high precedence)
├── tasks/main.yml        # the work — the only truly required part
├── handlers/main.yml     # handlers the tasks notify
├── templates/            # *.j2 files, found by name from tasks
├── files/                # static files for copy
├── meta/main.yml         # metadata and role dependencies
└── README.md
```

```bash
ansible-galaxy init roles/apache      # generates this skeleton for you
```

> 🔑 **`defaults/` versus `vars/` is the distinction to get right.** `defaults/main.yml` has the *lowest* precedence of any variable source, so it's where you put values you want a user to override. `vars/main.yml` is near the top and is for internal values the role depends on. If a role's setting can't be overridden from `group_vars`, someone put it in `vars/` when it belonged in `defaults/`.

Using a role:

```yaml
- hosts: webservers
  become: true
  roles:
    - apache

# ...or with variables, and with more control over ordering:
- hosts: webservers
  become: true
  tasks:
    - name: Apply the apache role
      ansible.builtin.include_role:
        name: apache
      vars:
        http_port: 8080
```

`roles:` runs before the play's `tasks:`. `include_role` (dynamic, evaluated when reached) and `import_role` (static, processed up front) let you place a role exactly where you want it in the sequence — `include_role` is the one that can sit behind a `when:` on a per-host basis.

## Collections

Collections are the packaging format for modules, roles, and plugins.

```bash
ansible-galaxy collection list                        # what's installed and where
ansible-galaxy collection install community.general
ansible-galaxy collection install -r requirements.yml -p collections/
ansible-galaxy role install -r requirements.yml -p roles/
```

A `requirements.yml` describes what a project needs:

```yaml
---
collections:
  - name: community.general
  - name: ansible.posix

roles:
  - name: geerlingguy.nginx
  - src: https://git.example.com/ops/myrole.git
    scm: git
    version: main
    name: myrole
```

Point Ansible at your project-local directories in `ansible.cfg` so everything stays self-contained:

```ini
[defaults]
roles_path = ./roles
collections_path = ./collections
```

> 💡 On an offline exam machine, collections are installed from a local source rather than the internet — a path or URL the task provides. The syntax is the same; only the source changes.

## RHEL system roles

Red Hat ships a set of supported roles for common administration jobs:

```bash
dnf install -y rhel-system-roles
ls /usr/share/ansible/roles/            # the roles
ls /usr/share/doc/rhel-system-roles/    # documentation AND example playbooks
```

They cover areas including time synchronisation, SELinux, firewall, storage, networking, logging, and kernel settings. Two things make them worth reaching for: they're **idempotent and tested**, and each ships **example playbooks** you can adapt rather than write from scratch.

```yaml
- hosts: all
  become: true
  vars:
    timesync_ntp_servers:
      - hostname: time.example.com
        iburst: true
  roles:
    - redhat.rhel_system_roles.timesync
```

```yaml
- hosts: all
  become: true
  vars:
    selinux_policy: targeted
    selinux_state: enforcing
    selinux_booleans:
      - name: httpd_can_network_connect
        state: on
        persistent: true
  roles:
    - redhat.rhel_system_roles.selinux
```

> 🔑 **The variables are the interface.** You don't read a system role's tasks; you read its documentation to learn which variables it takes, set them, and include the role. `/usr/share/doc/rhel-system-roles/<role>/` has a README and example playbooks for exactly that — the single most useful directory on the machine when a task names a system role.

Depending on the version installed, roles may be addressed by collection name (`redhat.rhel_system_roles.timesync`) or by plain role name (`rhel-system-roles.timesync`). Check `ls /usr/share/ansible/roles/` and `ansible-galaxy collection list` on the machine in front of you and use what's there.

## When to write your own role

Turn a playbook into a role when the same work applies to several groups, when a task explicitly asks for one, or when the playbook grows past comfortably reading in one screen. A good role has: sensible values in `defaults/`, no hardcoded hostnames, handlers for its own restarts, and templates that use its variables.

## Check yourself

1. Why does a value belong in a role's `defaults/main.yml` rather than `vars/main.yml` when you want users to be able to change it?
2. You need a role and a collection installed for a project without touching the system-wide paths. Which file describes them, and which command and flag install them locally?
3. A task says to configure time synchronisation using a RHEL system role. Where do you look first, and what are you looking for?

## Key takeaways

- A role is the standard layout: `tasks/`, `handlers/`, `templates/`, `files/`, `defaults/`, `vars/`, `meta/`. `ansible-galaxy init` scaffolds it.
- **`defaults/` is lowest precedence (meant to be overridden); `vars/` is high precedence (internal).**
- `roles:` runs before `tasks:`; `include_role` / `import_role` place a role precisely, and `include_role` can be conditional.
- Collections are installed with `ansible-galaxy collection install`, described by **`requirements.yml`**, and kept project-local via `roles_path` / `collections_path`.
- **RHEL system roles** (`rhel-system-roles`) are supported, idempotent roles configured entirely through **variables** — their docs and example playbooks live in `/usr/share/doc/rhel-system-roles/`.
