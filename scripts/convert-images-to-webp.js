// Bir gezeklik skript: public/image içindäki ähli suratlary WebP-e öwürýär,
// maglumat bazasyndaky salgylary (.jpg/.png -> .webp) täzeleýär we köne faýllary pozýar.
//
// Ulanylyşy:  npm run images:webp
//             npm run images:webp -- --keep-originals   (köne faýllary pozmazdan)
//
// Gaýtadan işledilse zyýany ýok: eýýäm öwrülen suratlar geçilýär.
const fs = require('fs');
const path = require('path');
const { CONVERTIBLE_EXT, convertToWebp, webpPathFor } = require('../imageWebp');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IMAGE_DIR = path.join(PUBLIC_DIR, 'image');
// favicon / apple-touch-icon PNG we SVG bolup galmaly (brauzerler we iOS talap edýär)
const SKIP_DIRS = new Set([path.join(IMAGE_DIR, 'icons')]);
const KEEP_ORIGINALS = process.argv.includes('--keep-originals');

// Suratyň salgysy saklanýan tablisalar we sütünler
const DB_COLUMNS = [
  { table: 'gallery', column: 'gallery_url' },
  { table: 'tours', column: 'tour_picture' },
  { table: 'videos', column: 'poster_url' }
];

function walk(dir) {
  if (SKIP_DIRS.has(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function kb(bytes) {
  return (bytes / 1024).toFixed(0) + ' KB';
}

// "/image/galery/1.jpg" -> diskdäki doly ýol (diňe public/image içinde bolsa)
function urlToDiskPath(url) {
  if (typeof url !== 'string') return null;
  const clean = url.trim().split(/[?#]/)[0];
  if (!/^\/?image\//i.test(clean)) return null;
  const abs = path.resolve(PUBLIC_DIR, clean.replace(/^\//, ''));
  return abs.startsWith(IMAGE_DIR + path.sep) ? abs : null;
}

function diskPathToUrl(abs) {
  return '/' + path.relative(PUBLIC_DIR, abs).split(path.sep).join('/');
}

async function convertFiles() {
  const sources = walk(IMAGE_DIR).filter((f) => CONVERTIBLE_EXT.test(f) && !/\.webp$/i.test(f));
  const converted = []; // { src, out }
  const usedTargets = new Set();
  let before = 0;
  let after = 0;

  for (const src of sources) {
    let out = webpPathFor(src);
    // Şol bir atda iki surat bar bolsa (1.jpg we 1.png) – ikinjisine aýratyn at
    if (usedTargets.has(out)) {
      out = out.replace(/\.webp$/i, '-' + path.extname(src).slice(1).toLowerCase() + '.webp');
    }
    usedTargets.add(out);

    const srcSize = fs.statSync(src).size;
    if (fs.existsSync(out)) {
      console.log(`  geçildi (eýýäm bar): ${diskPathToUrl(out)}`);
    } else {
      const outSize = await convertToWebp(src, out);
      before += srcSize;
      after += outSize;
      console.log(`  ${diskPathToUrl(src)}  ${kb(srcSize)}  ->  ${path.basename(out)}  ${kb(outSize)}`);
    }
    converted.push({ src, out });
  }

  if (before) {
    console.log(`\nJemi: ${kb(before)} -> ${kb(after)} (${Math.round((1 - after / before) * 100)}% kiçeldi)`);
  }
  return converted;
}

async function updateDatabase(converted) {
  const db = require('../db');
  await db.ready;
  const q = db.promise();
  const renamed = new Map(converted.map(({ src, out }) => [src, out]));
  let updated = 0;

  try {
    for (const { table, column } of DB_COLUMNS) {
      const [rows] = await q.query(`SELECT id, \`${column}\` AS url FROM \`${table}\``);
      for (const row of rows) {
        const abs = urlToDiskPath(row.url);
        if (!abs || /\.webp$/i.test(abs) || !CONVERTIBLE_EXT.test(abs)) continue;
        const target = renamed.get(abs) || webpPathFor(abs);
        if (!fs.existsSync(target)) {
          console.warn(`  DUÝDURYŞ: ${table}#${row.id} ${row.url} – WebP faýly tapylmady, üýtgedilmedi`);
          continue;
        }
        const newUrl = diskPathToUrl(target);
        await q.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`, [newUrl, row.id]);
        console.log(`  ${table}#${row.id}: ${row.url} -> ${newUrl}`);
        updated += 1;
      }
    }
  } finally {
    db.end();
  }
  console.log(`Bazada ${updated} ýazgy täzelendi.`);
}

function deleteOriginals(converted) {
  if (KEEP_ORIGINALS) {
    console.log('\nKöne faýllar saklandy (--keep-originals).');
    return;
  }
  converted.forEach(({ src }) => {
    if (fs.existsSync(src)) fs.unlinkSync(src);
  });
  console.log(`\n${converted.length} köne faýl pozuldy.`);
}

(async () => {
  console.log('1) Suratlar WebP-e öwrülýär...');
  const converted = await convertFiles();

  console.log('\n2) Maglumat bazasyndaky salgylar täzelenýär...');
  await updateDatabase(converted);

  console.log('\n3) Köne faýllar...');
  deleteOriginals(converted);

  console.log('\nTaýýar.');
})().catch((err) => {
  console.error('Ýalňyşlyk:', err);
  process.exit(1);
});
