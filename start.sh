#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Austin Mini Server — Master Unified Launcher & Manager
# Author / Developer: Austin
# Mengelola: Web Dashboard Panel (Port 8080) & Ubuntu VPS OpenSSH (Port 2222)
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# Simpan LD_PRELOAD asli Termux (libtermux-exec). Tanpa ini, Android 10+ menolak
# eksekusi binary seperti node dengan error "Permission denied".
ORIG_LD_PRELOAD="${LD_PRELOAD:-}"

# Inisialisasi Environment Termux
export PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"
[ -z "$HOME" ] || [ "$HOME" = "/" ] || [ "$HOME" = "/root" ] && [ -d "/data/data/com.termux/files/home" ] && export HOME="/data/data/com.termux/files/home"
export PATH="/data/data/com.termux/files/usr/bin:$PREFIX/bin:$PREFIX/bin/applets:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/system/bin:/system/xbin:$PATH"
[ -d "$PREFIX/lib" ] && export LD_LIBRARY_PATH="$PREFIX/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# Pulihkan LD_PRELOAD Termux (dipakai sebelum menjalankan node/binary Termux)
restore_preload() {
    if [ -n "$ORIG_LD_PRELOAD" ]; then
        export LD_PRELOAD="$ORIG_LD_PRELOAD"
    else
        local l
        for l in libtermux-exec-ld-preload.so libtermux-exec.so; do
            if [ -f "$PREFIX/lib/$l" ]; then
                export LD_PRELOAD="$PREFIX/lib/$l"
                break
            fi
        done
    fi
}

DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$DIR/panel/server.js" ]; then
    SERVER_DIR="$DIR"
elif [ -d "$HOME/AustinServer" ]; then
    SERVER_DIR="$HOME/AustinServer"
elif [ -d "$HOME/AustinNode" ]; then
    SERVER_DIR="$HOME/AustinNode"
elif [ -d "$HOME/panel" ]; then
    SERVER_DIR="$HOME/panel"
else
    SERVER_DIR="$DIR"
fi
LOG_DIR="$SERVER_DIR/logs"
mkdir -p "$LOG_DIR"
PANEL_LOG="$LOG_DIR/panel.log"
VPS_LOG="$LOG_DIR/vps.log"

UBUNTU_DIR="$HOME/ubuntu-fs"
START_UBUNTU="$SERVER_DIR/scripts/start-ubuntu.sh"
[ ! -f "$START_UBUNTU" ] && START_UBUNTU="$HOME/start-ubuntu.sh"

export PANEL_USER="admin"
export PANEL_PASS="admin123"
export PANEL_PORT="8080"

