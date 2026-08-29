# Local Storage: Partitions, LVM, and Growing Things

> **The one-sentence version:** A disk becomes usable in three moves — carve a **partition**, wrap it in **LVM** (physical volume → volume group → logical volume), and put a **filesystem** on the logical volume — and LVM exists so the third step can grow later without moving any data.

This is the highest-risk area of the exam, because the commands are destructive and the mistakes are silent. Slow, deliberate work here is fast overall.

## Why it matters

"Add 2 GiB of storage mounted at `/data`" is a near-guaranteed style of task, and it touches partitioning, LVM, filesystems, and `/etc/fstab` in one chain — each link of which can fail quietly. Growing a full filesystem is also the single most common thing a real sysadmin is paged about.

## Always start by looking

```bash
lsblk                 # the tree: disks, partitions, mount points
lsblk -f              # ...plus filesystem type, LABEL, UUID
blkid                 # UUIDs of every block device
df -h                 # what's mounted and how full
pvs ; vgs ; lvs       # the LVM layers, one line each
```

> ⚠️ Confirm **which disk** before you touch anything. `/dev/vda` is usually the system disk; a `mkfs` on the wrong device ends the exam attempt. `lsblk` first, every single time.

## Step 1: partition the disk

```bash
parted /dev/vdb mklabel gpt                     # label the disk (DESTRUCTIVE)
parted /dev/vdb mkpart primary 1MiB 2GiB        # create a partition
parted /dev/vdb set 1 lvm on                    # flag it for LVM
parted /dev/vdb print                           # verify
udevadm settle                                  # let device nodes appear
```

`fdisk /dev/vdb` does the same job interactively if you prefer it — `n` new, `t` type, `p` print, `w` write, `q` quit without saving. Both are fine; the exam grades the result.

> 💡 If the kernel doesn't notice a new partition, `partprobe /dev/vdb` (or `udevadm settle`) usually resolves it. On a busy disk you may need a reboot — which is a fine time to also confirm the rest of your work held.

## Step 2: the three LVM layers

🔑 **PV → VG → LV.** A *physical volume* is a device handed over to LVM. A *volume group* is a pool made from one or more PVs. A *logical volume* is a slice of that pool — and it's the thing you format and mount. The whole point of the middle layer is that a pool can be grown from another disk, and a slice can be grown from the pool, without touching your data.

```bash
pvcreate /dev/vdb1                        # device -> physical volume
vgcreate vg_data /dev/vdb1                # PV(s) -> volume group
lvcreate -n lv_app -L 2G vg_data          # VG -> logical volume, by size
lvcreate -n lv_all -l 100%FREE vg_data    # ...or by extents / remaining space
```

The logical volume shows up at two equivalent paths: `/dev/vg_data/lv_app` and `/dev/mapper/vg_data-lv_app`.

Space inside a VG is allocated in fixed-size **physical extents** (4 MiB by default), which is why `-l` counts extents and `-L` takes a human size. If a task says "50 extents," use `-l 50`; if it says "2 GiB," use `-L 2G`.

## Step 3: filesystem and mount

```bash
mkfs.xfs /dev/vg_data/lv_app        # XFS: the RHEL default
mkfs.ext4 /dev/vg_data/lv_app       # ext4 when the task asks for it
mkdir -p /data
mount /dev/vg_data/lv_app /data     # temporary! see the next lesson for fstab
```

## Growing storage (the part worth drilling)

Two different "out of space" problems, two different fixes.

**The volume group is full** — add another device to the pool:

```bash
pvcreate /dev/vdc1
vgextend vg_data /dev/vdc1
vgs                                  # VFree should have grown
```

**The logical volume is too small** — take more from the pool:

```bash
lvextend -L +1G -r /dev/vg_data/lv_app     # add 1 GiB and resize the filesystem
lvextend -l +100%FREE -r /dev/vg_data/lv_app   # take everything left in the VG
df -h /data                                # verify the MOUNTED size changed
```

> 🔑 **`-r` is the flag that matters.** Without it you've grown the container and not the filesystem inside it, so `df` shows no change and the task fails. `-r` (`--resizefs`) does both in one step. (Doing it manually is `xfs_growfs /data` for XFS or `resize2fs /dev/…` for ext4 — worth knowing, but `-r` is fewer chances to slip.)

> ⚠️ **XFS cannot shrink.** Neither can it be grown while unmounted — `xfs_growfs` works on a *mounted* filesystem. ext4 can shrink, but only unmounted. If a task asks you to *reduce* a filesystem, that's a strong hint it's ext4; if it's XFS, the honest answer is back up, recreate, restore.

## Removing things (in reverse order)

```bash
umount /data
lvremove /dev/vg_data/lv_app
vgremove vg_data
pvremove /dev/vdb1
```

And remember to remove the `/etc/fstab` line, or the next boot will hang waiting for a device that no longer exists.

> 💡 Some exam versions include **LVM VDO** (deduplication and compression) or **Stratis**, and some don't — it depends on the RHEL version the exam targets. Check the official objective list for your exam version rather than assuming, and if it's listed, practise it specifically; the concepts don't transfer from plain LVM.

## Check yourself

1. You ran `lvextend -L +2G /dev/vg_data/lv_app` and `df -h` still shows the old size. What did you forget?
2. A volume group has no free space left but the server has a new blank disk. What's the sequence of commands?
3. Which filesystem can't be shrunk at all, and what does that mean for a task that asks you to reduce one?

## Key takeaways

- **Look before you cut**: `lsblk`, `lsblk -f`, `pvs/vgs/lvs`. The most expensive mistakes are on the wrong device.
- The chain is **partition → `pvcreate` → `vgcreate` → `lvcreate` → `mkfs` → mount**, and the LV lives at `/dev/<vg>/<lv>`.
- Grow the **pool** with `vgextend`, grow the **slice** with `lvextend` — and always pass **`-r`** so the filesystem grows too.
- `-L` takes a size, `-l` takes extents (or `100%FREE`); a task's wording tells you which.
- **XFS grows but never shrinks**; grow it while it's mounted.
- Tear down in reverse, and delete the `fstab` line so the system still boots.
