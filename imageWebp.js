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
    const e = new Error('Surat faýlyny işläp bolmady. Başga surat saýlap görüň.');
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

// Express middleware: multer-den soň goýulýar, görkezilen meýdanlardaky suratlary WebP edýär.
function webpUploads(...fieldNames) {
  return async (req, res, next) => {
    // Admin däl bolsa CPU harçlamaýarys – handler özi login sahypasyna ugradýar
    if (!req.session || !req.session.adminLoggedIn) return next();

    const files = [];
    if (req.file && fieldNames.includes(req.file.fieldname)) files.push(req.file);
    if (req.files && !Array.isArray(req.files)) {
      fieldNames.forEach((name) => {
        (req.files[name] || []).forEach((f) => files.push(f));
      });
    }
    for (const f of files) {
      await convertUploadedFile(f);
    }
    next();
  };
}

module.exports = {
  CONVERTIBLE_EXT,
  convertToWebp,
  webpPathFor,
  webpUploads
};