get_local_ip() {
    local ip
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
    if [ -z "$ip" ] || ! echo "$ip" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        ip=$(ip addr show 2>/dev/null | grep -E "inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | grep -v "127.0.0.1" | awk '{print $2}' | cut -d'/' -f1 | head -n1)
    fi
    if [ -z "$ip" ]; then
        ip=$(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n1)
    fi
    echo "${ip:-127.0.0.1}"
}

is_port_active() {
    local port="$1"
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
        return 0
    fi
    if command -v nc >/dev/null 2>&1; then
        nc -z -w 1 127.0.0.1 "$port" >/dev/null 2>&1 && return 0
    fi
    if command -v ss >/dev/null 2>&1; then
        ss -tln 2>/dev/null | grep -q ":${port}[[:space:]]" && return 0
    fi
    if command -v netstat >/dev/null 2>&1; then
        netstat -tln 2>/dev/null | grep -q ":${port}[[:space:]]" && return 0
    fi
    return 1
}

# Jalankan perintah di dalam Ubuntu (proot) tanpa mengganggu shell utama
run_in_ubuntu() {
    (
        unset LD_PRELOAD
        export PROOT_NO_SECCOMP=1
        proot --link2symlink -0 -r "$UBUNTU_DIR" \
            -b /dev -b /dev/pts -b /proc -b /sys \
            -w /root \
            /usr/bin/env -i HOME=/root \
            PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
            /bin/bash -c "$1"
    ) >/dev/null 2>&1
}

# Pastikan sshd siap jalan: binary, user privsep, host key, dan folder runtime
prepare_ubuntu_ssh() {
    mkdir -p "$UBUNTU_DIR/run/sshd" "$UBUNTU_DIR/var/run/sshd" "$UBUNTU_DIR/etc/ssh" 2>/dev/null || true
    chmod 0755 "$UBUNTU_DIR/run/sshd" "$UBUNTU_DIR/var/run/sshd" 2>/dev/null || true

    if [ ! -x "$UBUNTU_DIR/usr/sbin/sshd" ]; then
        echo -e "${YELLOW}>> OpenSSH belum terpasang di Ubuntu, memasang openssh-server...${NC}"
        run_in_ubuntu "export DEBIAN_FRONTEND=noninteractive; rm -f /var/lib/dpkg/lock* /var/lib/apt/lists/lock /var/cache/apt/archives/lock; apt-get update -y; apt-get install -y --no-install-recommends openssh-server"
    fi

    # Konfigurasi sshd (dibuat ulang jika hilang)
    if [ ! -s "$UBUNTU_DIR/etc/ssh/sshd_config" ]; then
        cat > "$UBUNTU_DIR/etc/ssh/sshd_config" << 'SSHD_EOF'
Port 2222
ListenAddress 0.0.0.0
PermitRootLogin yes
PasswordAuthentication yes
PermitEmptyPasswords no
UsePAM no
StrictModes no
Subsystem sftp /usr/lib/openssh/sftp-server
SSHD_EOF
    fi

    # Host key & user privilege-separation (tanpa ini sshd langsung keluar)
    if ! ls "$UBUNTU_DIR"/etc/ssh/ssh_host_*_key >/dev/null 2>&1 || ! grep -q '^sshd:' "$UBUNTU_DIR/etc/passwd" 2>/dev/null; then
        run_in_ubuntu "ssh-keygen -A; grep -q '^sshd:' /etc/passwd || useradd -r -M -d /run/sshd -s /usr/sbin/nologin sshd; mkdir -p /run/sshd; chmod 0755 /run/sshd"
    fi
}

# -----------------------------------------------------------------------------
# 1. KONTROL VPS OPENSSH (Port 2222)
# -----------------------------------------------------------------------------
start_vps() {
    if is_port_active 2222; then
        echo -e "${GREEN}✓ VPS OpenSSH sudah aktif di port 2222.${NC}"
        return 0
    fi

    echo -e "${YELLOW}>> Menjalankan OpenSSH Server di dalam Ubuntu VPS (Port 2222)...${NC}"
    if [ -d "$UBUNTU_DIR" ] && command -v proot >/dev/null 2>&1; then
        # Matikan sshd lama saja (jangan pkill pola "sshd" yang terlalu luas)
        pkill -9 -f "sshd -p 2222" 2>/dev/null || true
        pkill -9 -f "/usr/sbin/sshd" 2>/dev/null || true
        sleep 0.3

        prepare_ubuntu_ssh

        # Subshell: unset LD_PRELOAD & env proot HANYA berlaku untuk proot,
        # tidak bocor ke shell utama (agar node tetap bisa dieksekusi).
        (
            unset LD_PRELOAD
            export PROOT_NO_SECCOMP=1
            nohup proot \
                --link2symlink \
                -0 \
                -r "$UBUNTU_DIR" \
                -b /dev \
                -b /dev/pts \
                -b /proc \
                -b /sys \
                -b /sdcard \
                -b /data/data/com.termux/files:/data/data/com.termux/files \
                -b "$HOME":/root/termux-home \
                -w /root \
                /usr/bin/env -i \
                HOME=/root \
                HOSTNAME=austin \
                PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
                /usr/sbin/sshd -D -e \
                -p 2222 \
                -o UsePAM=no \
                -o PermitRootLogin=yes \
                -o PasswordAuthentication=yes \
                -o StrictModes=no > "$VPS_LOG" 2>&1 < /dev/null &
        )
        local i
        for i in $(seq 1 15); do
            sleep 1
            is_port_active 2222 && break
        done
        if is_port_active 2222; then
            echo -e "${GREEN}✓ VPS OpenSSH aktif di background (Port 2222).${NC}"
        else
            echo -e "${RED}✗ VPS OpenSSH belum aktif. Cek log: $VPS_LOG${NC}"
            [ -f "$VPS_LOG" ] && tail -n 8 "$VPS_LOG"
            return 1
        fi
    else
        pkill -f "sshd -p 2222" 2>/dev/null || true
        sshd -p 2222 2>/dev/null || true
        sleep 1
        if is_port_active 2222; then
            echo -e "${GREEN}✓ OpenSSH Termux aktif di port 2222.${NC}"
        else
            echo -e "${RED}✗ OpenSSH gagal aktif. Pasang dulu: pkg install openssh proot${NC}"
            return 1
        fi
    fi
}

stop_vps() {
    echo -e "${YELLOW}>> Menghentikan VPS OpenSSH...${NC}"
    pkill -9 -f "sshd -p 2222" 2>/dev/null || true
    pkill -9 -f "/usr/sbin/sshd" 2>/dev/null || true
    echo -e "${GREEN}✓ VPS OpenSSH dihentikan.${NC}"
}

get_node_bin() {
    if command -v node >/dev/null 2>&1; then
        command -v node
    elif [ -x "$PREFIX/bin/node" ]; then
        echo "$PREFIX/bin/node"
    elif [ -x "/data/data/com.termux/files/usr/bin/node" ]; then
        echo "/data/data/com.termux/files/usr/bin/node"
    elif [ -x "/usr/bin/node" ]; then
        echo "/usr/bin/node"
    elif [ -x "/usr/local/bin/node" ]; then
        echo "/usr/local/bin/node"
    else
        echo ""
    fi
}

start_panel() {
    if is_port_active 8080; then
        echo -e "${GREEN}✓ Web Dashboard Panel sudah aktif di port 8080.${NC}"
        return 0
    fi

    echo -e "${YELLOW}>> Memeriksa runtime Node.js...${NC}"
    local NODE_BIN
    NODE_BIN=$(get_node_bin)

    if [ -z "$NODE_BIN" ]; then
        echo -e "${YELLOW}⚠️ Node.js tidak terdeteksi. Mencoba menginstal Node.js di Termux...${NC}"
        pkg update -y 2>/dev/null || true
        pkg install -y nodejs || pkg install -y nodejs-lts || true
        NODE_BIN=$(get_node_bin)
    fi

    if [ -z "$NODE_BIN" ]; then
        echo -e "${RED}✗ Error: Node.js belum terpasang! Web Panel tidak dapat dijalankan.${NC}"
        echo -e "${YELLOW}Solusi: Jalankan 'pkg install nodejs -y' di Termux lalu coba lagi.${NC}"
        return 1
    fi

    echo -e "${YELLOW}>> Menjalankan Web Dashboard Panel (Port 8080)...${NC}"
    pkill -f "node.*/panel/server\.js" 2>/dev/null || true
    pkill -f "node server.js" 2>/dev/null || true
    sleep 0.5

    local SERVER_JS="$SERVER_DIR/panel/server.js"
    [ ! -f "$SERVER_JS" ] && SERVER_JS="$DIR/panel/server.js"
    [ ! -f "$SERVER_JS" ] && SERVER_JS="$DIR/server.js"

    if [ ! -f "$SERVER_JS" ]; then
        echo -e "${RED}✗ Error: File server.js tidak ditemukan di direktori $SERVER_DIR/panel atau $DIR!${NC}"
        return 1
    fi

    restore_preload
    cd "$SERVER_DIR" 2>/dev/null || true

    # Percobaan 1: setsid (jika ada), Percobaan 2: nohup lewat bash
    PANEL_PID=""
    if command -v setsid >/dev/null 2>&1; then
        setsid "$NODE_BIN" "$SERVER_JS" > "$PANEL_LOG" 2>&1 < /dev/null &
    else
        nohup "$NODE_BIN" "$SERVER_JS" > "$PANEL_LOG" 2>&1 < /dev/null &
    fi
    PANEL_PID=$!
    sleep 1.5

    if ! kill -0 "$PANEL_PID" 2>/dev/null && grep -qi "permission denied" "$PANEL_LOG" 2>/dev/null; then
        echo -e "${YELLOW}⚠️ Peluncuran langsung ditolak, mencoba metode cadangan...${NC}"
        nohup "$PREFIX/bin/bash" -c "exec \"$NODE_BIN\" \"$SERVER_JS\"" > "$PANEL_LOG" 2>&1 < /dev/null &
        PANEL_PID=$!
        sleep 1.5
    fi

    if kill -0 "$PANEL_PID" 2>/dev/null; then
        echo -e "${GREEN}✓ Web Panel aktif di background (PID: $PANEL_PID).${NC}"
    else
        echo -e "${RED}✗ Gagal menjalankan Web Panel. Cek log di: $PANEL_LOG${NC}"
        if [ -f "$PANEL_LOG" ]; then
            echo -e "${RED}Isi Log Terakhir:${NC}"
            tail -n 10 "$PANEL_LOG"
        fi
        return 1
    fi
}

stop_panel() {
    echo -e "${YELLOW}>> Menghentikan Web Panel...${NC}"
    pkill -f "node.*/panel/server\.js" 2>/dev/null || true
    pkill -f "node server.js" 2>/dev/null || true
    echo -e "${GREEN}✓ Web Panel dihentikan.${NC}"
}

# -----------------------------------------------------------------------------
# 3. START ALL, STOP ALL, & STATUS
# -----------------------------------------------------------------------------
print_banner() {
    echo -e "${CYAN}"
    cat << 'BANNER'
    _             _   _          ____                             
   / \  _   _ ___| |_(_)_ __    / ___|  ___ _ ____   _____ _ __ 
  / _ \| | | / __| __| | '_ \   \___ \ / _ \ '__\ \ / / _ \ '__|
 / ___ \ |_| \__ \ |_| | | | |   ___) |  __/ |   \ V /  __/ |   
/_/   \_\__,_|___/\__|_|_| |_|  |____/ \___|_|    \_/ \___|_|   
BANNER
    echo -e "${NC}"
}

