# Variables, Facts, and Ansible Vault

> **The one-sentence version:** Variables come from many places and there's a fixed precedence when they collide; **facts** are variables Ansible discovers about each host; and **Vault** is how secrets live in the same repository as everything else without being readable.

## Why it matters

Data is what makes a playbook reusable across hosts. Exam tasks routinely say "the value must come from a variable defined in `group_vars`" or "this file must contain the host's IP address" — both of which are questions about where data lives and how you reference it.

## Defining variables

```yaml
# In a play
- hosts: webservers
  vars:
    http_port: 80
    doc_root: /var/www/html

# From a file
- hosts: webservers
  vars_files:
    - vars/web.yml
```

Or, best of all, in files Ansible loads automatically by name:

```
group_vars/all.yml            # every host
group_vars/webservers.yml     # the webservers group
host_vars/web1.example.com.yml  # one host
```

Reference them with Jinja2:

```yaml
- name: Create the document root
  ansible.builtin.file:
    path: "{{ doc_root }}"
    state: directory
    mode: '0755'
```

> ⚠️ **Quote a value that starts with `{{`.** `path: {{ doc_root }}` is invalid YAML — the brace starts a dictionary. `path: "{{ doc_root }}"` is what you want. This is a rite of passage; expect to hit it once.

Dictionaries and lists work as you'd hope, with either syntax for access:

```yaml
web:
  port: 80
  root: /var/www/html
```

```
{{ web.port }}      or      {{ web['port'] }}
```

## Precedence (the practical version)

When the same variable is defined twice, the more specific definition wins. From weakest to strongest, the ones you'll actually meet:

| | Source |
|---|---|
| weakest | Role `defaults/main.yml` |
| | Inventory group vars (`group_vars/all.yml`, then more specific groups) |
| | Inventory host vars (`host_vars/<host>.yml`) |
| | Play `vars:`, `vars_files:` |
| | Task `vars:`, `set_fact` |
| strongest | **`-e` / `--extra-vars` on the command line** |

> 🔑 Two rules cover nearly every real case: **`--extra-vars` beats everything**, and **role `defaults/` loses to everything** — which is exactly why `defaults/` is where a role puts values it *expects* users to override. (The full ordering has more rungs; `ansible-doc` and the official docs have the complete list.)

## Facts

Facts are gathered automatically at the start of a play by the `setup` module — hundreds of values describing the host.

```yaml
- name: Show a few facts
  ansible.builtin.debug:
    msg: >
      {{ ansible_facts['fqdn'] }} runs
      {{ ansible_facts['distribution'] }} {{ ansible_facts['distribution_version'] }}
      with {{ ansible_facts['memtotal_mb'] }} MB RAM
```

The ones that come up constantly:

| Fact | Value |
|---|---|
| `ansible_facts['fqdn']` / `['hostname']` | Full and short hostname |
| `ansible_facts['default_ipv4']['address']` | Primary IP address |
| `ansible_facts['distribution']`, `['os_family']` | e.g. `RedHat`, `RedHat` |
| `ansible_facts['memtotal_mb']`, `['processor_vcpus']` | Size of the machine |
| `ansible_facts['devices']` | Block devices |

Find the exact name for anything with an ad-hoc call:

```bash
ansible web1 -m ansible.builtin.setup | less
ansible web1 -m ansible.builtin.setup -a "filter=ansible_default_ipv4"
```

Skip gathering when you don't need it (it's the slowest part of a short play):

```yaml
- hosts: all
  gather_facts: false
```

**Magic variables** aren't facts but behave like them: `inventory_hostname` (the name in the inventory), `groups` (the whole inventory as a dictionary), `hostvars` (another host's variables), and `ansible_play_hosts`.

### Custom facts

You can ship your own facts as files under `/etc/ansible/facts.d/` on the managed host, ending in `.fact`:

```ini
# /etc/ansible/facts.d/custom.fact
[general]
environment = production
tier = web
```

They appear under `ansible_facts['ansible_local']['custom']['general']['environment']`. INI and JSON are both accepted; an executable file that prints JSON works too.

### set_fact

```yaml
- name: Build a value during the run
  ansible.builtin.set_fact:
    app_url: "http://{{ ansible_facts['fqdn'] }}:{{ http_port }}"
```

## Ansible Vault

Vault encrypts files (or single values) so secrets can live in the repository.

```bash
ansible-vault create secrets.yml           # create a new encrypted file
ansible-vault edit secrets.yml             # decrypt, open $EDITOR, re-encrypt
ansible-vault view secrets.yml             # read without editing
ansible-vault encrypt existing.yml         # encrypt a plaintext file in place
ansible-vault decrypt secrets.yml          # back to plaintext
ansible-vault rekey secrets.yml            # change the password
```

Running a playbook that uses one:

```bash
ansible-playbook site.yml --ask-vault-pass
ansible-playbook site.yml --vault-password-file ~/.vault_pass
```

Or set it once in `ansible.cfg` so you never type it again:

```ini
[defaults]
vault_password_file = ~/.vault_pass
```

> ⚠️ If you use a password file, protect it — `chmod 600 ~/.vault_pass` — and never commit it. An encrypted vault whose password sits world-readable beside it has achieved nothing.

**Encrypting a single value** rather than a whole file, when everything else in the file is fine in plaintext:

```bash
ansible-vault encrypt_string 'S3cret!' --name 'db_password'
```

Paste the output straight into a vars file; it's a normal variable with an encrypted value.

> 💡 The common project pattern: `group_vars/webservers/vars.yml` holds ordinary variables referencing `{{ vault_db_password }}`, and `group_vars/webservers/vault.yml` is encrypted and defines it. Everything stays readable except the secret itself.

## Check yourself

1. `group_vars/all.yml` and `host_vars/web1.yml` both define `http_port`. Which applies on web1, and what would beat both?
2. You need a host's primary IP address in a template. What's the fact, and how would you have found its name?
3. A task needs a database password that mustn't be readable in the repository. Describe two ways Vault can do that.

## Key takeaways

- Variables come from play `vars`, `vars_files`, and especially **`group_vars/` and `host_vars/`**, loaded automatically by name.
- Precedence in practice: **`--extra-vars` wins, role `defaults/` loses**, host vars beat group vars.
- Always **quote** a value beginning with `{{`.
- **Facts** are gathered per host (`ansible_facts['fqdn']`, `['default_ipv4']['address']`…); find exact names with `-m setup -a "filter=…"`, and skip gathering with `gather_facts: false`.
- Custom facts live in `/etc/ansible/facts.d/*.fact` and surface under `ansible_local`.
- **Vault**: `create`/`edit`/`view`/`encrypt`/`rekey`, run with `--ask-vault-pass` or a `vault_password_file`, and `encrypt_string` for one value.
