# Ad-Hoc Commands, Modules, and Reading the Docs Fast

> **The one-sentence version:** An ad-hoc command runs one module against one group of hosts without writing a playbook — it's how you check reality, and it's also the fastest way to learn what a module does before you commit it to a file.

Everything a playbook does is a module call. Getting comfortable calling them one at a time makes playbooks feel like assembling parts you already know.

## Why it matters

Under time pressure, the difference between "I think the `user` module has a `groups` parameter" and *knowing* is one `ansible-doc` away. And when a playbook produces a surprising result, an ad-hoc command tells you what the managed host actually looks like right now.

## The shape of an ad-hoc command

```bash
ansible <host-pattern> -m <module> -a "<arguments>" [-b]
```

```bash
ansible all -m ping
ansible webservers -m ansible.builtin.dnf -a "name=httpd state=present" -b
ansible all -m ansible.builtin.service -a "name=httpd state=started enabled=true" -b
ansible all -m ansible.builtin.command -a "uptime"
ansible all -m ansible.builtin.setup -a "filter=ansible_distribution*"
ansible web1 -m ansible.builtin.copy -a "src=/tmp/f dest=/etc/f owner=root mode=0644" -b
```

`-b` is `--become` — run with privilege escalation. Without it you're the remote user, and anything touching `/etc` fails.

Host patterns are more expressive than they look: `all`, a group name, `web*`, `webservers:dbservers` (either), `webservers:!web1` (except), and `--limit` to narrow any of them further.

## Fully qualified names

Modules live in **collections**, and their full name is `namespace.collection.module` — `ansible.builtin.copy`, `ansible.posix.firewalld`, `community.general.lvol`. Short names still work for `ansible.builtin` modules, but writing the FQCN is unambiguous, matches the documentation, and is the habit to build:

| Collection | Typical contents |
|---|---|
| `ansible.builtin` | The core set: `copy`, `file`, `template`, `user`, `service`, `dnf`, `lineinfile`, `command` |
| `ansible.posix` | `firewalld`, `selinux`, `seboolean`, `mount`, `authorized_key`, `sysctl` |
| `community.general` | Broad extras, including LVM (`lvg`, `lvol`), `parted`, `filesystem` |
| `redhat.rhel_system_roles` | The RHEL system roles (lesson 7) |

```bash
ansible-galaxy collection list         # what's installed, and where
```

## Reading the docs on the machine

```bash
ansible-doc -l                  # every module available (pipe to grep)
ansible-doc -l | grep firewall
ansible-doc user                # full documentation, with examples at the end
ansible-doc -s user             # SNIPPET: a copy-pasteable skeleton of the options
ansible-doc ansible.posix.firewalld
```

> 🔑 **`ansible-doc -s <module>` is the single most useful command on the exam.** It prints a ready-made YAML skeleton listing every parameter with a one-line comment. Paste it into your playbook, delete what you don't need, and you've avoided every possible typo in a parameter name.

The **EXAMPLES** section at the bottom of `ansible-doc <module>` is equally valuable — those are working, tested snippets for the exact module you're using.

> 💡 If your environment uses `ansible-navigator` (with execution environments), the equivalents are `ansible-navigator doc <module>` and `ansible-navigator collections` to browse what's available. Same documentation, different front door — check which tooling the machine in front of you has.

## Idempotency, seen live

Ad-hoc commands are a good way to *feel* what idempotency means. Run this twice:

```bash
ansible web1 -m ansible.builtin.user -a "name=testuser state=present" -b
# first run:  "changed": true
# second run: "changed": false
```

Now the counterexample:

```bash
ansible web1 -m ansible.builtin.command -a "useradd testuser2" -b
# first run:  changed (and succeeds)
# second run: changed (and FAILS — the user already exists)
```

> ⚠️ **`command` and `shell` are the escape hatch, not the tool.** `command` runs a program directly; `shell` runs it through a shell, so it's the one you need for pipes, redirects, and variable expansion — and the one with more ways to surprise you. Before using either, spend fifteen seconds on `ansible-doc -l | grep <thing>` to check whether a real module exists. There usually is one.

## Checking reality with facts

`setup` is the module that gathers facts, and running it ad-hoc is how you find the exact fact name you want in a template later:

```bash
ansible web1 -m ansible.builtin.setup | less
ansible web1 -m ansible.builtin.setup -a "filter=ansible_default_ipv4"
ansible all -m ansible.builtin.setup -a "filter=ansible_memtotal_mb"
```

## Check yourself

1. Which flag makes an ad-hoc command run with privilege escalation, and what typically fails without it?
2. You can't remember a module's parameter names. Which single command gives you a paste-ready skeleton?
3. Why does `ansible all -m command -a "useradd bob"` fail on its second run when the `user` module doesn't?

## Key takeaways

- `ansible <pattern> -m <module> -a "<args>" -b` is the ad-hoc shape; patterns support wildcards, unions (`:`) and exclusions (`:!`).
- Modules live in **collections**; prefer the **FQCN** (`ansible.posix.firewalld`) and check what's installed with `ansible-galaxy collection list`.
- **`ansible-doc -s <module>`** prints a paste-ready skeleton — the fastest correct thing you can do under time pressure — and `ansible-doc <module>` ends with working examples.
- Real modules are idempotent; **`command`/`shell` are not** and are a last resort after checking for a proper module.
- `-m setup` (optionally with `filter=`) shows a host's facts, which is how you find exact fact names.
