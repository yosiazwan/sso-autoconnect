// connect.js — Lock file di folder proyek (anti-overlap untuk cron)
require('dotenv').config();
const puppeteer = require('puppeteer');
const os = require('os');
const fs = require('fs');
const path = require('path');

// === PATH LOCK FILE DI FOLDER INI ===
const LOCK_FILE = path.join(__dirname, '.connect.lock'); // file: .connect.lock

const USERNAME = process.env.USERNAME?.trim();
const PASSWORD = process.env.PASSWORD?.trim();
const BASE_URL = process.env.BASE_URL?.trim()?.replace(/\/+$/, '');
const ALLOWED_IPS_RAW = process.env.ALLOWED_IPS?.trim();

if (!USERNAME || !PASSWORD || !BASE_URL || !ALLOWED_IPS_RAW) {
  console.error('Isi USERNAME, PASSWORD, BASE_URL, dan ALLOWED_IPS di .env!');
  process.exit(1);
}

// === CEK LOCK FILE — JIKA ADA = PROSES MASIH JALAN ===
if (fs.existsSync(LOCK_FILE)) {
  const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
  console.log(`[SKIP] Proses lain masih berjalan (PID: ${pid || 'unknown'})`);
  process.exit(0);
}

// === BUAT LOCK FILE + tulis PID ===
fs.writeFileSync(LOCK_FILE, process.pid.toString());
console.log(`[LOCK] Proses dimulai (PID: ${process.pid})`);

// === Hapus lock saat selesai (normal, error, Ctrl+C, dll) ===
const cleanup = () => {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
    console.log(`[UNLOCK] Lock dihapus`);
  }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
process.on('uncaughtException', (err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

// === FUNGSI IP CHECK & CIDR ===
function isIpInSubnet(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = ~(2 ** (32 - bits) - 1) >>> 0;
  const ipNum = ip.split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
  const rangeNum = range.split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

function isAllowedNetwork() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets).flat()) {
    if (iface.family === 'IPv4' && !iface.internal) {
      const ip = iface.address;
      const allowed = ALLOWED_IPS_RAW.split(',').some(p => {
        p = p.trim();
        if (p.includes('/')) return isIpInSubnet(ip, p);
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
  console.log(`[${new Date().toLocaleTimeString()}] Memeriksa koneksi...`);

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
      console.log(`Belum login → melakukan login...`);
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
    process.exit(0); // otomatis hapus lock via event 'exit'
  }
})();