# SELinux in Practice: Contexts, Booleans, Ports

> **The one-sentence version:** SELinux labels every file and process with a **context**, and a denial means the label is wrong — so the whole practical skill is reading the label, fixing it with `semanage` + `restorecon`, and knowing the two shortcuts (booleans and port labels) that solve most of the rest.

The instinct when SELinux blocks something is to turn it off. Resist it: on the exam, disabling SELinux fails the task, and in real life it removes a genuinely useful layer. Fixing a label takes about as long as disabling it.

## Why it matters

SELinux is the thing that makes a service "work perfectly, but only when the files are in the default location." Almost every service task has an SELinux tail: a non-standard document root, a non-standard port, a home directory being served. Knowing three commands turns those from mysteries into routine.

## Modes

```bash
getenforce                 # Enforcing | Permissive | Disabled
sestatus                   # fuller status, including the policy in use
setenforce 0               # -> Permissive, RIGHT NOW (temporary)
setenforce 1               # -> Enforcing
```

Permissive doesn't block anything; it just logs what it *would* have blocked — which makes it a diagnostic tool, not a fix. The persistent setting is in `/etc/selinux/config`:

```
SELINUX=enforcing
SELINUXTYPE=targeted
```

> ⚠️ If a task asks for a mode, set it in **both** places — `setenforce` for now and `/etc/selinux/config` for the reboot. And note that switching from `disabled` to `enforcing` requires a relabel of the whole filesystem: `touch /.autorelabel` and reboot.

## Contexts: the thing that's actually wrong

Everything has a context. `-Z` shows it, on almost every tool you already use:

```bash
ls -Z /var/www/html/index.html
# system_u:object_r:httpd_sys_content_t:s0  index.html
ps -Z ; id -Z
```

The four fields are **user:role:type:level**. In the default `targeted` policy, only the **type** (`httpd_sys_content_t` here) does the day-to-day work: a process running as `httpd_t` is allowed to read files labelled `httpd_sys_content_t`, and denied nearly everything else.

🔑 **Files inherit the label of the directory they're created in — but keep their own label when they're *moved*.** That's why `cp` usually works and `mv` mysteriously doesn't: `mv /root/index.html /var/www/html/` carries `admin_home_t` along with it, and httpd is denied. `cp` (or `restorecon` afterwards) gives it the destination's label.

## Fixing a label, permanently

Two commands, always in this order:

```bash
semanage fcontext -a -t httpd_sys_content_t "/web(/.*)?"    # 1. record the RULE
restorecon -Rv /web                                          # 2. APPLY it to the files
```

`semanage fcontext -a` writes a policy rule mapping a path pattern to a type; `restorecon` walks the files and sets labels to whatever policy says they should be. The regex `(/.*)?` means "this directory and everything under it" — it's boilerplate, memorise it.

```bash
semanage fcontext -l | grep '/var/www'    # what does policy say about a path?
semanage fcontext -d "/web(/.*)?"         # delete a rule you added
restorecon -Rv /var/www/html              # reset anything that drifted
```

> ⚠️ `chcon -t httpd_sys_content_t /web` changes a label directly and is **not persistent** in the way that counts: the next `restorecon` or filesystem relabel reverts it, because policy never learned about your path. Use `chcon` to test a theory quickly, `semanage fcontext` + `restorecon` to fix it for good.

## Booleans: policy switches

Booleans are pre-built on/off answers to "should this service be allowed to do this optional thing?"

```bash
getsebool -a | grep httpd                 # every httpd boolean and its state
semanage boolean -l | grep httpd          # same, with descriptions and defaults
setsebool -P httpd_enable_homedirs on     # -P = PERSISTENT
setsebool -P httpd_can_network_connect on
```

> 🔑 **`-P` or it didn't happen.** Without it the boolean flips until reboot. This is the SELinux version of `--permanent`.

## Ports

Running a service on a non-standard port needs the *port* labelled too:

```bash
semanage port -l | grep http_port_t             # which ports carry this label
semanage port -a -t http_port_t -p tcp 8888     # add a port
semanage port -m -t http_port_t -p tcp 8888     # modify one that already exists
semanage port -d -t http_port_t -p tcp 8888     # delete
```

The classic symptom: a config change to `Listen 8888`, the firewall opened, and the service still refuses to start. That's SELinux, and this is the fix.

## Reading denials

```bash
ausearch -m AVC -ts recent          # recent denials from the audit log
ausearch -m AVC -ts today | audit2why    # ...with a plain-English explanation
sealert -a /var/log/audit/audit.log      # setroubleshoot's detailed analysis
journalctl -t setroubleshoot             # its summaries in the journal
```

`audit2why` is the fastest path from a denial to a cause, and it will often name the exact boolean you need. `ausearch`/`semanage` come from `policycoreutils-python-utils`, and `sealert` from `setroubleshoot-server` — install them if they're missing.

> 💡 `audit2allow` can generate a custom policy module from denials. It's a legitimate last resort, but be suspicious: if the answer is a boolean or a file label, the custom module is papering over a mislabelled file rather than fixing it.

## The debugging habit

When a service misbehaves, ask in this order: **is it running** (`systemctl status`), **is it listening** (`ss -tulpn`), **is the firewall open** (`firewall-cmd --list-all`), **is SELinux denying** (`ausearch -m AVC -ts recent`). Four checks, in that order, and you'll rarely be lost.

## Check yourself

1. You `mv` a file into `/var/www/html` and Apache returns 403, but a file you created there directly works fine. Why, and what's the one-command fix?
2. What's the difference between `chcon` and `semanage fcontext -a` + `restorecon`, and when is each appropriate?
3. A service is configured to listen on port 8888, the firewall is open, and it still won't start. What's your next command?

## Key takeaways

- Modes: `getenforce` / `setenforce` for now, `/etc/selinux/config` for the reboot. Never "solve" a task by disabling SELinux.
- The **type** field in the context is what matters; `-Z` shows it on `ls`, `ps`, and `id`.
- **Moved files keep their old label**; copied and newly created files inherit the destination's.
- Fix labels with **`semanage fcontext -a -t <type> "/path(/.*)?"` then `restorecon -Rv /path`** — `chcon` is a temporary test, not a fix.
- Booleans are policy switches: `setsebool -P` (the `-P` is the whole point).
- Non-standard ports need `semanage port -a -t <type> -p tcp <port>`.
- `ausearch -m AVC -ts recent | audit2why` turns a denial into an explanation, often naming the boolean you need.
