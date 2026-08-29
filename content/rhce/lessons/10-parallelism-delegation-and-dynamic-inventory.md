# Advanced Features: Parallelism, Delegation, Async, and Dynamic Inventory

> **The one-sentence version:** Ansible runs each task across many hosts at once — **`forks`** decides how many, **`serial`** decides how many *should* change at a time, **`delegate_to`** runs a task somewhere other than the target host, and **`async`** stops a slow task from holding the whole play hostage.

## Why it matters

Everything so far assumed a handful of hosts and fast tasks. These features are what the exam objectives mean by "advanced features," and they're also the difference between a playbook that works and one you'd run against production: a rolling update rather than an outage, a load-balancer entry removed from the *load balancer* rather than from the web server, and a ten-minute job that doesn't time out.

## How Ansible runs a play by default

🔑 **Task-by-task, host-by-host in parallel.** Ansible runs task 1 on up to `forks` hosts simultaneously, waits for *all* hosts to finish it, then starts task 2. That's the `linear` strategy, and the waiting is deliberate: it means every host is at the same point in the play at the same time.

```ini
# ansible.cfg
[defaults]
forks = 20        # default is 5 — the number of hosts worked on simultaneously
```

```bash
ansible-playbook site.yml -f 20        # or per-run
```

> 💡 The default of **5** is conservative. With 50 hosts and 5 forks, every task runs in ten batches — which is why a big inventory feels slow before you touch anything else. Raising `forks` costs control-node CPU and memory, not managed-host resources.

If waiting for the slowest host at every step is the problem rather than the point:

```yaml
- hosts: all
  strategy: free        # each host races ahead through the play independently
```

## serial: rolling changes

```yaml
- name: Roll out one host at a time
  hosts: webservers
  serial: 1

- name: Or in growing batches — canary first
  hosts: webservers
  serial:
    - 1
    - 5
    - "50%"
```

`serial` splits the play into batches: the **entire play** runs on batch one, then on batch two, and so on. That's what makes a rolling update possible — take one server out, upgrade it, put it back, move on — and it's fundamentally different from `forks`, which only limits concurrency within a single task.

Pair it with failure control so a bad release stops rather than spreads:

```yaml
- hosts: webservers
  serial: 1
  max_fail_percentage: 0      # any failure ends the play — no further batches
```

## delegate_to and run_once

```yaml
- name: Remove this host from the load balancer
  ansible.builtin.command: >
    /usr/local/bin/lb-drain {{ inventory_hostname }}
  delegate_to: lb1.example.com

- name: Update DNS, from the control node
  ansible.builtin.uri:
    url: "https://dns.example.com/api/record"
    method: POST
  delegate_to: localhost

- name: Run the database migration exactly once
  ansible.builtin.command: /usr/local/bin/migrate.sh
  run_once: true
  delegate_to: "{{ groups['dbservers'][0] }}"
```

**`delegate_to`** runs the task on a different host while the loop variables and facts still refer to the *original* target — which is exactly what "tell the load balancer about this web server" needs. **`run_once: true`** runs the task on the first host of the batch only, and shares the result with the rest; combine the two for "one migration, on a specific machine."

> 💡 `delegate_to: localhost` is how you do anything from the control node — API calls, generating a file, checking something centrally. Add `become: false` if the local user doesn't need (or have) sudo.

## Long-running tasks: async and poll

By default Ansible holds an SSH connection open for the whole task, and a task longer than the connection timeout can fail even though the command is still working.

```yaml
- name: A slow job, checked every 10 seconds
  ansible.builtin.command: /usr/local/bin/reindex.sh
  async: 1800        # allow up to 30 minutes
  poll: 10           # check every 10s

- name: Fire and forget — start it and move on
  ansible.builtin.command: /usr/local/bin/warm-cache.sh
  async: 3600
  poll: 0
  register: warm_job

- name: ...and collect the result later
  ansible.builtin.async_status:
    jid: "{{ warm_job.ansible_job_id }}"
  register: job_result
  until: job_result.finished
  retries: 60
  delay: 10
```

**`poll: 0`** is fire-and-forget: the task starts and the play continues immediately, and you check back with `async_status`. With `poll: <n>` Ansible waits, but by polling rather than holding a connection open.

## Reboots

```yaml
- name: Reboot and wait for the host to come back
  ansible.builtin.reboot:
    reboot_timeout: 600
    msg: "Rebooting for a kernel update"

- name: Or just wait for a host you rebooted another way
  ansible.builtin.wait_for_connection:
    delay: 10
    timeout: 300
```

The `reboot` module handles the awkward part — the connection dropping — and returns only once the host answers again. Doing this with `command: reboot` instead produces a failed task, because the connection dies before the module can report success.

## Host patterns and --limit

```bash
ansible-playbook site.yml --limit webservers
ansible-playbook site.yml --limit 'webservers:!web1'      # the group, except web1
ansible-playbook site.yml --limit 'webservers:&production' # in BOTH groups
ansible-playbook site.yml --limit 'web*'
ansible-playbook site.yml --limit @retry-hosts.txt        # hosts listed in a file
```

`:` is union, `!` excludes, `&` intersects. The same patterns work in a play's `hosts:` line — `hosts: webservers:!web1` is valid — and `--limit` narrows whatever the play already targets. It never *widens* it.

## Dynamic inventory

A static inventory file goes stale the moment a machine is created or destroyed. A **dynamic inventory** asks a source — a cloud API, a CMDB, a script — at run time.

Modern dynamic inventories are **plugins configured by a YAML file**, whose name must match what the plugin expects:

```yaml
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
keyed_groups:
  - key: tags.Role
    prefix: role
```

```bash
ansible-inventory -i inventory/aws_ec2.yml --graph
ansible-inventory -i inventory/aws_ec2.yml --list
```

The older form is an **executable script** that prints JSON: called with `--list` it returns all groups and hosts, and with `--host <name>` the variables for one host. Ansible treats any executable file in an inventory directory as one of these.

> 🔑 **The important part is that everything else stays the same.** Point `inventory` in `ansible.cfg` at a *directory*, drop both a static file and a dynamic source in it, and Ansible merges them — your plays, groups, and `group_vars` don't change at all. And **always verify with `ansible-inventory --graph`** rather than assuming a dynamic source produced the groups you expect.

## Check yourself

1. What's the difference between `forks: 10` and `serial: 10`?
2. A task must remove the current web server from a load balancer that runs on another host. Which keyword, and why not just target the load balancer group?
3. A command takes 20 minutes and the play keeps failing on connection timeout. What are the two keywords that fix it?

## Key takeaways

- Ansible runs **task-by-task across hosts**, `forks` (default **5**) capping concurrency; `strategy: free` lets hosts race ahead independently.
- **`serial`** batches the whole play for rolling updates — pair with `max_fail_percentage` so a bad release stops early.
- **`delegate_to`** runs a task elsewhere while variables still refer to the original host; `delegate_to: localhost` means the control node; **`run_once: true`** does it a single time.
- **`async` + `poll`** survive long tasks; `poll: 0` is fire-and-forget, collected later with **`async_status`**.
- Use the **`reboot`** module (not `command: reboot`), or `wait_for_connection`.
- Host patterns compose with `:` (union), `!` (exclude), `&` (intersect); `--limit` only narrows.
- **Dynamic inventory** is a plugin config or a JSON-printing script; merge it with static files in an inventory *directory* and verify with **`ansible-inventory --graph`**.
