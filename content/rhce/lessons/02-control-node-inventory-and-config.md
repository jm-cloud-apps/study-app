# The Control Node: ansible.cfg, Inventory, and Getting Connected

> **The one-sentence version:** An Ansible project is three things — a **config file** that says where everything lives, an **inventory** that lists the hosts and groups, and credentials that let you reach them — and getting those right first makes every later task straightforward.

This is the least glamorous lesson and the one that saves the most time. Nearly every "Ansible isn't working" problem is here.

## Why it matters

If `ansible all -m ping` doesn't answer, nothing else you write matters. Building this skeleton confidently in a few minutes is a genuine exam skill, and it's the same skeleton for every project you'll ever start.

## ansible.cfg, and how it's found

Ansible looks for its configuration in a fixed order and uses **the first one it finds** — it does not merge them:

1. `$ANSIBLE_CONFIG` (an environment variable pointing at a file)
2. `./ansible.cfg` (in the current working directory)
3. `~/.ansible.cfg`
4. `/etc/ansible/ansible.cfg`

> 🔑 **Number 2 is why you always work from the project directory.** A project-local `ansible.cfg` makes the project self-contained and portable, and it's what exam tasks assume. Run `ansible --version` to see which config file is actually in effect — the output names it.

A practical starting file:

```ini
[defaults]
inventory      = ./inventory
remote_user    = ansible
host_key_checking = False
collections_path = ./collections
roles_path     = ./roles

[privilege_escalation]
become         = True
become_method  = sudo
become_user    = root
become_ask_pass = False
```

With `become = True` set here, you don't need `become: true` in every play — though writing it in the play is clearer and worth doing anyway.

> ⚠️ Ansible **ignores** an `ansible.cfg` in a world-writable directory, for security. If your config seems to have no effect, check the directory's permissions — this is a genuinely baffling failure the first time you meet it.

## Inventory

The inventory lists managed hosts and puts them in groups. INI format is the quickest to type:

```ini
[webservers]
web1.example.com
web2.example.com

[dbservers]
db1.example.com

[production:children]
webservers
dbservers

[webservers:vars]
http_port=80
```

The same thing in YAML:

```yaml
all:
  children:
    webservers:
      hosts:
        web1.example.com:
        web2.example.com:
      vars:
        http_port: 80
    dbservers:
      hosts:
        db1.example.com:
```

Useful details:

- **Ranges** save typing: `web[1:3].example.com` expands to web1, web2, web3.
- Two groups always exist: **`all`** (every host) and **`ungrouped`**.
- A host can be in many groups — that's how "all production web servers" works.
- Per-host connection settings live as host variables: `web1.example.com ansible_host=192.168.1.10 ansible_user=ansible`.

**Always verify what Ansible thinks your inventory says:**

```bash
ansible-inventory --list           # everything, as JSON
ansible-inventory --graph          # the tree, much easier to read
ansible all --list-hosts
ansible webservers --list-hosts
```

## Variables that belong to hosts and groups

Rather than putting variables in the inventory file, put them in directories next to it. Ansible loads them automatically by name:

```
inventory
group_vars/
  all.yml
  webservers.yml
host_vars/
  web1.example.com.yml
```

`group_vars/webservers.yml` applies to every host in `webservers`; `host_vars/web1.example.com.yml` applies to that one host and wins over the group. This is where most real configuration data lives.

## Connecting

Ansible connects over SSH and needs a user that can escalate. The setup, done once:

```bash
ssh-keygen -t ed25519                      # on the control node, as your automation user
ssh-copy-id ansible@web1.example.com       # repeat per host
```

On each managed host, that user needs passwordless sudo — a file in `/etc/sudoers.d/`:

```
ansible   ALL=(ALL)   NOPASSWD: ALL
```

**Then prove it:**

```bash
ansible all -m ping                 # "pong" from every host
ansible all -m ping --one-line      # compact
ansible all -a "id" -b              # run as root via become
```

> 💡 `-m ping` isn't ICMP — it's an Ansible module that connects over SSH, starts Python on the far end, and reports back. A `pong` therefore proves SSH, Python, and the inventory entry all work at once. It's the right first command whenever something is wrong.

## When it doesn't connect

```bash
ansible all -m ping -vvv            # verbose: shows the exact SSH command used
```

| Symptom | Usual cause |
|---|---|
| `Permission denied (publickey,password)` | Key not copied, or `remote_user` is wrong |
| `Host key verification failed` | New host fingerprint; `host_key_checking = False` or accept it once by hand |
| `sudo: a password is required` | Missing `NOPASSWD` sudoers rule for the automation user |
| `command not found: python` | No Python on the managed host, or the wrong interpreter path |
| Config changes ignored | Wrong `ansible.cfg` in effect (`ansible --version`), or a world-writable project directory |

## Check yourself

1. You edited `ansible.cfg` and nothing changed. Name two reasons that happens and the command that tells you which config is in effect.
2. What's the difference between `group_vars/webservers.yml` and `host_vars/web1.example.com.yml`, and which wins?
3. Why is `ansible all -m ping` a better first troubleshooting step than `ping web1.example.com`?

## Key takeaways

- Ansible uses the **first** config it finds — `$ANSIBLE_CONFIG`, `./ansible.cfg`, `~/.ansible.cfg`, `/etc/ansible/ansible.cfg` — and ignores one in a world-writable directory. `ansible --version` names the one in effect.
- Work from a **project directory** with its own `ansible.cfg`, inventory, and `roles/`.
- Inventories group hosts (`[group:children]` nests them); verify with **`ansible-inventory --graph`**, never by eye.
- Put data in **`group_vars/`** and **`host_vars/`**; host variables beat group variables.
- Connectivity = SSH key + passwordless sudo, proven by **`ansible all -m ping`**, debugged with `-vvv`.
