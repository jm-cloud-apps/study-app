# Processes, Jobs, and Finding What's Eating the Machine

> **The one-sentence version:** `ps` and `top` tell you what's running and what it costs, signals sent with `kill` tell a process to stop (politely, then not), and `nice`/`renice` decide who gets the CPU when everyone wants it at once.

The RHCSA objectives ask you to identify CPU- and memory-intensive processes, adjust scheduling priority, and kill processes. All three are five-minute skills once the vocabulary is straight.

## Why it matters

This is the "the server is slow, find out why" task — and the answer is never a guess. It's two commands, read correctly. The same skills also rescue you during the exam itself when something you started won't stop.

## Seeing what's running

```bash
ps aux                       # every process, BSD-style flags: a=all users, u=detail, x=no tty
ps -ef                       # the same picture, UNIX-style; both are fine
ps aux --sort=-%mem | head   # the memory hogs, biggest first
ps aux --sort=-%cpu | head   # the CPU hogs
ps -ef --forest              # the parent/child tree
pgrep -a httpd               # PIDs matching a name, with their command lines
```

Reading `ps aux` columns: **PID** (the number you'll act on), **%CPU** and **%MEM**, **VSZ**/**RSS** (virtual vs. actually-resident memory — RSS is the honest one), **STAT** (process state), and **COMMAND**.

The STAT letters worth knowing: **R** running or runnable, **S** sleeping (waiting on something — most processes, most of the time), **D** uninterruptible sleep (usually blocked on disk or network I/O — a machine full of D is an I/O problem, not a CPU one), **Z** zombie (finished, waiting for its parent to collect the exit status), **T** stopped.

## Watching it live

```bash
top                          # interactive
```

Inside `top`: **`M`** sorts by memory, **`P`** by CPU, **`k`** kills a PID, **`r`** renices one, **`1`** shows each CPU core separately, **`u`** filters to one user, **`q`** quits.

The load average on the top line is the number of processes runnable or waiting on I/O, averaged over 1, 5, and 15 minutes. 🔑 **Compare it to your core count**: a load of 4.0 on a 4-core machine is fully busy; the same figure on a 32-core machine is idle. The three numbers together tell you the direction — rising, steady, or recovering.

```bash
nproc                        # how many cores, so the load average means something
uptime                       # load averages without the rest of top
free -h                      # memory: look at "available", not "free"
df -h ; du -sh /var/* | sort -h    # a full disk looks a lot like a slow machine
```

> 💡 In `free -h`, the **available** column is the number that matters. Linux deliberately uses spare RAM for cache, so a small "free" figure is healthy, not alarming.

## Signals and killing

A signal is a small message to a process. `kill` sends one; it doesn't necessarily kill anything.

| Signal | Number | Meaning |
|---|---|---|
| `SIGTERM` | 15 | "Please shut down." The **default**, and the polite one — the process can clean up. |
| `SIGKILL` | 9 | "Stop now." Cannot be caught or ignored; no cleanup, possible data loss. |
| `SIGHUP` | 1 | Traditionally "reload your configuration." |
| `SIGSTOP` / `SIGCONT` | 19 / 18 | Pause and resume. |

```bash
kill 1234                    # SIGTERM, the default
kill -9 1234                 # SIGKILL — last resort
kill -HUP 1234               # by name instead of number
pkill -u ana firefox         # by process name, optionally scoped to a user
killall httpd                # every process with that exact name
kill -l                      # list every signal name
```

> ⚠️ **Reach for `-9` last, not first.** SIGTERM lets a database flush its buffers and a service remove its lock file; SIGKILL doesn't. Try the default, wait a couple of seconds, and only then escalate. A process that ignores SIGTERM *and* sits in state `D` is usually stuck in the kernel on I/O — `-9` won't move that one either.

For anything managed by systemd, prefer `systemctl stop <unit>` — it stops the whole unit's cgroup rather than one process that will be restarted a second later.

## Priority: nice and renice

Every process has a **niceness** from **-20 (greediest)** to **19 (most generous)**. Higher niceness = lower priority = "I'm happy to wait." The default is 0.

```bash
nice -n 10 ./backup.sh            # START a command with lower priority
renice -n 5 -p 1234               # change a RUNNING process
renice -n -5 -p 1234              # raise priority — requires root
renice -n 10 -u ana               # everything owned by a user
ps -eo pid,ni,comm --sort=-ni | head   # who's nice, and who isn't
```

🔑 **Only root can make a process greedier.** An ordinary user may raise their own niceness (be more generous) but never lower it — otherwise everyone would set -20 and the setting would mean nothing.

## Background jobs in your own shell

```bash
./long-task.sh &            # start in the background
jobs                        # list this shell's jobs
fg %1                       # bring job 1 to the foreground
bg %1                       # resume a stopped job in the background
Ctrl-z                      # suspend the foreground job
Ctrl-c                      # send SIGINT to it
```

> ⚠️ Background jobs die when their shell exits. For something that must outlive your session, use `nohup ./task.sh &`, or better, hand it to systemd: `systemd-run --unit=mytask /usr/local/bin/task.sh` creates a transient unit that survives logout and shows up in `systemctl status`.

## The habit

When a machine is "slow," ask in this order: **load average vs. core count** (`uptime`, `nproc`), **who's using CPU** (`ps aux --sort=-%cpu`), **who's using memory** (`ps aux --sort=-%mem`, `free -h`), **is the disk full** (`df -h`), and **is anything stuck in D state** (`ps aux | awk '$8 ~ /D/'`). Four commands, and you'll have a real answer rather than a theory.

## Check yourself

1. A load average of 6.0 — is that bad? What do you need to know before answering?
2. Why is `kill -9` the wrong first choice, and what should you send instead?
3. An ordinary user tries `renice -n -5 -p 1234` on their own process and it's refused. Why?

## Key takeaways

- `ps aux --sort=-%cpu` / `--sort=-%mem` find the hogs; `top` watches live (`M`, `P`, `k`, `r`, `1`).
- **Load average only means something next to `nproc`**; in `free -h`, read **available**, not free.
- STAT letters: R runnable, S sleeping, **D uninterruptible I/O**, Z zombie, T stopped.
- `kill` sends **SIGTERM (15)** by default — polite and preferred; **SIGKILL (9)** is the last resort with no cleanup. `pkill`/`killall` work by name.
- Niceness runs **-20 (greedy) to 19 (generous)**; only root may lower a value.
- Shell background jobs (`&`, `jobs`, `fg`, `bg`) die with the shell — use `systemd-run` or `nohup` for anything that must outlive it.