start_all() {
    command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null || true

    echo ""
    print_banner
    echo -e "${YELLOW}        Memulai Seluruh Layanan Server...${NC}"
    echo ""

    start_vps
    start_panel

    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    echo ""
    echo -e "${GREEN}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│  ✅ SELURUH LAYANAN SERVER BERHASIL DIAKTIFKAN!             │${NC}"
    echo -e "${GREEN}├─────────────────────────────────────────────────────────────┤${NC}"
    echo -e "   🌐 ${CYAN}Web Dashboard Panel (Buka di Browser HP / Laptop):${NC}"
    echo -e "      ➜ Alamat   : ${YELLOW}http://${LOCAL_IP}:${PANEL_PORT}${NC}"
    echo -e "      ➜ Username : ${YELLOW}${PANEL_USER}${NC}"
    echo -e "      ➜ Password : ${YELLOW}${PANEL_PASS}${NC}"
    echo -e ""
    echo -e "   🖥️ ${CYAN}Ubuntu VPS Console (Akses SSH):${NC}"
    echo -e "      ➜ Perintah : ${YELLOW}ssh root@${LOCAL_IP} -p 2222${NC}"
    echo -e "      ➜ Password : ${YELLOW}ubuntu123${NC}"
    echo -e "${GREEN}└─────────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "${BLUE}💡 Panduan Penggunaan:${NC}"
    echo -e "   • Buka alamat Web Dashboard di atas untuk kelola file, terminal, & bot."
    echo -e "   • Server berjalan senyap di background (Termux bebas digunakan)."
    echo -e "   • Cek status server : ${YELLOW}./start.sh status${NC}"
    echo -e "   • Pantau log live   : ${YELLOW}./start.sh logs${NC}"
    echo -e "   • Hentikan server   : ${YELLOW}./start.sh stop${NC}"
    echo ""
}

