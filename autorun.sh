#!/usr/bin/env bash

# Auto-connect portal — jalankan TIAP 1 DETIK (60 kali/menit)
# File ini berada di folder yang sama dengan connect-with-lock.js → super rapi!

# Path otomatis (tidak perlu hardcode lagi)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$HOME/.nvm/versions/node/v24.11.1/bin/node"   # sesuaikan kalau beda versi
SCRIPT="$DIR/connect-with-lock.js"

# Jalankan 60 kali per menit → tiap 1 detik
for i in {0..59}; do
  (
    sleep $i
    cd "$DIR" && "$NODE" "$SCRIPT" >/dev/null 2>&1
  ) &
done

# Tunggu semua selesai (biar cron tidak langsung exit)
wait

exit 0