# Essential Tools: Finding Things, Moving Things, and File Permissions

> **The one-sentence version:** Before any of the "real" exam topics, you need to move around a system fluently — redirect output, find files by attribute, archive them, and read and set permissions including ACLs — because every other task assumes it.

These are the motions you'll perform dozens of times without thinking about them. Getting them to that level is the point.

## Why it matters

Almost every task has a small tools component hiding in it: *"…and save the output to `/root/report.txt`"*, *"…owned by group `devs` and not readable by others"*, *"…find every file larger than 50 MB and archive it."* None of that is conceptually hard. Under time pressure, though, hesitating over `find`'s syntax three times costs a task.

## Redirection, in one table

```bash
command > file          # stdout, overwriting
command >> file         # stdout, appending
command 2> file         # stderr only
command &> file         # stdout AND stderr
command 2>&1 | less     # merge stderr into stdout, then pipe
command < input.txt     # feed a file in as stdin
command | tee file      # see it AND save it
```

> 💡 `&>` is the quick one to remember; `2>&1` is the one you need when a pipe is involved, because the redirect must come *before* the pipe reads.

## Finding files

`grep` searches *inside* files; `find` searches *for* them by attribute.

```bash
grep -r 'ServerName' /etc/httpd/          # recursive
grep -i -n 'error' /var/log/messages      # case-insensitive, with line numbers
grep -E '^(deny|allow) ' /etc/some.conf   # extended regex
grep -v '^#' /etc/chrony.conf | grep .    # drop comments and blank lines

find /etc -name '*.conf'                  # by name (quote the glob!)
find /home -user ana                      # by owner
find / -size +50M                         # bigger than 50 MB
find /var -mmin -30                       # modified in the last 30 minutes
find / -perm -4000 2>/dev/null            # setuid files
find /tmp -type f -name '*.log' -exec rm -f {} \;   # act on each result
```

> ⚠️ Always quote the pattern in `find -name '*.conf'`. Unquoted, the shell expands the glob against the *current directory* first, and you'll get baffling results.

Two more that save time: `man -k <topic>` (a.k.a. `apropos`) searches man page descriptions when you can't remember a command's name, and `dnf provides '*/<command>'` tells you which package would supply a missing one.

## Archiving

```bash
tar czf /root/etc.tar.gz /etc          # create, gzip
tar cjf /root/etc.tar.bz2 /etc         # create, bzip2
tar cJf /root/etc.tar.xz /etc          # create, xz
tar tzf /root/etc.tar.gz               # list contents (check before extracting!)
tar xzf /root/etc.tar.gz -C /tmp/restore   # extract into a specific directory
```

The letters are worth internalising: **c**reate, e**x**tract, **t**able-of-contents; **f** always precedes the filename; **z**/**j**/**J** pick gzip/bzip2/xz.

## Permissions: the part that gets graded

Every file has an owner, a group, and three permission triads.

```
-rw-r-----.  1 ana devs  1024 Aug 29 10:00 report.txt
 │└┬┘└┬┘└┬┘     │   │
 │ │  │  └── other: none
 │ │  └───── group (devs): read
 │ └──────── owner (ana): read+write
 └────────── type: - file, d directory, l symlink
```

```bash
chmod 640 report.txt          # numeric: r=4 w=2 x=1
chmod u+x,g-w script.sh       # symbolic
chown ana:devs report.txt     # owner and group
chgrp devs report.txt         # group only
chmod -R g+rX /srv/data       # capital X = execute on directories only
```

> 🔑 On a **directory**, the bits mean something different: `r` lists names, `w` creates/deletes entries, and `x` lets you *enter* it and access files inside. A directory with `r` but no `x` is nearly useless — you can see names and nothing else. That asymmetry explains most "but I gave it read!" confusion.

### The three special bits

| Bit | On a file | On a directory | Set with |
|---|---|---|---|
| **setuid** (4) | Runs as the file's owner | (no effect) | `chmod u+s` / `4755` |
| **setgid** (2) | Runs as the file's group | **New files inherit the directory's group** | `chmod g+s` / `2775` |
| **sticky** (1) | (no effect) | Only the owner may delete their own files | `chmod +t` / `1777` |

Setgid on a directory is the classic shared-collaboration answer: give the directory to a group, `chmod 2770`, and everything created inside belongs to that group automatically. Sticky is why `/tmp` is `1777` — everyone can write, nobody can delete someone else's file.

### umask

New files are born with `666` minus the umask; new directories with `777` minus the umask. A umask of `022` therefore gives `644` files and `755` directories; `007` gives `660` and `770` — group-shared, private to everyone else.

```bash
umask               # show current
umask 007           # set for this shell
```

To make it persistent for a user, set it in their `~/.bashrc`; system-wide defaults live in `/etc/profile` and `/etc/bashrc`.

## ACLs: permissions beyond one owner and one group

When "ana can write, the devs group can read, and *auditors* can also read" doesn't fit into three triads, use an ACL.

```bash
getfacl /srv/data/report.txt
setfacl -m u:ana:rw /srv/data/report.txt      # a user ACL
setfacl -m g:auditors:r /srv/data/report.txt  # a group ACL
setfacl -m d:g:devs:rwx /srv/data             # DEFAULT acl: inherited by new files
setfacl -x u:ana /srv/data/report.txt         # remove one entry
setfacl -b /srv/data/report.txt               # remove all ACLs
```

A `+` at the end of the mode string in `ls -l` (`-rw-rw----+`) is your signal that a file has an ACL.

> ⚠️ The **mask** caps every named entry. If `getfacl` shows `mask::r--`, then `u:ana:rw` is *effective* as read-only — `getfacl` even prints `#effective:r--` next to it. When an ACL "isn't working," check the mask first.

## Check yourself

1. A directory is `r--` for a group. Why can members list the filenames but not read any file inside?
2. You need every file created in `/srv/project` to belong to the `devs` group automatically. Which single bit does that, and what's the numeric mode?
3. `getfacl` shows `user:ana:rwx` but ana can only read. What's the most likely explanation?

## Key takeaways

- `&>` redirects both streams; `2>&1` before a pipe is the version that works with pipelines.
- `grep` looks inside files, `find` looks for them — and always **quote** `find -name '*.conf'`.
- On directories, `x` means *enter*: read without execute is almost useless.
- **setgid on a directory** makes new files inherit its group — the shared-folder answer; **sticky** protects other people's files in a world-writable directory.
- New files start at `666 - umask`, new directories at `777 - umask`.
- ACLs extend permissions past one owner/one group; a `+` in `ls -l` reveals them, and the **mask** is what silently limits them.
