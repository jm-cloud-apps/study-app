# SSH Keys, File Transfers, and Links

> **The one-sentence version:** Key-based SSH replaces passwords with a key pair whose **private half never leaves your machine**, `scp` and `rsync` move files over that same channel, and links let one file exist at two paths — as a second name (hard) or a signpost (symbolic).

## Why it matters

Key-based authentication is an explicit exam objective and the foundation of every automation topic that follows — Ansible's entire connection model is "SSH with a key." Links show up in file-management tasks and in explaining why a file didn't disappear when you deleted it.

## Key-based SSH in four commands

```bash
ssh-keygen -t ed25519 -C "ana@laptop"     # generate a key pair (accept the default path)
ssh-copy-id ana@server.example.com        # install the PUBLIC half on the server
ssh ana@server.example.com                # no password prompt
ssh ana@server.example.com 'hostname'     # run one command and come back
```

`ssh-keygen` writes two files: `~/.ssh/id_ed25519` (**private** — never copy this anywhere) and `~/.ssh/id_ed25519.pub` (**public** — safe to hand out). `ssh-copy-id` appends the public half to `~/.ssh/authorized_keys` on the remote account, with the right permissions.

A **passphrase** on the private key is a good idea; `ssh-agent` then holds the decrypted key for your session so you type it once:

```bash
eval $(ssh-agent)
ssh-add ~/.ssh/id_ed25519
```

> ⚠️ **SSH refuses to use files with loose permissions**, and the resulting error message rarely says so plainly. The rules: `~/.ssh` must be `700`, `authorized_keys` and private keys `600`. If key auth "just doesn't work," check these first:
> ```bash
> chmod 700 ~/.ssh
> chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_ed25519
> restorecon -Rv ~/.ssh          # and the SELinux labels, if the home dir was moved
> ```

### Doing it by hand

Worth knowing for when `ssh-copy-id` isn't available:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat received_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Server-side settings

`/etc/ssh/sshd_config` controls the daemon; the settings that come up are `PermitRootLogin`, `PasswordAuthentication`, and `Port`. After editing:

```bash
sshd -t                       # SYNTAX CHECK — do this before restarting
systemctl restart sshd
```

A non-standard port needs both `firewall-cmd --permanent --add-port=<n>/tcp` and an SELinux port label (`semanage port -a -t ssh_port_t -p tcp <n>`) — the same three-part pattern as any other service.

## Copying files

```bash
scp file.txt ana@server:/tmp/                  # local -> remote
scp ana@server:/var/log/messages ./            # remote -> local
scp -r mydir/ ana@server:/tmp/                 # recursive
```

`rsync` is the better tool for anything repeated: it transfers only differences, preserves attributes, and can resume.

```bash
rsync -av /src/ ana@server:/dest/       # archive (permissions, times, symlinks) + verbose
rsync -av --delete /src/ /backup/       # make the destination MATCH, removing extras
rsync -avz /src/ ana@server:/dest/      # compress in transit
rsync -av --dry-run /src/ /dest/        # show what WOULD happen
```

> 🔑 **The trailing slash on the source changes everything.** `rsync -av /src/ /dest/` copies the *contents* of `src` into `dest`. Without it, `rsync -av /src /dest/` copies the *directory itself*, producing `/dest/src/`. This trips up everyone at least once — and `--dry-run` shows you which one you asked for before it happens.

## Hard links and symbolic links

```bash
ln  original.txt hardlink.txt      # hard link: a second NAME for the same data
ln -s original.txt softlink.txt    # symbolic link: a pointer to a PATH
ls -li                             # -i shows inode numbers
```

🔑 **A hard link is a second name for the same inode.** Both names are equal — there's no "original." The data survives until the last name is removed, which is why deleting a file that has two hard links frees nothing. A **symbolic link** is a tiny file containing a path; it can point anywhere, including at something that doesn't exist.

| | Hard link | Symbolic link |
|---|---|---|
| Points to | The **inode** (the data itself) | A **path** (text) |
| Across filesystems | ❌ No | ✅ Yes |
| To a directory | ❌ No (root aside) | ✅ Yes |
| If the target is deleted | Data survives — this name still works | Breaks (a "dangling" link) |
| Shown by `ls -l` | Looks like an ordinary file | `link -> target` |

```bash
ls -li original.txt hardlink.txt      # SAME inode number, link count 2
ls -l softlink.txt                    # softlink.txt -> original.txt
```

> 💡 Symbolic links are the ones you'll use day to day: they cross filesystems, can point at directories, and their target is visible in `ls -l`. Prefer them unless a task explicitly says "hard link."

## Check yourself

1. Key-based login fails with no useful message, though the key is definitely in `authorized_keys`. What do you check first?
2. What's the difference between `rsync -av /src/ /dest/` and `rsync -av /src /dest/`?
3. You delete the file a hard link points to. Is the data gone? What if it were a symbolic link?

## Key takeaways

- `ssh-keygen` then `ssh-copy-id`: the **private key never leaves your machine**, the public half goes in the remote `~/.ssh/authorized_keys`.
- **Permissions break key auth silently**: `~/.ssh` = 700, keys and `authorized_keys` = 600.
- `sshd -t` validates the config **before** you restart; a non-standard port needs a firewall rule *and* an SELinux port label.
- `scp` for one-off copies, **`rsync -av`** for anything repeated (`--delete` to mirror, `--dry-run` to preview) — and mind the **trailing slash**.
- **Hard link = another name for the same inode** (same filesystem, files only, data survives deletion of either name); **symlink = a path pointer** (crosses filesystems, works on directories, breaks if the target goes).
