// Suratlary WebP formatyna öwürmek üçin umumy kömekçi (upload we bir gezeklik skript üçin)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Windows-da faýly okalandan soň pozup bolar ýaly libvips keşini öçürýäris
sharp.cache(false);

const MAX_SIZE = 1920;      // iň uzyn tarapy (px) – saýt üçin ýeterlik
const WEBP_QUALITY = 75;
const CONVERTIBLE_EXT = /\.(jpe?g|png|gif|bmp|tiff?|avif|heic|heif|svg|webp)$/i;

// Islendik suraty WebP-e öwürýär: EXIF boýunça aýlaýar, uly bolsa kiçeldýär.
async function convertToWebp(inputPath, outputPath) {
  const buffer = await sharp(inputPath, { animated: true })
    .rotate()
    .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toBuffer();
  await fs.promises.writeFile(outputPath, buffer);
  return buffer.length;
}

function webpPathFor(filePath) {
  const ext = path.extname(filePath);
  return (ext ? filePath.slice(0, -ext.length) : filePath) + '.webp';
}

// Multer-iň ýüklän bir faýlyny WebP-e öwürýär we file obýektini täzeleýär.
async function convertUploadedFile(file) {
  const outPath = webpPathFor(file.path);
  try {
    await convertToWebp(file.path, outPath);
  } catch (err) {
    await fs.promises.unlink(file.path).catch(() => {});
    const name = file.originalname ? `«${file.originalname}» faýlyny` : 'Surat faýlyny';
    const e = new Error(`${name} işläp bolmady. Başga surat saýlap görüň.`);
    e.code = 'IMAGE_CONVERT_FAILED';
    e.cause = err;
    throw e;
  }
  if (path.resolve(outPath) !== path.resolve(file.path)) {
    await fs.promises.unlink(file.path).catch(() => {});
  }
  file.path = outPath;
  file.filename = path.basename(outPath);
  file.mimetype = 'image/webp';
  return file;
}

// Multer-iň şu soragda ýüklän ähli faýllary: single(), array() we fields() üçin
function uploadedFiles(req) {
  const all = [];
  if (req.file) all.push(req.file);
  if (Array.isArray(req.files)) {
    all.push(...req.files);
  } else if (req.files) {
    Object.values(req.files).forEach((list) => all.push(...list));
  }
  return all;
}

// Elementleri iň köp `limit` sany bir wagtda işleýär. Ýalňyşlyk bolsa täzelerini başlamaýar,
// başlanlaryň gutarmagyna garaşýar we birinji ýalňyşlygy zyňýar.
async function runLimited(items, limit, worker) {
  let next = 0;
  let firstError = null;
  async function lane() {
    while (next < items.length && !firstError) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (err) {
        firstError = firstError || err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (firstError) throw firstError;
}

// Bir wagtda öwrülýän surat sany (serweriň RAM-y we CPU-sy üçin ýeterlik derejede az)
const CONVERT_CONCURRENCY = 2;

// Express middleware: multer-den soň goýulýar, görkezilen meýdanlardaky suratlary WebP edýär.
// Suratlaryň biri hem işlenmese, şu soragyň ähli faýllary pozulýar (ýarym-ýarty ýükleme galmaz).
function webpUploads(...fieldNames) {
  return async (req, res, next) => {
    // Admin däl bolsa CPU harçlamaýarys – handler özi login sahypasyna ugradýar
    if (!req.session || !req.session.adminLoggedIn) return next();

    const all = uploadedFiles(req);
    const images = all.filter((f) => fieldNames.includes(f.fieldname));
    try {
      await runLimited(images, CONVERT_CONCURRENCY, convertUploadedFile);
    } catch (err) {
      await Promise.all(all.map((f) => fs.promises.unlink(f.path).catch(() => {})));
      return next(err);
    }
    next();
  };
}

module.exports = {
  CONVERTIBLE_EXT,
  convertToWebp,
  webpPathFor,
  uploadedFiles,
  webpUploads
};