stop_all() {
    echo -e "${RED}>> Menghentikan semua layanan server...${NC}"
    stop_panel
    stop_vps
    echo -e "${GREEN}✓ Seluruh layanan server telah dimatikan.${NC}"
}

status_all() {
    local LOCAL_IP
    LOCAL_IP=$(get_local_ip)

    echo ""
    echo -e "${CYAN}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│               📊 STATUS LAYANAN AUSTIN SERVER                 │${NC}"
    echo -e "${CYAN}├─────────────────────────────────────────────────────────────┤${NC}"
    if is_port_active 8080; then
        echo -e "   • Web Dashboard Panel (Port 8080) : ${GREEN}🟢 AKTIF${NC} -> http://${LOCAL_IP}:8080"
    else
        echo -e "   • Web Dashboard Panel (Port 8080) : ${RED}🔴 NONAKTIF${NC}"
    fi
    if is_port_active 2222; then
        echo -e "   • Ubuntu VPS SSH      (Port 2222) : ${GREEN}🟢 AKTIF${NC} -> ssh root@${LOCAL_IP} -p 2222"
    else
        echo -e "   • Ubuntu VPS SSH      (Port 2222) : ${RED}🔴 NONAKTIF${NC}"
    fi
    echo -e "${CYAN}└─────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

show_logs() {
    if [ -f "$PANEL_LOG" ]; then
        echo -e "${CYAN}📋 Menampilkan Log Server Live (Tekan Ctrl+C untuk keluar):${NC}"
        tail -f "$PANEL_LOG"
    else
        echo -e "${YELLOW}Berkas log belum tersedia.${NC}"
    fi
}

case "$1" in
    stop|--stop)
        stop_all
        ;;
    restart|--restart)
        stop_all
        sleep 1
        start_all
        ;;
    status|--status)
        status_all
        ;;
    logs|log|--logs)
        show_logs
        ;;
    panel|--panel)
        start_panel
        ;;
    vps|--vps)
        start_vps
        ;;
    *)
        start_all
        ;;
esac
