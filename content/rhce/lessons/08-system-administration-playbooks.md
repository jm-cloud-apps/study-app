# RHCSA Tasks as Playbooks: Users, Packages, Storage, Services, Security

> **The one-sentence version:** Every task you learned to do by hand for RHCSA has a module — and this lesson is the translation table, because the exam is largely "do that, but as automation."

## Why it matters

This is where the two certifications meet. You already know that a shared directory needs setgid, that a non-standard port needs an SELinux label, and that a service needs enabling as well as starting. Here you learn which module expresses each of those, and which collection it lives in.

## Users, groups, and keys

```yaml
- name: Ensure the group exists
  ansible.builtin.group:
    name: devs
    state: present

- name: Create users
  ansible.builtin.user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
    append: true                       # the -aG of the module world
    shell: /bin/bash
    password: "{{ item.password | password_hash('sha512') }}"
    state: present
  loop: "{{ users }}"
  no_log: true                         # keep hashes out of the output

- name: Install an authorized key
  ansible.posix.authorized_key:
    user: ana
    state: present
    key: "{{ lookup('file', 'files/ana.pub') }}"
```

> ⚠️ **`append: true` matters exactly as much as `usermod -aG` did.** Without it, `groups:` replaces the user's supplementary groups. And `password:` needs a *hash*, not a plaintext password — hence `password_hash('sha512')`, usually over a Vault-encrypted variable, with `no_log: true` so it never appears in the run output.

## Packages and repositories

```yaml
- name: Install packages
  ansible.builtin.dnf:
    name:
      - httpd
      - firewalld
    state: present                     # 'latest' to upgrade, 'absent' to remove

- name: Install a package group
  ansible.builtin.dnf:
    name: "@Development Tools"
    state: present

- name: Configure a repository
  ansible.builtin.yum_repository:
    name: local-extras
    description: Local Extras
    baseurl: http://server.example.com/extras/
    enabled: true
    gpgcheck: false
```

> 💡 Prefer `state: present` to `state: latest` unless a task asks for upgrades. `latest` can report `changed` whenever an update exists upstream, which quietly breaks the "second run shows no changes" test you're grading yourself against.

## Services, cron, and boot targets

```yaml
- name: Start and enable a service
  ansible.builtin.service:
    name: httpd
    state: started
    enabled: true

- name: A scheduled job
  ansible.builtin.cron:
    name: "daily report"               # the NAME is the idempotency key
    user: ana
    minute: "15"
    hour: "6"
    weekday: "1-5"
    job: "/usr/local/bin/report.sh"
```

The `name:` on a cron entry is what Ansible uses to find and update the job later — it's written into the crontab as a comment. Without a stable name, you get a duplicate entry on every change.

## Storage

Storage modules come from `community.general` (LVM and partitioning) and `ansible.posix` (mounting):

```yaml
- name: Create a partition
  community.general.parted:
    device: /dev/vdb
    number: 1
    state: present
    part_end: 2GiB
    flags: [ lvm ]

- name: Volume group
  community.general.lvg:
    vg: vg_data
    pvs: /dev/vdb1

- name: Logical volume
  community.general.lvol:
    vg: vg_data
    lv: lv_app
    size: 2g

- name: Filesystem
  community.general.filesystem:
    fstype: xfs
    dev: /dev/vg_data/lv_app

- name: Mount it, and write it to fstab
  ansible.posix.mount:
    path: /data
    src: /dev/vg_data/lv_app
    fstype: xfs
    opts: defaults
    state: mounted                     # mounted = mount now AND add to fstab
```

> 🔑 **`state: mounted` is the one to remember.** `present` writes the fstab entry without mounting; `mounted` does both, which is what "persistently mounted" means. `absent` unmounts and removes the entry. This single parameter is the RHCSA persistence lesson, encoded.

To grow a volume later, `lvol` takes `size: +1g` with `resizefs: true` — the module's version of `lvextend -r`.

## Firewall and SELinux

```yaml
- name: Open a service in the firewall
  ansible.posix.firewalld:
    service: http
    state: enabled
    permanent: true
    immediate: true                    # BOTH: apply now and persist

- name: Open a port
  ansible.posix.firewalld:
    port: 8888/tcp
    state: enabled
    permanent: true
    immediate: true

- name: Set SELinux mode
  ansible.posix.selinux:
    policy: targeted
    state: enforcing

- name: Set a boolean persistently
  ansible.posix.seboolean:
    name: httpd_can_network_connect
    state: true
    persistent: true                   # the -P of setsebool

- name: Label a directory
  community.general.sefcontext:
    target: '/web(/.*)?'
    setype: httpd_sys_content_t
    state: present
  notify: Restore contexts
```

> ⚠️ **`permanent: true` alone changes nothing on the running firewall** — exactly like `firewall-cmd --permanent` without `--reload`. Set `immediate: true` as well, and you've got both halves in one task.

`sefcontext` records the policy rule, but — just as on the command line — something still has to apply it. A handler running `ansible.builtin.command: restorecon -Rv /web` (with an appropriate `changed_when`) is the usual pairing.

## The translation table

| By hand (RHCSA) | As a module |
|---|---|
| `useradd` / `usermod -aG` | `ansible.builtin.user` (with `append: true`) |
| `groupadd` | `ansible.builtin.group` |
| `dnf install` | `ansible.builtin.dnf` |
| a `.repo` file | `ansible.builtin.yum_repository` |
| `systemctl enable --now` | `ansible.builtin.service` (`state: started`, `enabled: true`) |
| `crontab -e` | `ansible.builtin.cron` |
| `pvcreate`/`vgcreate`/`lvcreate` | `community.general.lvg` / `lvol` |
| `mkfs` | `community.general.filesystem` |
| `mount` + `/etc/fstab` | `ansible.posix.mount` (`state: mounted`) |
| `firewall-cmd --permanent … --reload` | `ansible.posix.firewalld` (`permanent` + `immediate`) |
| `setsebool -P` | `ansible.posix.seboolean` (`persistent: true`) |
| `semanage fcontext` | `community.general.sefcontext` + a `restorecon` handler |
| `chmod` / `chown` / `mkdir` | `ansible.builtin.file` |

> 💡 When you can't recall a module's name, `ansible-doc -l | grep <keyword>` finds it and `ansible-doc -s <module>` gives you the skeleton. That two-command loop is faster than remembering, and it's always right for the version installed.

## Check yourself

1. Which parameter of `ansible.posix.mount` both mounts a filesystem and records it in `/etc/fstab`?
2. Why do `permanent: true` and `immediate: true` usually appear together on a `firewalld` task?
3. What does `append: true` do on the `user` module, and which RHCSA mistake does its absence reproduce?

## Key takeaways

- Most RHCSA work maps to one module; the collections to know are **`ansible.builtin`**, **`ansible.posix`** (firewalld, selinux, mount, authorized_key), and **`community.general`** (LVM, parted, filesystem, sefcontext).
- `user` needs **`append: true`**, a **hashed** password, and `no_log: true`.
- `ansible.posix.mount` with **`state: mounted`** is mount + fstab in one.
- `firewalld` needs **`permanent` and `immediate`**; `seboolean` needs **`persistent: true`**.
- Prefer `state: present` over `latest` so re-runs stay clean, and give `cron` entries a stable `name:`.
- `ansible-doc -l | grep` then `ansible-doc -s` beats recall, every time.
