# Exam-Day Review: An Objective Checklist

> **The one-sentence version:** This lesson is a self-audit, not new material — walk the objective map, and for each line either say the command out loud or go back to the lesson that covers it.

Use it two ways: as a **gap finder** a couple of weeks out (which rows make you hesitate?), and as a **final sweep** the day before, when you want confidence rather than new information.

> ⚠️ Red Hat publishes the authoritative objective list for **your** exam version on the EX200 page, and it changes between RHEL releases. Treat this map as a study aid built from the objectives, and reconcile it against the official list before you sit the exam.

## The objective map

Cover the right column and answer from memory. Anything you can't answer in about ten seconds is your revision list.

### Tools, files, and permissions

| Can you… | Answer | Lesson |
|---|---|---|
| Redirect stdout and stderr to one file, including through a pipe | `&>` for a file; `2>&1` before a pipe | 2 |
| Find files by name, size, owner, permission | `find /etc -name '*.conf'` (**quote the glob**), `-size +50M`, `-user ana`, `-perm -4000` | 2 |
| Archive and compress | `tar czf`, `cjf`, `cJf`; `tzf` to list; `xzf -C <dir>` | 2 |
| Make a shared group directory | `chgrp devs dir; chmod 3770 dir` (setgid + sticky) | 2 |
| Explain why a group can list a directory but read nothing | `x` is *enter*; `r` alone only lists names | 2 |
| Grant one extra user access to one file | `setfacl -m u:ana:rw file`; check the **mask** if it seems ignored | 2 |
| Create hard and symbolic links, and say how they differ | `ln` (same inode, one filesystem) vs `ln -s` (a path, breaks if target goes) | 12 |

### Users, groups, and sudo

| Can you… | Answer | Lesson |
|---|---|---|
| Add a user to a group without removing their others | `usermod -aG devs raj` — verify with `id raj` | 3 |
| Create a service account that can't log in | `useradd -M -s /sbin/nologin svc` | 3 |
| Age a password vs. expire an account | `chage -M 60` vs `chage -E 2027-01-31` | 3 |
| Give passwordless sudo to one user | `visudo -f /etc/sudoers.d/ana` → `ana ALL=(ALL) NOPASSWD: ALL`; verify `sudo -lU ana` | 3 |

### Storage and filesystems

| Can you… | Answer | Lesson |
|---|---|---|
| Build a filesystem from a blank disk | `parted` → `pvcreate` → `vgcreate` → `lvcreate` → `mkfs.xfs` → fstab | 4 |
| Grow a filesystem when the VG is full | `pvcreate` + `vgextend`, then `lvextend -L +1G -r` | 4 |
| Say what `-r` does and why it matters | Resizes the filesystem too — without it `df` never changes | 4 |
| Add persistent swap | `mkswap` → `swapon` → fstab type `swap`; verify `swapon --show` | 5 |
| Mount by UUID persistently and prove it | `lsblk -f`, fstab, `systemctl daemon-reload && mount -a` | 5 |
| Mount NFS so a dead server can't block boot | `nfs … _netdev,nofail` | 5 |
| Configure autofs | master entry in `/etc/auto.master.d/` + map file; `*`/`&` for wildcards | 5 |
| Create a Stratis pool and mount it persistently | `stratis pool create` → `filesystem create`; fstab needs `x-systemd.requires=stratisd.service` | 14 |
| Create a compressed/deduplicated volume | `lvcreate --type vdo --size <phys> --virtualsize <logical>` | 14 |

### Boot, services, and processes

| Can you… | Answer | Lesson |
|---|---|---|
| Change what the system boots into | `systemctl set-default multi-user.target` (not `isolate`) | 6 |
| Reset a lost root password | `rd.break` → remount `/sysroot` rw → `chroot` → `passwd` → **`touch /.autorelabel`** | 6 |
| Add a kernel argument permanently | `grubby --update-kernel=ALL --args="…"` | 6 |
| Recover from a bad fstab in emergency mode | `mount -o remount,rw /`, fix the line | 6 |
| Set a tuned profile | `tuned-adm profile virtual-guest`; verify `tuned-adm active` | 6 |
| Find the CPU/memory hogs | `ps aux --sort=-%cpu`/`-%mem`; load average vs `nproc` | 11 |
| Stop a process politely, then not | `kill` (SIGTERM 15) → `kill -9` (SIGKILL) as a last resort | 11 |
| Change scheduling priority | `nice -n 10 cmd`, `renice -n 5 -p PID`; only root may lower it | 11 |

### Software, scheduling, logs, and time

| Can you… | Answer | Lesson |
|---|---|---|
| Find which package provides a missing command | `dnf provides '*/semanage'` | 7 |
| Add a repository | a file in `/etc/yum.repos.d/` with `[id] name baseurl enabled gpgcheck`; `dnf repolist` | 7 |
| Undo an installation | `dnf history` then `dnf history undo <id>` | 7 |
| Schedule a recurring job for another user | `crontab -e -u ana`; fields **min hour dom mon dow** | 7 |
| Make the journal survive a reboot | `mkdir -p /var/log/journal && systemctl restart systemd-journald` | 7 |
| Set timezone and NTP | `timedatectl set-timezone`, `set-ntp true`, `chronyc sources` | 7 |

