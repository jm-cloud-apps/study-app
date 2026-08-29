# Software, Scheduled Jobs, Time, and Logs

> **The one-sentence version:** `dnf` installs and rolls back software, cron and systemd timers run things later, `chrony` keeps the clock honest, and `journalctl` is where you find out what actually happened — with one setting deciding whether yesterday's logs still exist.

Four small domains that show up as one-line requirements inside larger tasks.

## Why it matters

Every one of these is a "and also…" clause: *and also install this package group*, *and also run it every day at 03:00*, *and also make sure logs survive a reboot*. They're quick points when you know them cold and irritating time sinks when you don't.

## dnf: packages

```bash
dnf install -y httpd                 # install
dnf remove -y httpd                  # remove
dnf update -y                        # everything
dnf list installed | grep http       # what's on the box
dnf search selinux                   # find by keyword
dnf info httpd                       # version, size, description
dnf provides '*/semanage'            # WHICH package provides this file/command
dnf group list                       # available groups
dnf group install "Development Tools"
dnf history                          # every transaction, numbered
dnf history undo 12                  # roll one back
```

> 💡 `dnf provides '*/<command>'` is the one to remember when a command is missing. `semanage`, for instance, lives in `policycoreutils-python-utils` — a fact worth knowing rather than deriving under pressure.

`rpm` answers questions about installed packages: `rpm -q httpd` (is it installed), `rpm -ql httpd` (what files did it install), `rpm -qf /etc/httpd/conf/httpd.conf` (which package owns this file).

### Adding a repository

Create `/etc/yum.repos.d/<name>.repo`:

```ini
[local-extras]
name=Local Extras
baseurl=http://server.example.com/extras/
enabled=1
gpgcheck=1
gpgkey=http://server.example.com/RPM-GPG-KEY-example
```

Then `dnf repolist` to confirm it's seen, and `dnf clean all` if a stale cache is getting in the way. If a task supplies no GPG key, `gpgcheck=0` is acceptable *for that task* — but say it out loud so you notice you did it.

Some RHEL versions also ship **modules** (multiple versions of the same software): `dnf module list`, `dnf module enable <name>:<stream>`, `dnf module install <name>`. Check whether they exist on the version you're studying — the tooling has changed across releases.

## Scheduling: cron, at, and timers

**cron** for anything recurring:

```bash
crontab -e            # edit YOUR crontab
crontab -e -u ana     # edit ana's (as root)
crontab -l -u ana     # list it
crontab -r            # remove it entirely (careful)
```

The five fields are **minute, hour, day-of-month, month, day-of-week**:

```
30 3 * * *      /usr/local/bin/backup.sh        # 03:30 every day
*/10 * * * *    /usr/local/bin/check.sh         # every 10 minutes
0 2 * * 0       /usr/local/bin/weekly.sh        # 02:00 on Sundays
```

System-wide jobs go in `/etc/cron.d/` and in `/etc/crontab`, which have an **extra field for the user** between the schedule and the command:

```
0 4 * * *   root   /usr/local/bin/rotate.sh
```

The drop-in directories `/etc/cron.{hourly,daily,weekly,monthly}/` run any executable script placed in them — remember `chmod +x`.

**at** for a one-off:

```bash
at now +10 minutes        # then type the command, Ctrl-d to finish
at 22:00 tomorrow
atq                       # list pending jobs
atrm 3                    # remove job 3
systemctl enable --now atd
```

**systemd timers** are the modern equivalent, and a `.timer` unit pairs with a `.service` of the same name:

```bash
systemctl list-timers --all
systemctl enable --now mytask.timer
```

```ini
# /etc/systemd/system/mytask.timer
[Unit]
Description=Run mytask daily

[Timer]
OnCalendar=daily
Persistent=true          # run it on boot if the machine was off at the scheduled time

[Install]
WantedBy=timers.target
```

## Time

```bash
timedatectl                          # time, zone, NTP status
timedatectl set-timezone Asia/Manila
timedatectl list-timezones | grep -i manila
timedatectl set-ntp true             # enable network time
chronyc sources -v                   # which servers, and are we synced
```

The chrony config is `/etc/chrony.conf`; add a `server <host> iburst` line and `systemctl restart chronyd` when a task names a specific time source.

## Logs

Two systems coexist. **journald** is systemd's structured binary log; **rsyslog** writes the traditional text files under `/var/log/` (`messages`, `secure`, `boot.log`).

```bash
journalctl -u httpd                       # one unit
journalctl -u httpd --since "10 min ago"
journalctl -p err -b                      # this boot, errors and worse
journalctl -f                             # follow, like tail -f
journalctl -b -1                          # the previous boot
journalctl _PID=1234                      # structured field match
```

Priorities run `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug` — `-p err` means "err and more severe."

> ⚠️ **By default the journal is in memory and disappears at reboot.** That's why `journalctl -b -1` can come back empty. Make it persistent:

```bash
mkdir -p /var/log/journal
systemctl restart systemd-journald
```

Or set `Storage=persistent` in `/etc/systemd/journald.conf` — same result, and it states the intent explicitly. Cap the size with `SystemMaxUse=` in that file, or reclaim now with `journalctl --vacuum-size=200M`.

## Check yourself

1. A command a task needs isn't installed and you don't know its package. What do you run?
2. Write the cron line for "every day at 03:30" — and say what changes if you put it in `/etc/cron.d/` instead of a user crontab.
3. `journalctl -b -1` prints nothing. What's the likely reason, and what makes it work next time?

## Key takeaways

- `dnf provides '*/<command>'` finds the package for a missing command; `dnf history undo <id>` reverses a transaction.
- A repo is a file in `/etc/yum.repos.d/` with `[id]`, `name`, `baseurl`, `enabled`, `gpgcheck` — verify with `dnf repolist`.
- cron fields are **min hour dom mon dow**; files under `/etc/cron.d/` and `/etc/crontab` add a **user** field. `at` handles one-offs; systemd `.timer` units are the modern path.
- `timedatectl set-timezone` / `set-ntp true`, and `chronyc sources` to prove synchronisation.
- `journalctl -u`, `-p`, `-b`, `--since`, `-f` cover nearly every log question — and the journal is **not persistent by default**.
