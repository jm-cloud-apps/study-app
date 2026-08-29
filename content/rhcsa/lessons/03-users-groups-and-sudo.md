# Users, Groups, Password Policy, and sudo

> **The one-sentence version:** A user is a line in `/etc/passwd`, a password hash and its ageing rules are a line in `/etc/shadow`, group membership is a line in `/etc/group` — and `sudo` is a separate file that decides who may become root.

Nothing here is deep, but it's precise, and precision is what's graded.

## Why it matters

User tasks appear on essentially every exam attempt, often bundled with permissions ("create these users, put them in this group, make this directory theirs"). They're also the tasks where a small omission — a missing supplementary group, a password that isn't set to expire — quietly costs the whole item.

## The four files

| File | Holds | Read it with |
|---|---|---|
| `/etc/passwd` | username, UID, GID, comment, home, shell | `getent passwd ana` |
| `/etc/shadow` | password hash and ageing fields | `chage -l ana` |
| `/etc/group` | groups and their **supplementary** members | `getent group devs` |
| `/etc/login.defs` | defaults for new accounts (UID ranges, ageing) | — |

> 💡 Read these with `getent` rather than `cat` — it's the same answer for local accounts and still correct if the system ever gets a directory service.

## Creating and modifying users

```bash
useradd ana                                  # with defaults
useradd -u 1500 -G devs,wheel -c "Ana Cruz" -s /bin/bash ana
useradd -M -s /sbin/nologin svcacct          # no home, no login: a service account
passwd ana                                   # set the password interactively

usermod -aG devs raj        # ADD a supplementary group
usermod -L ana              # lock the password
usermod -U ana              # unlock
usermod -s /sbin/nologin ana
usermod -d /home/newhome -m ana   # move the home directory too

userdel raj                 # keep the home directory
userdel -r raj              # remove the home directory and mail spool
```

> ⚠️ **`-aG`, always.** `usermod -G devs raj` *replaces* raj's entire supplementary group list — silently dropping `wheel` and everything else. The `-a` (append) is the difference between adding a group and removing all the others. Verify with `id raj` every time.

Primary group vs. supplementary: `-g` sets the **primary** group (the one new files get); `-G` sets **supplementary** memberships. `id` shows both:

```bash
id ana
# uid=1500(ana) gid=1500(ana) groups=1500(ana),1001(devs),10(wheel)
#                └ primary ──┘ └────── supplementary ──────┘
```

## Groups

```bash
groupadd devs
groupadd -g 5000 ops        # specific GID
groupmod -n developers devs # rename
gpasswd -a ana devs         # another way to add a member
groupdel ops
```

## Password ageing

The exam likes ageing because it's specific and easy to verify.

```bash
chage -l ana                        # show current settings
chage -M 60 ana                     # must change at least every 60 days
chage -m 7 ana                      # can't change again for 7 days
chage -W 7 ana                      # warn 7 days before expiry
chage -E 2026-12-31 ana             # the ACCOUNT expires on this date
chage -d 0 ana                      # force a password change at next login
```

Two different "expiries" live here and are easy to mix up: **`-M`** expires the *password* (change it and carry on), while **`-E`** expires the *account* (no more logins at all). Defaults for **new** users come from `/etc/login.defs` (`PASS_MAX_DAYS`, `PASS_MIN_DAYS`, `PASS_WARN_AGE`) — changing that file does not retroactively change existing accounts.

## sudo

`sudo` is configured in `/etc/sudoers`, but you should almost never edit that file directly. Drop a file in `/etc/sudoers.d/` instead — it's easier to reason about and impossible to break the whole config with one typo.

```bash
visudo -f /etc/sudoers.d/devs      # visudo SYNTAX-CHECKS before saving
```

```
%devs       ALL=(ALL)       ALL             # group devs: any command, password required
ana         ALL=(ALL)       NOPASSWD: ALL   # user ana: any command, no password
raj         ALL=(root) /usr/bin/systemctl restart httpd    # exactly one command
```

Reading the syntax left to right: **who** — on which **hosts** — **(as whom)** — which **commands**. A `%` prefix means a group.

> 🔑 On Red Hat systems, membership in the **`wheel`** group already grants full sudo via a rule shipped in `/etc/sudoers`. "Give this user admin rights" is usually just `usermod -aG wheel <user>` — no new file needed.

> ⚠️ Use `visudo` (with `-f` for a drop-in) rather than a plain editor. It refuses to save a file with a syntax error, and a broken sudoers file can lock everyone out of root escalation on a system where you may not have a root password.

Verify what you configured — don't assume:

```bash
sudo -lU ana        # list the rules that apply to ana
```

## Check yourself

1. You run `usermod -G devs raj` and raj loses his sudo access. What happened, and what should you have typed?
2. What's the difference between `chage -M 60` and `chage -E 2026-12-31`?
3. A task says "ana may run any command as root without being prompted for a password." Write the sudoers line and the command you'd use to verify it.

## Key takeaways

- `/etc/passwd`, `/etc/shadow`, `/etc/group`, `/etc/login.defs` — read them with `getent` and `chage -l`.
- **`usermod -aG`** appends; without `-a` you replace and silently remove every other supplementary group. Verify with `id`.
- `-g` is the primary group, `-G` is supplementary; `useradd -M -s /sbin/nologin` is the service-account shape.
- `chage -M` ages the **password**; `chage -E` expires the **account**; `/etc/login.defs` only affects users created afterwards.
- Configure sudo with **`visudo -f /etc/sudoers.d/<file>`**, remember that `wheel` already has a rule, and confirm with `sudo -lU <user>`.
