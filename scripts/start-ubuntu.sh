#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Script Peluncur Terminal Distro Linux Ubuntu VPS (PRoot) — Austin Mini Server
# Author / Developer: Austin
# ==============================================================================

# Inisialisasi Environment Termux (Kompatibel Root/su & Non-Root)
export PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
[ -z "$HOME" ] || [ "$HOME" = "/" ] || [ "$HOME" = "/root" ] && [ -d "/data/data/com.termux/files/home" ] && export HOME="/data/data/com.termux/files/home"
export PATH="/data/data/com.termux/files/usr/bin:$PREFIX/bin:$PREFIX/bin/applets:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
[ -d "$PREFIX/lib" ] && export LD_LIBRARY_PATH="$PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

UBUNTU_DIR="$HOME/ubuntu-fs"
unset LD_PRELOAD

# Pakai varian flag proot yang sudah terbukti jalan di perangkat ini (dipilih
# otomatis oleh start.sh; lihat scripts/proot-lib.sh). Tanpa pustaka -> flag lama.
PROOT_LIB=""
for _d in "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")" "$HOME/AustinServer/scripts" "$HOME"; do
    [ -f "$_d/proot-lib.sh" ] && { PROOT_LIB="$_d/proot-lib.sh"; break; }
done
PROOT_VARIANT_FILE=""
for _d in "$HOME/AustinServer/logs" "$HOME/AustinNode/logs"; do
    [ -f "$_d/proot-variant" ] && { PROOT_VARIANT_FILE="$_d/proot-variant"; break; }
done
if [ -n "$PROOT_LIB" ]; then
    . "$PROOT_LIB"
    austin_proot_variant_flags "$(austin_proot_cached_variant "$PROOT_VARIANT_FILE")"
    austin_proot_apply_env
else
    AUSTIN_PV_FLAGS=(--link2symlink -0)
    export PROOT_NO_SECCOMP=1
fi

PROOT_CMD=(
    proot
    "${AUSTIN_PV_FLAGS[@]}"
    -r "$UBUNTU_DIR"
    -b /dev
    -b /dev/pts
    -b /proc
    -b /sys
    -b /sdcard
    -b /data/data/com.termux/files:/data/data/com.termux/files
    -b "$HOME":/root/termux-home
    -w /root
)

ENV_VARS=(
    HOME=/root
    USER=root
    LANG=C.UTF-8
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    TERM="$TERM"
)

if [ $# -eq 0 ]; then
    exec "${PROOT_CMD[@]}" /usr/bin/env -i "${ENV_VARS[@]}" /bin/bash --login
else
    exec "${PROOT_CMD[@]}" /usr/bin/env -i "${ENV_VARS[@]}" "$@"
fi
