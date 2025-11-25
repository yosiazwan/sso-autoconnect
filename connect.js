// connect.js — Semua konfigurasi dari .env
require('dotenv').config();
const puppeteer = require('puppeteer');
const os = require('os');

const USERNAME = process.env.USERNAME?.trim();
const PASSWORD = process.env.PASSWORD?.trim();
const BASE_URL = process.env.BASE_URL?.trim()?.replace(/\/+$/, ''); // hapus trailing slash
const ALLOWED_IPS_RAW = process.env.ALLOWED_IPS?.trim();

if (!USERNAME || !PASSWORD || !BASE_URL || !ALLOWED_IPS_RAW) {
  console.error('Pastikan USERNAME, PASSWORD, BASE_URL, dan ALLOWED_IPS ada di .env!');
  process.exit(1);
}

// Parse daftar IP/subnet yang diizinkan
const ALLOWED_PATTERNS = ALLOWED_IPS_RAW.split(',').map(s => s.trim()).filter(Boolean);

const delay = ms => new Promise(res => setTimeout(res, ms));

// Cek apakah IP lokal masuk dalam daftar yang diizinkan
function isAllowedNetwork() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        const matched = ALLOWED_PATTERNS.some(pattern => {
          if (pattern.includes('/')) return isIpInSubnet(ip, pattern);
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*$/, '.*') + '$');
          return regex.test(ip);
        });
        if (matched) {
          console.log(`IP terdeteksi: ${ip} → diizinkan`);
          return true;
        }
      }
    }
  }
  console.log('IP tidak diizinkan → script dihentikan');
  return false;
}

// Helper: cek IP dalam subnet CIDR
function isIpInSubnet(ip, cidr) {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = ~(2 ** (32 - bits) - 1) >>> 0;
  const ipNum = ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
  const rangeNum = range.split('.').reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

// ===================== MAIN =====================
(async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Memulai...`);

  if (!isAllowedNetwork()) {
    process.exit(0);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  try {
    console.log('Membuka halaman status...');
    await page.goto(`${BASE_URL}/status`, { waitUntil: 'networkidle2', timeout: 12000 });
    const body = await page.content();

    if (body.includes(USERNAME)) {
      console.log(`Sudah terkoneksi sebagai ${USERNAME}`);
      await browser.close();
      process.exit(0);
    }

    console.log(`Belum terkoneksi → melakukan login...`);
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
    await page.goto(`${BASE_URL}/status`, { waitUntil: 'networkidle2', timeout: 12000 });
    const final = await page.content();

    if (final.includes(USERNAME)) {
      console.log(`Berhasil terkoneksi sebagai ${USERNAME}`);
    } else {
      console.log('Login gagal');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('Selesai.\n');
    process.exit(0);
  }
})();