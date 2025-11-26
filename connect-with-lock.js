// connect-with-lock.js — Auto-connect portal TIAP DETIK, 100% aman
require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCK_FILE = path.join(__dirname, '.connect.lock');
const MY_PID = process.pid;

const USERNAME = process.env.USERNAME?.trim();
const PASSWORD = process.env.PASSWORD?.trim();
const BASE_URL = process.env.BASE_URL?.trim()?.replace(/\/+$/, '');
const ALLOWED_IPS_RAW = process.env.ALLOWED_IPS?.trim();

if (!USERNAME || !PASSWORD || !BASE_URL || !ALLOWED_IPS_RAW) {
  console.error('Isi semua variabel di .env!');
  process.exit(1);
}

// === FUNGSI: Cek & bersihkan lock mati (stale lock) ===
function cleanupStaleLock() {
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const lockedPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim());
    if (isNaN(lockedPid)) return false;
    process.kill(lockedPid, 0); // akan throw jika proses tidak ada
    return false; // masih hidup
  } catch (err) {
    // Proses sudah mati → hapus lock lama
    console.log(`[CLEAN] Lock lama (PID ${lockedPid}) sudah mati → dihapus`);
    fs.unlinkSync(LOCK_FILE);
    return true;
  }
}

// === CEK LOCK — hanya lanjut jika tidak ada proses lain atau lock mati ===
if (fs.existsSync(LOCK_FILE)) {
  if (!cleanupStaleLock()) {
    const lockedPid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    console.log(`[SKIP] Proses lain sedang berjalan (PID: ${lockedPid})`);
    process.exit(0);
  }
}

// === BUAT LOCK BARU (kita yang punya) ===
fs.writeFileSync(LOCK_FILE, MY_PID.toString());
console.log(`[LOCK] Proses dimulai → PID ${MY_PID}`);

// === Cleanup: HANYA hapus jika lock masih milik kita ===
const cleanup = () => {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const owner = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      if (owner === MY_PID.toString()) {
        fs.unlinkSync(LOCK_FILE);
        console.log(`[UNLOCK] Lock dihapus oleh PID ${MY_PID}`);
      }
    }
  } catch (e) { /* ignore */ }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('uncaughtException', (err) => {
  console.error('Unhandled Error:', err.message);
  process.exit(1);
});

// === CEK IP DIIZINKAN ===
function isAllowedNetwork() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets).flat()) {
    if (iface.family === 'IPv4' && !iface.internal) {
      const ip = iface.address;
      const allowed = ALLOWED_IPS_RAW.split(',').some(p => {
        p = p.trim();
        if (p.includes('/')) {
          const [range, bits] = p.split('/');
          const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
          const ipNum = ip.split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
          const rangeNum = range.split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
          return (ipNum & mask) === (rangeNum & mask);
        }
        const regex = new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*$/, '.*') + '$');
        return regex.test(ip);
      });
      if (allowed) return true;
    }
  }
  return false;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

// ===================== MAIN =====================
(async () => {
  console.log(`[${new Date().toLocaleTimeString()}.${new Date().getMilliseconds()}] Memulai...`);

  if (!isAllowedNetwork()) {
    console.log('Bukan jaringan yang diizinkan → keluar');
    process.exit(0);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    await page.goto(`${BASE_URL}/status`, { waitUntil: 'networkidle2', timeout: 12000 });
    const body = await page.content();

    if (body.includes(USERNAME)) {
      console.log(`Sudah terkoneksi sebagai ${USERNAME}`);
    } else {
      console.log(`Belum login → melakukan login sebagai ${USERNAME}...`);
      await page.goto(`${BASE_URL}/logout`, { waitUntil: 'networkidle2' }).catch(() => {});
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 12000 });
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await page.type('input[name="username"]', USERNAME);
      await page.type('input[name="password"]', PASSWORD);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
        page.click('button[type="submit"]')
      ]);
      await delay(3000);
      const final = await page.content();
      console.log(final.includes(USERNAME) ? 'Login berhasil!' : 'Login gagal!');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();