# Boot, Targets, and Getting Back In

> **The one-sentence version:** systemd decides *how far* a system boots by choosing a **target**, GRUB decides *what* it boots with, and knowing how to interrupt GRUB is what turns "I don't have the root password" from a disaster into a five-minute task.

Two skills live here: setting the normal boot behaviour, and rescuing a system that won't boot normally.

## Why it matters

Resetting a lost root password is one of the most reliably examined tasks, and it's pure procedure — you either know the sequence or you don't. The rest of this lesson is what stops a well-meant change from producing an unbootable system.

## Targets: how far to boot

A **target** is a unit that groups other units — systemd's replacement for runlevels.

| Target | What you get |
|---|---|
| `graphical.target` | Multi-user, networked, with a GUI |
| `multi-user.target` | Multi-user, networked, text only |
| `rescue.target` | Single-user with the root filesystem mounted and basic services |
| `emergency.target` | The bare minimum: root mounted read-only, almost nothing running |

```bash
systemctl get-default                        # what boots by default
systemctl set-default multi-user.target      # change it (persistent)
systemctl isolate multi-user.target          # switch NOW, without rebooting
```

> 💡 `isolate` changes the running system; `set-default` changes what happens at the next boot. A task saying "the system should boot without a GUI" wants **`set-default`** — this is a persistence trap in disguise.

## Interrupting GRUB

At the boot menu, press **`e`** to edit the selected entry, arrow down to the line starting with `linux`, append what you need at its end, and press **Ctrl-x** to boot with it. Nothing you type there is saved — it applies to this boot only, which is exactly what you want in a rescue.

Useful things to append:

| Append | Effect |
|---|---|
| `systemd.unit=rescue.target` | Boot to rescue mode |
| `systemd.unit=emergency.target` | Boot to emergency mode |
| `rd.break` | Stop in the initramfs, *before* the real root is handed over |

## Resetting the root password

This is the sequence. Practise it until it's muscle memory.

1. Reboot, and at the GRUB menu press **`e`**.
2. On the `linux` line, append **`rd.break`**, then **Ctrl-x**.
3. You land at a `switch_root:/#` prompt. The real root filesystem is mounted **read-only at `/sysroot`**.

```bash
mount -o remount,rw /sysroot     # make it writable
chroot /sysroot                  # become the real system
passwd root                      # set the new password
touch /.autorelabel              # tell SELinux to relabel on next boot
exit                             # leave the chroot
exit                             # continue booting
```

> ⚠️ **`touch /.autorelabel` is the step people forget**, and skipping it is worse than it sounds: `passwd` writes `/etc/shadow` with the wrong SELinux context, and on the next boot the login process can't read it — so nobody can log in at all. The relabel takes a few minutes and the system reboots itself afterwards. Let it finish.

## Kernel arguments, the safe way

Editing GRUB by hand is easy to get wrong. `grubby` edits the boot entries for you:

```bash
grubby --info=ALL                                  # inspect current entries
grubby --default-kernel                            # which kernel boots by default
grubby --update-kernel=ALL --args="quiet"          # add an argument to every entry
grubby --update-kernel=ALL --remove-args="quiet"   # take it away again
```

For settings like the menu timeout, edit `/etc/default/grub` and regenerate the config:

```bash
vim /etc/default/grub                 # e.g. GRUB_TIMEOUT=10
grub2-mkconfig -o /boot/grub2/grub.cfg
```

> 💡 On UEFI systems the generated file has historically lived under `/boot/efi/EFI/redhat/grub.cfg`. Recent RHEL unifies this so `/boot/grub2/grub.cfg` is right either way — if you're unsure on the machine in front of you, check which path exists before writing to it.

## When boot goes wrong

```bash
systemctl --failed          # units that failed
systemctl status <unit>     # why this one failed
journalctl -xb              # this boot's log, with explanatory hints
journalctl -b -1            # the PREVIOUS boot (needs a persistent journal)
systemd-analyze blame       # what took so long
```

In emergency mode the root filesystem is read-only, so the first move is almost always `mount -o remount,rw /` before you can fix anything — most often a bad `/etc/fstab` line.

## tuned: performance profiles

`tuned` applies a bundle of kernel and device settings for a workload. It's a small, very examinable command set.

```bash
systemctl enable --now tuned
tuned-adm active                  # current profile
tuned-adm list                    # what's available
tuned-adm recommend               # what tuned suggests for this machine
tuned-adm profile virtual-guest   # switch (persistent)
```

## Check yourself

1. A task says the system must boot to a text-mode multi-user environment from now on. Which command, and why isn't `isolate` the answer?
2. In the `rd.break` procedure, why is `/sysroot` remounted read-write, and what does `touch /.autorelabel` prevent?
3. The system drops to emergency mode after you edited `/etc/fstab`. What's your first command, and what do you fix?

## Key takeaways

- Targets replace runlevels: `get-default` / `set-default` for the **next** boot, `isolate` for **now**.
- Press **`e`** at GRUB to append arguments for one boot only — `systemd.unit=rescue.target`, `emergency.target`, or `rd.break`.
- Root password reset = `rd.break` → `mount -o remount,rw /sysroot` → `chroot /sysroot` → `passwd root` → **`touch /.autorelabel`** → `exit`, `exit`.
- Use **`grubby`** for kernel arguments; edit `/etc/default/grub` plus `grub2-mkconfig` for menu settings.
- Debug boots with `systemctl --failed` and `journalctl -xb`; in emergency mode remount `/` read-write first.
- `tuned-adm profile <name>` sets a performance profile, and `tuned-adm active` proves it.
