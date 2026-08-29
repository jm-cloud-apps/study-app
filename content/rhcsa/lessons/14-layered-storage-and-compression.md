# Layered Storage: Stratis and VDO Compression

> **The one-sentence version:** **Stratis** manages pools and thin filesystems for you — no `pvcreate`/`mkfs` ceremony, and filesystems that grow on their own — while **VDO** puts deduplication and compression *underneath* a volume so it stores more than its physical size.

> ⚠️ **Check your exam version before spending time here.** These objectives ("configure disk compression", "manage layered storage") have appeared in some RHCSA versions and not others, and the tooling changed between RHEL 8 and 9 — standalone VDO gave way to **LVM-VDO**. Read Red Hat's published EX200 objective list for the release your exam targets, and confirm what's installed on the machine in front of you.

## Why it matters

Both answer the same question — "how do I get more usable storage with less fuss?" — from different directions. Stratis simplifies the management layer; VDO makes the bytes go further. They're also the two storage features whose command sets look nothing like the LVM you already know, so a few minutes of familiarity is worth a lot.

## Stratis

Stratis is a management layer on top of LVM and XFS. You give it disks; it gives you a **pool**, and filesystems inside it are **thinly provisioned** — they report a large size and consume only what's written, growing automatically as they fill.

```bash
dnf install -y stratisd stratis-cli
systemctl enable --now stratisd
```

```bash
stratis pool create mypool /dev/vdb           # a pool from one or more devices
stratis pool add-data mypool /dev/vdc         # grow the pool later
stratis filesystem create mypool myfs         # a filesystem inside it

stratis pool list
stratis filesystem list
stratis blockdev list
```

The filesystem appears at a predictable path:

```bash
mkdir -p /stratis-data
mount /dev/stratis/mypool/myfs /stratis-data
```

### Mounting it persistently — the detail that matters

```bash
lsblk -o UUID /dev/stratis/mypool/myfs        # or: blkid /dev/stratis/mypool/myfs
```

```
UUID=<the-uuid>  /stratis-data  xfs  defaults,x-systemd.requires=stratisd.service  0 0
```

> 🔑 **`x-systemd.requires=stratisd.service` is the whole trick.** The Stratis device only exists once `stratisd` is running, so without that option the boot tries to mount a device that isn't there yet — and you land in emergency mode. Use the **UUID**, not the `/dev/stratis/...` path, and add the requires option. Then `systemctl daemon-reload && mount -a` before you trust it, as with any fstab edit.

### Snapshots

```bash
stratis filesystem snapshot mypool myfs myfs-snap
stratis filesystem list                       # the snapshot is a filesystem in its own right
```

A Stratis snapshot is an independent filesystem you can mount, not a read-only image — handy before a risky change.

> 💡 Stratis filesystems **grow automatically** as they fill, which is the point of the thin provisioning. The corollary: the *pool* can be over-committed, so watch `stratis pool list` for real usage rather than trusting the filesystem's advertised size.

## VDO: deduplication and compression

VDO sits *below* a filesystem and stores it more efficiently: identical blocks are stored once (**deduplication**) and the rest are **compressed**. To everything above, it looks like an ordinary block device — a very large one, since VDO volumes are thin-provisioned and normally presented bigger than the physical space behind them.

On RHEL 9 this is integrated into LVM as **LVM-VDO** (the standalone `vdo` command from RHEL 8 is no longer the supported path):

```bash
dnf install -y lvm2 vdo                       # package set varies by release
```

```bash
# a 10 GiB physical pool presenting a 50 GiB logical volume
lvcreate --type vdo --name vdo_lv --size 10G --virtualsize 50G vg_data

mkfs.xfs /dev/vg_data/vdo_lv
mkdir -p /vdo-data
mount /dev/vg_data/vdo_lv /vdo-data
```

`--size` is the real space consumed from the volume group; `--virtualsize` is what the filesystem above believes it has. Deduplication and compression are on by default and can be toggled:

```bash
lvchange --compression y vg_data/vdo_lv
lvchange --deduplication y vg_data/vdo_lv
lvs -a vg_data                                # the VDO pool and volume, and their usage
```

> ⚠️ **Over-committing is the risk you're accepting.** A VDO volume advertises more space than it has, so if the data doesn't compress or deduplicate as well as expected, the physical pool fills while the filesystem still thinks it has room — which is an ugly failure. Monitor real usage (`lvs -a`, and `vdostats --human-readable` where the tooling provides it) rather than `df`.

VDO earns its keep on data with genuine repetition: VM images, container images, backups. It's a poor fit for data that's already compressed or encrypted — video, archives, encrypted volumes — where it costs CPU and returns nothing.

## Which is which

| | Stratis | VDO |
|---|---|---|
| Solves | Management complexity | Physical capacity |
| Layer | **Above** the block device (pools + filesystems) | **Below** the filesystem |
| Signature feature | Thin, auto-growing filesystems and snapshots | Deduplication + compression |
| The gotcha | fstab needs `x-systemd.requires=stratisd.service` | Over-commitment: the pool can fill unseen |

## Check yourself

1. Why does a Stratis filesystem need `x-systemd.requires=stratisd.service` in `/etc/fstab`, and what happens without it?
2. In `lvcreate --type vdo --size 10G --virtualsize 50G`, which number is real space and which is what the filesystem believes?
3. Name one data type where VDO pays off and one where it's wasted effort.

## Key takeaways

- **Check your exam version's objective list** — these features come and go, and the RHEL 8 → 9 tooling changed.
- **Stratis**: `stratis pool create` → `stratis filesystem create`, device at `/dev/stratis/<pool>/<fs>`, thin and auto-growing, with real snapshots.
- Mount Stratis by **UUID** with **`x-systemd.requires=stratisd.service`**, or the boot breaks.
- **VDO** deduplicates and compresses beneath the filesystem; on RHEL 9 create it with **`lvcreate --type vdo --size <physical> --virtualsize <logical>`**.
- VDO volumes are **over-committed by design** — monitor the physical pool, not `df`.
- Good on VM/container images and backups; pointless on already-compressed or encrypted data.
