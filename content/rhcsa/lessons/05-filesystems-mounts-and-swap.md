# Mounting for Keeps: fstab, UUIDs, Swap, and NFS

> **The one-sentence version:** `mount` lasts until the next reboot; `/etc/fstab` is what makes a filesystem *actually* mounted — and referring to devices by **UUID** is what stops a renamed disk from breaking the boot.

This is the lesson that turns storage work into points, because the exam is graded after a reboot.

## Why it matters

The most common self-inflicted exam wound is a filesystem that was mounted by hand and never written to `fstab` — or written to `fstab` with a typo, which is worse: a bad entry can drop the system into emergency mode at boot. Both are entirely avoidable with two verification commands.

## Why UUIDs, not device names

Device names are assigned in discovery order. Add a disk, move a VM, change a controller, and yesterday's `/dev/sdb1` can be today's `/dev/sdc1` — while your `fstab` still points at the old name. A **UUID** is written into the filesystem itself and travels with it.

```bash
lsblk -f                     # the friendly view: FSTYPE, LABEL, UUID, MOUNTPOINT
blkid /dev/vdb1              # just this device
blkid -s UUID -o value /dev/vdb1     # bare UUID, easy to copy
```

> 💡 LVM logical volumes are a fair exception — `/dev/vg_data/lv_app` is a stable name managed by LVM, so it's safe in `fstab`. For plain partitions, use `UUID=`.

## The six fields of /etc/fstab

```
UUID=8a7b...c3   /data    xfs    defaults        0 0
/dev/vg_data/lv_app  /srv/app  xfs  defaults      0 0
UUID=1f2e...9d   none     swap   defaults        0 0
server:/export   /mnt/nfs nfs    defaults,_netdev 0 0
```

| # | Field | Notes |
|---|---|---|
| 1 | **What** | `UUID=`, `LABEL=`, or a device path |
| 2 | **Where** | The mount point — it must already exist |
| 3 | **Type** | `xfs`, `ext4`, `swap`, `nfs`… |
| 4 | **Options** | `defaults`, plus extras below |
| 5 | **dump** | Almost always `0` |
| 6 | **fsck order** | `0` for none, `1` for root, `2` for others (XFS uses `0`) |

Options worth knowing: `noauto` (don't mount at boot), `ro`, `noexec`, `nofail` (boot even if this device is missing), `_netdev` (wait for the network — required for NFS), `acl`, and `pri=` for swap priority.

## The two commands that save you

```bash
systemctl daemon-reload      # systemd generates mount units from fstab — re-read it
mount -a                     # mount everything in fstab that isn't mounted
findmnt --verify             # sanity-check fstab BEFORE you trust it
```

> ⚠️ Run `mount -a` after **every** `fstab` edit, while you still have a working shell. If it errors, you've just caught a boot failure at zero cost. If you skip it, you find out during grading — or during an unbootable reboot at 3 a.m.

If a bad entry does strand a system in emergency mode, the recovery is: log in as root at the emergency prompt, `mount -o remount,rw /`, fix `/etc/fstab`, then reboot. Adding `nofail` to non-critical mounts prevents the whole class of problem.

## Swap

Swap is just another filesystem type in the same table.

```bash
lvcreate -n lv_swap -L 1G vg_data
mkswap /dev/vg_data/lv_swap       # format as swap; prints the new UUID
swapon /dev/vg_data/lv_swap       # enable now
swapon --show                     # verify: name, type, size, priority
free -h                           # a second opinion
```

Then make it permanent:

```
/dev/vg_data/lv_swap   none   swap   defaults   0 0
```

`swapoff /dev/…` disables it again. Higher `pri=` values are used first — the way to prefer a fast device over a slow one when a system has several swap areas.

## Mounting NFS

```bash
dnf install -y nfs-utils
showmount -e server.example.com          # what does the server export?
mount -t nfs server:/export /mnt/nfs     # test it by hand first
```

Then the persistent entry — note `_netdev`, which tells systemd to wait for the network:

```
server:/export   /mnt/nfs   nfs   defaults,_netdev   0 0
```

## autofs: mount on demand

`autofs` mounts a path the moment something touches it, and unmounts it when idle. It's the standard answer for home directories on a file server, and it avoids boot-time hangs when a server is unreachable.

```bash
dnf install -y autofs
```

An **indirect** map has two parts — a master entry naming the parent directory, and a map file for what lives under it:

```bash
# /etc/auto.master.d/data.autofs
/shares   /etc/auto.data
```

```bash
# /etc/auto.data
docs   -rw,sync   server:/export/docs
*      -rw,sync   server:/export/&      # wildcard: /shares/<name> -> /export/<name>
```

```bash
systemctl enable --now autofs
ls /shares/docs        # touching the path triggers the mount
```

The `&` in the map is replaced by whatever matched the `*` — that's how one line serves every user's home directory.

> 💡 Don't also put an autofs-managed path in `/etc/fstab`. Pick one mechanism per mount point; the two fighting over the same directory produces confusing failures.

## Check yourself

1. Why does referring to a partition by UUID in `fstab` survive a disk being renamed, when `/dev/sdb1` doesn't?
2. You've added a line to `/etc/fstab`. Which two commands do you run immediately, and what does each protect you from?
3. What does `_netdev` do, and which kind of mount always needs it?

## Key takeaways

- `mount` is temporary; **`/etc/fstab` is the graded answer**. Every mount task has an fstab half.
- Use **`UUID=`** for partitions (`lsblk -f`, `blkid`); LVM paths are stable enough to use directly.
- After every edit: **`systemctl daemon-reload`**, then **`mount -a`** — and `findmnt --verify` for a second opinion.
- Swap is `mkswap` → `swapon` → an fstab line with type `swap`; verify with `swapon --show`.
- NFS entries need **`_netdev`**; `nofail` keeps a missing optional device from breaking the boot.
- **autofs** mounts on access via a master entry plus a map file, with `*`/`&` for wildcard maps — and shouldn't share a mount point with fstab.
