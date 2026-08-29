# Templates, Jinja2, and Managing File Content

> **The one-sentence version:** `copy` puts a fixed file on a host, `template` renders a Jinja2 file with that host's own variables and facts, and `lineinfile`/`blockinfile` surgically edit files you don't own — and choosing correctly between them is most of the skill.

## Why it matters

"Deploy a file whose contents differ per host" is such a common exam task that it's almost a genre: an `index.html` containing the server's FQDN, a config file with the host's IP, a motd naming the environment. That's `template` plus one fact, every time.

## Choosing the right module

| Module | Use when |
|---|---|
| `ansible.builtin.copy` | The content is identical on every host (or given inline with `content:`) |
| `ansible.builtin.template` | The content depends on variables or facts |
| `ansible.builtin.lineinfile` | You need one line present/absent/changed in a file someone else manages |
| `ansible.builtin.blockinfile` | Same, but a marked multi-line block |
| `ansible.builtin.file` | You care about the path itself: directories, symlinks, ownership, deletion |

```yaml
- name: A fixed file
  ansible.builtin.copy:
    src: files/motd
    dest: /etc/motd
    owner: root
    group: root
    mode: '0644'

- name: A short file written inline
  ansible.builtin.copy:
    content: "Managed by Ansible\n"
    dest: /etc/motd
    mode: '0644'

- name: A directory
  ansible.builtin.file:
    path: /var/www/html
    state: directory
    owner: apache
    group: apache
    mode: '0755'
```

## Templates

A template is an ordinary text file with Jinja2 expressions in it, conventionally named `*.j2` and kept in `templates/`.

```jinja
{# templates/index.html.j2 #}
<html>
  <body>
    <h1>Welcome to {{ ansible_facts['fqdn'] }}</h1>
    <p>Address: {{ ansible_facts['default_ipv4']['address'] }}</p>
    <p>Environment: {{ env | default('development') }}</p>
  </body>
</html>
```

```yaml
- name: Deploy the index page
  ansible.builtin.template:
    src: index.html.j2
    dest: /var/www/html/index.html
    owner: apache
    group: apache
    mode: '0644'
  notify: Restart httpd
```

Ansible looks for `src:` in the play's `templates/` directory (and a role's `templates/`), so a bare filename is normal and correct.

### Jinja2 you'll actually use

```jinja
{{ variable }}                          {# substitute #}
{{ ansible_facts['hostname'] }}

{% if http_port == 80 %}                {# conditional #}
Listen 80
{% else %}
Listen {{ http_port }}
{% endif %}

{% for host in groups['webservers'] %}  {# loop over an inventory group #}
server {{ hostvars[host]['ansible_facts']['default_ipv4']['address'] }};
{% endfor %}

{# this is a comment and won't appear in the output #}
```

That `for` loop over `groups[...]` with `hostvars` is the classic "generate a load balancer config listing every backend" pattern — worth recognising instantly.

### Filters worth knowing

```jinja
{{ name | upper }}                  {# and lower, capitalize #}
{{ port | default(80) }}            {# a fallback when undefined #}
{{ mylist | join(', ') }}
{{ mylist | length }}
{{ path | basename }}               {# and dirname #}
{{ value | int }}                   {# and bool, float #}
{{ mydict | to_nice_json }}         {# and to_nice_yaml #}
```

`default()` is the one that saves playbooks: it turns a missing variable from a fatal error into a sensible value.

> 💡 Whitespace control: `{%- ... -%}` strips surrounding blank lines. Cosmetic in most config files, but it matters when the file's format is strict.

### Validating before you break something

```yaml
- name: Deploy sudoers safely
  ansible.builtin.template:
    src: devs.j2
    dest: /etc/sudoers.d/devs
    mode: '0440'
    validate: 'visudo -cf %s'
```

`validate:` runs a checker against a temporary copy (`%s`) and refuses to install the file if it fails. For a sudoers file or an sshd config, this is the difference between a bad template and an unusable machine.

## Editing files you don't own

```yaml
- name: Ensure a setting exists
  ansible.builtin.lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^PermitRootLogin'
    line: 'PermitRootLogin no'
    state: present
    validate: '/usr/sbin/sshd -t -f %s'
  notify: Restart sshd

- name: Manage a block
  ansible.builtin.blockinfile:
    path: /etc/hosts
    block: |
      192.168.1.10  web1.example.com
      192.168.1.11  web2.example.com
    marker: "# {mark} ANSIBLE MANAGED: web hosts"
```

> 🔑 **`regexp:` is what makes `lineinfile` idempotent.** With it, the module finds the existing line and replaces it; without it, it appends a new line every time the desired text differs — and your file grows on each run. If you find yourself using several `lineinfile` tasks on the same file, that's the signal to switch to a `template` and own the whole file instead.

`blockinfile` manages a delimited region, which it recognises by its `marker` — so it can update or remove the block later without touching the rest of the file.

## Fetching files back

```yaml
- name: Collect a log from each host
  ansible.builtin.fetch:
    src: /var/log/messages
    dest: /tmp/collected/
    flat: false
```

`fetch` is `copy` in reverse, and it stores each host's file under its own directory by default so results don't collide.

## Check yourself

1. A task requires each web server's homepage to display its own FQDN. Which module, and which fact?
2. Why does `lineinfile` without `regexp:` risk appending a new line on every run, and when should you switch to a template?
3. What does `validate: 'visudo -cf %s'` protect you from?

## Key takeaways

- **`copy`** for identical content, **`template`** when it varies per host, **`lineinfile`/`blockinfile`** for files you only partly own, **`file`** for the path itself.
- Templates live in `templates/` as `*.j2`; inside them, `{{ }}` substitutes, `{% %}` controls flow, and `{# #}` comments.
- `groups[...]` + `hostvars[...]` in a `for` loop generates configuration that lists other hosts.
- `default()` turns a missing variable into a fallback instead of a failure.
- **`validate:`** checks a rendered file before installing it — essential for sudoers and sshd.
- **`regexp:` is what makes `lineinfile` idempotent**; several of them on one file means you want a template.
