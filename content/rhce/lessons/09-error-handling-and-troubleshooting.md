# Error Handling, Check Mode, and Debugging a Playbook

> **The one-sentence version:** Ansible stops a host at its first failed task by default — and `failed_when`, `changed_when`, `ignore_errors`, and `block`/`rescue` are how you redefine what failure means, while `--check`, `--diff`, and `-v` are how you find out what went wrong.

## Why it matters

Two things fail on the exam: playbooks, and idempotency. This lesson covers both — how to make a playbook survive expected errors, and how to stop it from reporting phantom changes on a second run.

## What "failed" and "changed" mean

Every task returns a status. A module decides `failed` and `changed` on its own, but you can override both.

```yaml
- name: A check that isn't a failure and isn't a change
  ansible.builtin.command: systemctl is-active httpd
  register: result
  failed_when: false          # never treat a non-zero exit as failure
  changed_when: false         # a read-only command changes nothing

- name: Fail on content rather than exit code
  ansible.builtin.command: /usr/local/bin/healthcheck
  register: health
  failed_when: "'ERROR' in health.stdout"

- name: Define what counts as a change
  ansible.builtin.command: /usr/local/bin/sync.sh
  register: sync
  changed_when: sync.rc == 2  # this script exits 2 when it did something
```

> 🔑 **`changed_when: false` is an idempotency tool, not cosmetics.** Any `command`/`shell` task that only *reads* state will otherwise report `changed` forever, and your playbook will never reach the `changed=0` second run that defines correct work.

## Carrying on past a failure

```yaml
- name: Try something optional
  ansible.builtin.command: /usr/local/bin/optional.sh
  ignore_errors: true
```

`ignore_errors: true` marks the task failed in the output but lets the play continue on that host. It's blunt — prefer `failed_when` when you can express *why* a particular result is acceptable.

## Blocks: try / rescue / always

```yaml
- name: Deploy with a fallback
  block:
    - name: Install the new config
      ansible.builtin.template:
        src: app.conf.j2
        dest: /etc/app/app.conf
        validate: '/usr/bin/app --test -c %s'

    - name: Restart the app
      ansible.builtin.service:
        name: app
        state: restarted

  rescue:
    - name: Put the known-good config back
      ansible.builtin.copy:
        src: files/app.conf.known-good
        dest: /etc/app/app.conf

    - name: Restart with the old config
      ansible.builtin.service:
        name: app
        state: restarted

  always:
    - name: Record what happened
      ansible.builtin.lineinfile:
        path: /var/log/deploy.log
        line: "Deploy attempted at {{ ansible_date_time.iso8601 }}"
        create: true
```

`block` groups tasks; `rescue` runs only if something in the block failed; `always` runs either way. It's try/catch/finally, and it's the right structure whenever a failure needs cleaning up rather than just stopping.

## Controlling the blast radius

```yaml
- hosts: webservers
  serial: 1                  # one host at a time — a rolling update
  max_fail_percentage: 25    # abort the play if more than a quarter fail
  any_errors_fatal: true     # any host failing stops the play for everyone
```

By default Ansible runs each task across all hosts, and a host that fails is simply dropped from the rest of the play while the others continue. These three settings change that: `serial` for rolling changes, `any_errors_fatal` when partial success is worse than none.

## Dry runs and diffs

```bash
ansible-playbook site.yml --syntax-check     # is the YAML/structure valid?
ansible-playbook site.yml --check            # what WOULD change
ansible-playbook site.yml --check --diff     # ...and show the file differences
ansible-playbook site.yml --list-tasks       # what would run, in order
ansible-playbook site.yml --limit web1       # blast radius of one
```

Not every module supports check mode faithfully — a `command` task, for instance, can't know what it would have done. Two controls help:

```yaml
- name: Always run this, even in check mode
  ansible.builtin.command: /usr/local/bin/gather-info
  check_mode: false
  changed_when: false
```

> 💡 `--check --diff` on a template task shows you the exact rendered text before it lands. That's the fastest way to catch a Jinja2 mistake, and much nicer than deploying it and reading the file afterwards.

## Debugging

```yaml
- name: Show a variable
  ansible.builtin.debug:
    var: ansible_facts['default_ipv4']

- name: Show a message
  ansible.builtin.debug:
    msg: "Port is {{ http_port }} on {{ inventory_hostname }}"

- name: Stop and let me look
  ansible.builtin.fail:
    msg: "Unexpected state: {{ result.stdout }}"
  when: result.rc != 0

- name: Assert an expectation
  ansible.builtin.assert:
    that:
      - http_port is defined
      - http_port | int > 0
    fail_msg: "http_port must be set to a positive number"
```

```bash
ansible-playbook site.yml -v        # task results
ansible-playbook site.yml -vvv      # includes the SSH commands and module arguments
ansible-playbook site.yml --step    # confirm each task interactively
ansible-playbook site.yml --start-at-task "Deploy the configuration"
```

## The common failures, and what they mean

| Message | Usual cause |
|---|---|
| `The task includes an option with an undefined variable` | A typo'd variable name, or one defined for a different host. Add `| default(...)` or check `group_vars`. |
| `Permission denied` on a file task | Missing `become: true` |
| `sudo: a password is required` | The remote user has no passwordless sudo rule |
| `Failed to connect ... Permission denied (publickey)` | SSH key or `remote_user` — test with `ansible all -m ping -vvv` |
| `could not find or access '...'` on a template | The file isn't in `templates/` relative to the playbook or role |
| YAML errors mentioning "could not find expected ':'" | An unquoted value starting with `{{`, or a stray tab |
| Second run still reports changes | A `command`/`shell` without `changed_when`, or `state: latest` |

## The habit to build

**Write, run, run again, and read the summary line.** The `PLAY RECAP` at the end tells you `ok`, `changed`, `unreachable`, `failed`, and `skipped` per host. A second run showing `changed=0` is the finish line for any exam task — before that, you're not done, however good the playbook looks.

## Check yourself

1. Your playbook reports two changed tasks on every run, but the system is already in the desired state. Where do you look first?
2. What's the difference between `ignore_errors: true` and `failed_when: false`, and which expresses intent better?
3. Which flags would you use to see exactly what a template task is about to write, without writing it?

## Key takeaways

- **`failed_when`** and **`changed_when`** redefine failure and change; `changed_when: false` on read-only commands is what keeps re-runs clean.
- `ignore_errors: true` continues past a failure bluntly; `failed_when` says *why* a result is acceptable.
- **`block`/`rescue`/`always`** is try/catch/finally, for failures that need cleanup or a rollback.
- `serial`, `any_errors_fatal`, and `max_fail_percentage` control how a failure spreads across hosts.
- **`--syntax-check`, `--check --diff`, `--list-tasks`, `--limit`, `-vvv`** are the debugging toolkit; `debug`, `fail`, and `assert` are the in-playbook ones.
- Judge every finished task by a **second run reporting `changed=0`**.
