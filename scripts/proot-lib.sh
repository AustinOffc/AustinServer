#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Austin Mini Server — Pustaka PRoot bersama (di-source oleh start.sh,
# start-ubuntu.sh, dan shim Node.js). TIDAK menjalankan apa pun saat di-source.
#
# Kenapa ada: di sebagian HP/ROM, proot gagal total dengan error
#   "Function not implemented" (ENOSYS) -- mkdir, getcwd, exec semuanya gagal --
# tergantung kombinasi flag proot, mode seccomp, dan kernel Android. Satu set
# flag yang tetap tidak cocok di semua perangkat, jadi di sini ada beberapa
# "varian" yang dicoba berurutan; yang lolos tes dasar disimpan dan dipakai.
# ==============================================================================

AUSTIN_PROOT_VARIANTS="classic seccomp distro distro-noseccomp minimal"

# Isi AUSTIN_PV_FLAGS (array) dan AUSTIN_PV_NOSECCOMP (1/0) untuk satu varian.
austin_proot_variant_flags() {
    AUSTIN_PV_FLAGS=()
    AUSTIN_PV_NOSECCOMP=1
    case "$1" in
        classic)           AUSTIN_PV_FLAGS=(--link2symlink -0); AUSTIN_PV_NOSECCOMP=1 ;;
        seccomp)           AUSTIN_PV_FLAGS=(--link2symlink -0); AUSTIN_PV_NOSECCOMP=0 ;;
        distro)            AUSTIN_PV_FLAGS=(-L --kernel-release=5.4.0-austin --link2symlink --kill-on-exit --root-id); AUSTIN_PV_NOSECCOMP=0 ;;
        distro-noseccomp)  AUSTIN_PV_FLAGS=(-L --kernel-release=5.4.0-austin --link2symlink --kill-on-exit --root-id); AUSTIN_PV_NOSECCOMP=1 ;;
        minimal)           AUSTIN_PV_FLAGS=(-0); AUSTIN_PV_NOSECCOMP=1 ;;
        *) return 1 ;;
    esac
    return 0
}

# Atur PROOT_NO_SECCOMP sesuai varian (panggil di dalam subshell).
austin_proot_apply_env() {
    local prefix="${PREFIX:-/data/data/com.termux/files/usr}"
    export TMPDIR="${TMPDIR:-$prefix/tmp}"
    mkdir -p "$TMPDIR" 2>/dev/null || true
    export PROOT_TMP_DIR="${PROOT_TMP_DIR:-$TMPDIR}"
    if [ "${AUSTIN_PV_NOSECCOMP:-1}" = "1" ]; then
        export PROOT_NO_SECCOMP=1
    else
        unset PROOT_NO_SECCOMP
    fi
}

# Baca varian tersimpan (file cache); default "classic".
austin_proot_cached_variant() {
    local f="$1" v=""
    [ -n "$f" ] && [ -s "$f" ] && v="$(head -n1 "$f" 2>/dev/null | tr -cd 'a-z-')"
    austin_proot_variant_flags "$v" >/dev/null 2>&1 || v="classic"
    echo "$v"
}

# True bila skrip ini sendiri sedang berjalan DI DALAM proot (ditandai ada
# tracer ptrace). proot di dalam proot tidak bisa jalan -> "Function not implemented".
austin_in_proot() {
    local t
    t="$(awk '/^TracerPid:/ {print $2}' /proc/self/status 2>/dev/null)"
    [ -n "$t" ] && [ "$t" != "0" ]
}

# Buang direktori shim Node.js / Node milik proot dari PATH. Kalau tidak,
# `command -v node` menemukan shim dan panel ikut berjalan di dalam proot.
austin_clean_path() {
    local out="" p
    local IFS=':'
    for p in $PATH; do
        [ -z "$p" ] && continue
        case "$p" in
            */.shims|*/.shims/*|*/runtime/node/v*) continue ;;
        esac
        out="${out:+$out:}$p"
    done
    PATH="$out"
    export PATH
}

# Tes dasar satu varian: proot harus bisa masuk ke rootfs, mkdir, dan menjalankan sh.
# Hasil keluaran disimpan di AUSTIN_SMOKE_OUT.
austin_proot_smoke() {
    local variant="$1" rootfs="$2" out tcmd=""
    austin_proot_variant_flags "$variant" || return 1
    command -v timeout >/dev/null 2>&1 && tcmd="timeout 25"
    out="$(
        (
            unset LD_PRELOAD
            austin_proot_apply_env
            $tcmd proot "${AUSTIN_PV_FLAGS[@]}" -r "$rootfs" \
                -b /dev -b /proc -b /sys -w / \
                /usr/bin/env -i HOME=/root \
                PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
                /bin/sh -c 'mkdir -p /run/sshd && cd / && echo AUSTIN_PROOT_OK'
        ) 2>&1
    )"
    AUSTIN_SMOKE_OUT="$out"
    case "$out" in *AUSTIN_PROOT_OK*) return 0 ;; esac
    return 1
}

# Pilih varian yang berfungsi. Varian tersimpan dicoba lebih dulu.
#   $1 = rootfs, $2 = file cache varian, $3 = (opsional) nama fungsi logger
# Berhasil -> AUSTIN_PROOT_VARIANT terisi & disimpan; gagal -> return 1.
austin_proot_select() {
    local rootfs="$1" cache="$2" logfn="${3:-:}" v tried=""
    AUSTIN_PROOT_VARIANT=""
    for v in "$(austin_proot_cached_variant "$cache")" $AUSTIN_PROOT_VARIANTS; do
        case " $tried " in *" $v "*) continue ;; esac
        tried="$tried $v"
        if austin_proot_smoke "$v" "$rootfs"; then
            AUSTIN_PROOT_VARIANT="$v"
            [ -n "$cache" ] && echo "$v" > "$cache" 2>/dev/null
            "$logfn" "proot varian '$v' lolos tes dasar."
            return 0
        fi
        "$logfn" "proot varian '$v' GAGAL: $(printf '%s' "$AUSTIN_SMOKE_OUT" | tail -n 2 | tr '\n' ' ' | cut -c1-220)"
    done
    return 1
}
