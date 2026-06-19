// Generate printable QR codes for each table.
//
// The QR points at the STATIC redirect URL (/t/<bar>), so you print it once and
// it works forever — the daily security token is added server-side on scan.
//
// Usage:
//   node scripts/generate-qr.mjs --base https://your-app.com --bar demo --tables 12
//
// Output: ./qr-codes/<bar>-table-01.png ... and one printable index.html
//
// Requires: npm i -D qrcode

import QRCode from "qrcode";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const base = (arg("base", "http://localhost:3000")).replace(/\/$/, "");
const bar = arg("bar", "demo");
const tables = parseInt(arg("tables", "10"), 10);
const outDir = path.resolve("qr-codes");

await mkdir(outDir, { recursive: true });

const cards = [];
for (let t = 1; t <= tables; t++) {
  const table = String(t).padStart(2, "0");
  // table is passed as a hint param; the bar id is what gates access
  const url = `${base}/t/${bar}?table=${table}`;
  const file = `${bar}-table-${table}.png`;
  await QRCode.toFile(path.join(outDir, file), url, {
    width: 600,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  cards.push({ table, file, url });
  console.log(`✓ ${file}  →  ${url}`);
}

// Printable sheet (table tents) — open in a browser and print.
const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${bar} — Table QR Codes</title>
<style>
  body{font-family:system-ui,sans-serif;background:#fff;color:#000;margin:0;padding:24px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}
  .card{border:2px dashed #ccc;border-radius:16px;padding:24px;text-align:center;page-break-inside:avoid}
  .card img{width:240px;height:240px}
  h1{font-size:22px;margin:0 0 4px} .t{font-size:14px;color:#666}
  .brand{font-size:28px;font-weight:900;margin-bottom:8px}
  @media print{.card{border-color:#eee}}
</style></head><body>
<div class="grid">
${cards
  .map(
    (c) => `<div class="card">
      <div class="brand">Cheers 🍻</div>
      <img src="${c.file}" alt="QR table ${c.table}">
      <h1>Table ${c.table}</h1>
      <div class="t">Scan to meet people in the bar tonight</div>
    </div>`
  )
  .join("\n")}
</div></body></html>`;

await writeFile(path.join(outDir, "index.html"), html);
console.log(`\nPrintable sheet: qr-codes/index.html  (open & print)`);
