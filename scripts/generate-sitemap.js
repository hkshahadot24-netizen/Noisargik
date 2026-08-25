const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'khati-khabar';
const API_KEY = 'AIzaSyBTF9qOouM1d6SwfBqI0n7ytQRr5ROEj0k';
const ORIGIN = 'https://www.noisargik.com';

function getValue(v) {
  if (!v) return '';
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return v.integerValue;
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  return '';
}

function slugify(name, id) {
  const value = String(name || id || 'product')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^\\w\\u0980-\\u09ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return encodeURIComponent(value || String(id));
}

async function main() {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${encodeURIComponent(API_KEY)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'products' }]
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Firestore returned ${response.status}: ${await response.text()}`);
  }

  const rows = await response.json();
  const urls = new Map();

  urls.set(`${ORIGIN}/`, '');

  for (const row of rows) {
    if (!row.document) continue;

    const id = row.document.name.split('/').pop();
    const fields = row.document.fields || {};

    // If active is missing, treat the product as active, matching the site's
    // safe default. Only an explicit active=false is excluded.
    const active = fields.active === undefined
      ? true
      : Boolean(getValue(fields.active));

    if (!active) continue;

    const name = getValue(fields.name) || id;
    const slug = getValue(fields.slug) || slugify(name, id);
    const loc = `${ORIGIN}/product/${slug}`;
    const lastmod = row.document.updateTime
      ? row.document.updateTime.slice(0, 10)
      : '';

    if (!urls.has(loc)) urls.set(loc, lastmod);
  }

  const escapeXml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const entries = [...urls.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([loc, lastmod]) =>
      `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`
    );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    ''
  ].join('\\n');

  fs.writeFileSync(path.join(process.cwd(), 'sitemap.xml'), xml, 'utf8');
  console.log(`Sitemap generated: ${entries.length} URLs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
