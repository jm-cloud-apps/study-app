# Containers with Podman: Rootless, Persistent, and Managed by systemd

> **The one-sentence version:** Podman runs containers without a daemon — so a container can be owned by an ordinary user — and the exam-shaped task is always the same shape: run it as a **non-root user**, give it **persistent storage with the right SELinux label**, and have **systemd start it at boot**.

If you've used Docker, the commands will feel familiar. The interesting parts are the three RHEL-specific twists.

## Why it matters

Containers are on the modern RHCSA objective list, and the task is rarely "run a container" — it's "run it as user `ana`, with data in `/home/ana/data`, and make it start automatically after a reboot." Each of those three clauses has a specific answer, and the reboot clause is where most attempts fall over.

> 💡 This lesson is about *running* containers on RHEL. For what an image actually is — layers, the build cache, registries, and writing a good Dockerfile — the **Containers & Docker** topic covers the concepts, and they transfer to Podman directly since both follow the OCI spec.

## The basics

```bash
podman search ubi9                       # search configured registries
podman pull registry.access.redhat.com/ubi9/ubi:latest
podman images                            # local images
podman run -d --name web -p 8080:80 <image>
podman ps            ; podman ps -a      # running; all
podman logs web      ; podman logs -f web
podman exec -it web /bin/bash            # a shell inside
podman stop web      ; podman rm web
podman rmi <image>
podman inspect web | less
```

Registries are configured in `/etc/containers/registries.conf`. For registries that need credentials — `registry.redhat.io`, for instance — `podman login <registry>` stores them per-user.

> 💡 There's no daemon. A container is an ordinary child process of your shell session's user, which is why `podman ps` as root and as `ana` show *different* containers. If a container "disappeared," check which user you're logged in as.

## Rootless containers

Running as a normal user is the default and the point: a container breakout lands on an unprivileged account rather than on root.

```bash
su - ana                       # or log in as the user; see the warning below
podman run -d --name web -p 8080:80 <image>
```

Two consequences to remember:

- **Rootless containers can't bind ports below 1024.** Map to a high port (`-p 8080:80`) — the container can still listen on 80 *inside*.
- **Images and containers are stored per-user**, under `~/.local/share/containers/storage`, not in a system-wide location.

> ⚠️ Use `su - ana` (with the dash) or `ssh ana@localhost` rather than plain `su ana`. A rootless container needs a full login session with the right environment — `XDG_RUNTIME_DIR` in particular. Half the "it works for root but not for the user" confusion comes from an incomplete login shell.

## Persistent storage, and the `:Z` that everyone forgets

A container's own filesystem is disposable. Mount a host directory for anything that must survive:

```bash
mkdir -p /home/ana/data
podman run -d --name db \
  -v /home/ana/data:/var/lib/data:Z \
  -e MYSQL_ROOT_PASSWORD=secret \
  <image>
```

🔑 **`:Z` tells Podman to relabel the host directory with a private SELinux container label.** Without it, SELinux denies the container access to the directory and the container fails to start or start writing — a permission error that looks nothing like an SELinux problem until you check `ausearch`. Lowercase `:z` is the shared variant, for a directory two containers must both use.

For rootless containers there's a second, subtler ownership issue: the user IDs inside the container are mapped to a range of subordinate UIDs on the host, so the directory may need `podman unshare chown <uid>:<gid> /home/ana/data` to be writable from inside. Reach for that when the label is right and it's still permission-denied.

## Starting a container at boot

A container started by hand doesn't come back after a reboot. Hand it to systemd.

```bash
podman run -d --name web -p 8080:80 <image>       # get it working first

mkdir -p ~/.config/systemd/user
cd ~/.config/systemd/user
podman generate systemd --new --files --name web  # writes container-web.service

systemctl --user daemon-reload
systemctl --user enable --now container-web.service
systemctl --user status container-web.service
```

Then the step that makes it survive logout and reboot:

```bash
loginctl enable-linger ana        # as root; lets ana's user services run without a login
loginctl show-user ana | grep Linger
```

> ⚠️ **Without `enable-linger`, a user's systemd services stop when they log out and don't start at boot.** This is the single most missed step in container tasks. `--user` units also need `systemctl --user`, run as that user — `systemctl enable --user` as root is not the same thing.

> 💡 `podman generate systemd` is what most RHEL 9 systems have, and `--new` is important: it makes the unit *create* the container each start rather than depending on one that already exists. Newer Podman deprecates this in favour of **Quadlet** — a `.container` file in `~/.config/containers/systemd/` that systemd turns into a unit at `daemon-reload`. Check `podman --version` and what the machine's docs describe before choosing; both approaches end at `systemctl --user enable --now`.

## Check yourself

1. Why can't a rootless container bind port 80 on the host, and what do you do instead?
2. You mount `/home/ana/data` into a container and it can't write there, though the directory is owned by ana. What's the most likely cause and the flag that fixes it?
3. A container-backed service works, but after a reboot it isn't running — and `systemctl --user status` as ana shows nothing. What's missing?

## Key takeaways

- Podman is **daemonless and per-user**: containers belong to the user who ran them, so check *who you are* before believing `podman ps`.
- Rootless containers **can't bind ports below 1024** — map a high host port.
- Log in properly (`su -`, `ssh`) so the session environment is complete.
- Mount host directories with **`:Z`** (private) or `:z` (shared) so SELinux permits access; use `podman unshare chown` for rootless ownership mismatches.
- Persist with **`podman generate systemd --new --files --name <c>`** into `~/.config/systemd/user`, then `systemctl --user enable --now` — and **`loginctl enable-linger <user>`**, or none of it starts at boot.
