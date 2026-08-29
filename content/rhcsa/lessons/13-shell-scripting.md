# Simple Shell Scripts: Conditionals, Loops, and Arguments

> **The one-sentence version:** A shell script is the commands you already type, in a file, with four extra ideas — **exit codes**, **conditionals**, **loops**, and **positional parameters** — and the RHCSA asks you to write one, not to be a programmer.

## Why it matters

"Create a simple shell script" is its own exam objective: run a command conditionally, loop over some input, and use the script's arguments. Nothing here is advanced, and the whole vocabulary fits on one page — but you have to be able to produce it under time pressure, without a reference.

## The skeleton

```bash
#!/usr/bin/bash
# /usr/local/bin/report.sh — describe what it does

echo "Hello from $(hostname)"
```

```bash
chmod +x /usr/local/bin/report.sh      # the step people forget
/usr/local/bin/report.sh
```

The first line (`#!`, the **shebang**) tells the kernel which interpreter to run. Without the execute bit, the file is just text — `bash report.sh` would still work, but a task saying "create a script" means an executable one.

> 💡 `/usr/bin/bash` and `/bin/bash` both work on RHEL (`/bin` is a symlink to `/usr/bin`). Either shebang is fine.

## Variables and command substitution

```bash
name="ana"
count=5
today=$(date +%F)                 # COMMAND SUBSTITUTION: capture output
files=$(ls /etc | wc -l)

echo "Hello $name, there are $files files in /etc on $today"
echo "Path: ${name}_backup"       # braces when the name touches other text
```

> ⚠️ **No spaces around `=`.** `name = "ana"` is not an assignment — bash reads it as a command called `name`. This is the single most common beginner error, and the error message doesn't explain itself.

Quoting: `"$var"` expands the variable, `'$var'` is literal, and quoting is how you survive values containing spaces. When in doubt, use double quotes.

## Positional parameters

```bash
#!/usr/bin/bash
# usage: backup.sh <source> <destination>

echo "Script name : $0"
echo "First arg   : $1"
echo "Second arg  : $2"
echo "How many    : $#"
echo "All of them : $@"
```

A guard clause at the top is good practice and cheap to write:

```bash
if [ $# -lt 2 ]; then
    echo "Usage: $0 <source> <destination>" >&2
    exit 1
fi
```

## Exit codes

Every command returns a status: **0 means success**, anything else is a failure. `$?` holds the last one.

```bash
grep -q 'root' /etc/passwd
echo $?                    # 0 — found it

systemctl is-active httpd > /dev/null
echo $?                    # non-zero if it isn't running

exit 0                     # end your own script with a deliberate status
```

🔑 **Zero is success.** It's backwards from what you'd guess, and it's the logic every conditional in the shell is built on — `if` doesn't test true/false, it tests "did that command exit 0?"

## Conditionals

```bash
if [ "$1" = "start" ]; then
    echo "starting"
elif [ "$1" = "stop" ]; then
    echo "stopping"
else
    echo "Usage: $0 {start|stop}" >&2
    exit 1
fi
```

The test operators worth memorising:

| Test | True when |
|---|---|
| `[ "$a" = "$b" ]` | Strings are equal (`!=` for not) |
| `[ -z "$a" ]` / `[ -n "$a" ]` | String is empty / not empty |
| `[ "$a" -eq "$b" ]` | Numbers equal — also `-ne -lt -le -gt -ge` |
| `[ -f /path ]` | Exists and is a regular file |
| `[ -d /path ]` | Exists and is a directory |
| `[ -e /path ]` | Exists at all |
| `[ -r /path ]` / `-w` / `-x` | Readable / writable / executable |

> ⚠️ **Spaces inside the brackets are mandatory**: `[ -f /etc/hosts ]`, never `[-f /etc/hosts]`. And **quote your variables** — if `$1` is empty, `[ $1 = "start" ]` collapses into a syntax error, while `[ "$1" = "start" ]` behaves.

Testing a command directly, without brackets, is often cleaner:

```bash
if systemctl is-active --quiet httpd; then
    echo "httpd is running"
fi

if ! ping -c1 -W1 server.example.com &> /dev/null; then
    echo "server unreachable" >&2
    exit 1
fi
```

## Loops

```bash
for host in web1 web2 db1; do            # over a list
    echo "Checking $host"
done

for file in /etc/*.conf; do              # over a glob
    echo "Found: $file"
done

for user in $(cat users.txt); do         # over a command's output
    id "$user" &> /dev/null || useradd "$user"
done

for i in {1..5}; do                      # over a range
    echo "Attempt $i"
done

while read -r line; do                   # a line at a time — the safe way
    echo "Line: $line"
done < /etc/hosts
```

`||` runs the next command only if the previous one **failed**; `&&` only if it **succeeded**. `id "$user" &> /dev/null || useradd "$user"` reads as "if the user doesn't exist, create them" — a one-line conditional, and idiomatic shell.

## Putting it together

```bash
#!/usr/bin/bash
# /usr/local/bin/check-services.sh — report on services named as arguments

if [ $# -eq 0 ]; then
    echo "Usage: $0 <service> [service...]" >&2
    exit 1
fi

failed=0

for svc in "$@"; do
    if systemctl is-active --quiet "$svc"; then
        echo "OK      $svc"
    else
        echo "FAILED  $svc" >&2
        failed=$((failed + 1))
    fi
done

echo "$failed service(s) not running"
exit $failed
```

```bash
chmod +x /usr/local/bin/check-services.sh
/usr/local/bin/check-services.sh sshd httpd chronyd
echo $?
```

That script uses every idea in the lesson: shebang, arguments, `$#`, a guard clause, a loop over `"$@"`, a conditional on a command's exit status, arithmetic, stderr redirection, and a meaningful exit code.

> 💡 `bash -n script.sh` checks syntax without running it, and `bash -x script.sh` traces each line as it executes with variables expanded — the fastest way to see why a script did something unexpected.

## Check yourself

1. Why does `name = "ana"` fail, and what does bash think you asked for?
2. What does an exit code of 0 mean, and how does `if` use it?
3. Write the one-liner that creates a user only if they don't already exist.

## Key takeaways

- Shebang (`#!/usr/bin/bash`) plus **`chmod +x`** — a script without the execute bit isn't a script.
- **No spaces around `=`** in assignments; `$( )` captures command output; quote your variables.
- `$0 $1 $2`, **`$#`** (count) and **`$@`** (all) are the arguments; a usage guard costs three lines.
- **Exit code 0 = success**, and `if` tests exactly that — so `if systemctl is-active --quiet httpd` needs no brackets.
- Inside `[ ]`, **spaces are mandatory**: `-f -d -e` for files, `-z -n` for strings, `-eq -lt -gt` for numbers, `=` for strings.
- `for … in list/glob/$(command)/{1..5}` and `while read -r line; do … done < file`; `||` and `&&` chain on failure and success.
- Debug with **`bash -n`** (syntax) and **`bash -x`** (trace).
