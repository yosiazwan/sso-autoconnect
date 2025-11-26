# Portal Auto Connect

Script Node.js sederhana untuk **otomatis login ke portal captive** (misalnya Wi-Fi kantor, hotspot perusahaan, dll) menggunakan **Puppeteer**.
Script hanya akan berjalan jika komputer kamu terdeteksi berada di jaringan yang diizinkan (berdasarkan IP lokal).

Semua konfigurasi (username, password, URL portal, dan daftar IP yang diizinkan) disimpan di file `.env` — **tidak ada data sensitif di dalam kode**.

### Fitur
- Cek IP lokal → hanya jalan di jaringan yang diizinkan
- Otomatis login jika belum terkoneksi
- Keluar otomatis setelah selesai (aman untuk cron)
- Semua konfigurasi di `.env` (mudah diganti tanpa ubah kode)
- Support exact IP, prefix (`10.10.3.*`), dan CIDR (`10.10.4.0/24`)

### Prasyarat
- Node.js ≥ 16
- npm
- Linux / macOS / Windows (sudah teruji di Ubuntu, Mint, Windows 10/11)

### Instalasi

```bash
# Clone atau copy folder ini
git clone <repo-kamu> sso-autoconnect
cd sso-autoconnect
```

### Install dependensi
```bash
npm install puppeteer dotenv
```

### Konfigurasi .env
isi username dan password di .env dan jalankan:

```bash
node connect.js
```

Kalau mau yang bisa dijalankan tiap detik (pakai lock file):

```bash
node connect-with-lock.js
```

### Jalankan di cron setiap detik

```bash
* * * * * $HOME/path/to/project/connect-lrs.sh
```