### Networking, security, and containers

| Can you… | Answer | Lesson |
|---|---|---|
| Set a static IP that survives reboot | `nmcli con add/mod … ipv4.method manual` then **`nmcli con up`** | 8 |
| Open a port for good | `firewall-cmd --permanent --add-port=…` + `--reload` | 8 |
| Set up key-based SSH | `ssh-keygen` → `ssh-copy-id`; `~/.ssh` 700, `authorized_keys` 600 | 12 |
| Copy a directory tree efficiently | `rsync -av --delete /src/ host:/dst/` — mind the **trailing slash** | 12 |
| Relabel a non-standard web root | `semanage fcontext -a -t httpd_sys_content_t "/web(/.*)?"` + `restorecon -Rv /web` | 9 |
| Flip an SELinux boolean permanently | `setsebool -P httpd_enable_homedirs on` | 9 |
| Let a service use a non-standard port | `semanage port -a -t http_port_t -p tcp 8888` | 9 |
| Explain a denial | `ausearch -m AVC -ts recent \| audit2why` | 9 |
| Write a script with arguments, a loop, and an exit code | shebang, `chmod +x`, `$#`/`$@`, `for … in "$@"`, `exit N` | 13 |
| Run a rootless container that starts at boot | `podman generate systemd --new --files --name`, `systemctl --user enable --now`, **`loginctl enable-linger`** | 10 |
| Mount a host directory into a container | `-v /path:/path:Z` (the `:Z` is the SELinux relabel) | 10 |

## The persistence sweep

🔑 **Grading happens on a freshly booted system.** Reboot with time to spare, then run this sweep. Every line answers "is the thing I did still true?"

```bash
systemctl --failed                       # nothing broken by your changes
findmnt --verify ; mount -a              # fstab is sane and complete
df -h ; swapon --show                    # filesystems and swap are back
systemctl is-enabled <svc> ; systemctl is-active <svc>
firewall-cmd --list-all                  # rules survived
getenforce ; getsebool -a | grep <bool>  # SELinux mode and booleans
ip -br addr ; ip route | grep default    # addressing survived
id <user> ; sudo -lU <user>              # accounts and sudo rules
crontab -l -u <user> ; systemctl list-timers
loginctl show-user <user> | grep Linger  # container tasks
```

## The traps that cost the most marks

1. **`mount` without `/etc/fstab`** — and `mount -a` not run to prove the entry works.
2. **`systemctl start` without `enable`.** Use `enable --now`.
3. **`firewall-cmd` without `--permanent`** (or with it, but without `--reload`).
4. **`setsebool` without `-P`.**
5. **`chcon` instead of `semanage fcontext` + `restorecon`.**
6. **`usermod -G` instead of `-aG`** — silently strips every other group.
7. **`lvextend` without `-r`** — the volume grows, the filesystem doesn't.
8. **`nmcli con mod` without `nmcli con up`** — the config is right, the interface isn't.
9. **Forgetting `touch /.autorelabel`** after a root password reset — locks everyone out.
10. **Missing `loginctl enable-linger`** — the container works until the reboot that grades it.
11. **A script without `chmod +x`.**
12. **Work done at the wrong path or on the wrong host** — re-read the task's exact wording.

## A sane final week

- **Days 1–3:** work the practice tasks in this topic on a scratch VM, one category a day. Snapshot the VM clean so you can repeat the ones that hurt.
- **Day 4:** the destructive ones only — partitioning, LVM, filesystems, boot recovery. Break the machine on purpose and recover it.
- **Day 5:** a full mock run: pick a dozen tasks, do them in two hours, reboot, verify with the sweep above.
- **Day 6:** revisit only the rows in the objective map you hesitated on.
- **Day 7:** rest, and re-read the trap list. Nothing new the day before.

And a word about nerves: everyone forgets a flag. The exam gives you `man`, `--help`, and `/usr/share/doc/` precisely because it's testing whether you can *do the work*, not whether you memorised it. Looking something up is what a competent administrator does.

## Check yourself

1. Without looking, name the persistence partner for a mount, a service, a firewall rule, and an SELinux boolean.
2. Which single command proves that a fstab entry you just wrote won't break the next boot?
3. Which three rows of the objective map above did you hesitate on, and which lesson covers each?

## Key takeaways

- Use the objective map as a **self-audit**: hesitation on a row is your revision list, not a failure.
- Reconcile it against **Red Hat's official objective list** for your exam version.
- **Reboot early and run the persistence sweep** — it protects points you already earned.
- The twelve traps are almost the entire difference between a pass and a near-miss; most are one missing flag.
- The documentation on the machine is there to be used. Fluency, not memorisation, is what's being measured.
