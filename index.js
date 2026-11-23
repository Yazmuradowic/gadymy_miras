const db=require('./db');
const myEnw={};
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config({ processEnv: myEnw, path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { verifyPassword } = require('./password');
const { webpUploads } = require('./imageWebp');
const app = express();
const port = myEnw.PORT || 3000;

// Saýt nginx (reverse proxy) arkaly işleýär: hakyky müşderi IP-si X-Forwarded-For sözbaşysynda gelýär.
// Diňe şol serwerdäki (loopback) proksä ynanýarys – daşardan gelen ýasama sözbaşylar hasaba alynmaýar.
app.set('trust proxy', 'loopback');
const GALLERY_VIDEOS_PAGE_SIZE = 15;

if (!myEnw.SESSION_SECRET) {
  console.error('SESSION_SECRET .env faýlynda kesgitlenmedik. Serwer howpsuzlyk sebäpli başlamaýar.');
  process.exit(1);
}

// Настройка EJS как шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware для парсинга тела запросов
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session
app.use(session({
  secret: myEnw.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// CSRF token – her session üçin bir gezek döredilýär, formalarda gizlin meýdan hökmünde ulanylýar
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

function verifyCsrf(req, res, next) {
  const token = req.body && req.body._csrf;
  if (token && req.session.csrfToken && token === req.session.csrfToken) {
    return next();
  }
  const wantsJson = !!(req.xhr || ((req.headers.accept || '').includes('application/json')));
  if (wantsJson) {
    return res.status(403).json({ ok: false, error: 'CSRF token nädogry ýa-da möhleti geçdi. Sahypany täzeläp görüň.' });
  }
  res.status(403).send('CSRF token nädogry ýa-da möhleti geçdi. Sahypany täzeläp, täzeden synanyşyň.');
}

// Login synanyşyklaryny çäklendirmek (brute-force garşy, ýady-esasly ýönekeý limiter)
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function loginRateLimiter(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (entry && entry.lockedUntil && entry.lockedUntil > now) {
    const waitMin = Math.max(1, Math.ceil((entry.lockedUntil - now) / 60000));
    return res.status(429).render('admin/login', {
      error: `Köp nädogry synanyşyk. ${waitMin} minutdan soň täzeden synanyşyň.`
    });
  }
  next();
}

function registerLoginFailure(req) {
  const key = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now, lockedUntil: 0 });
    return;
  }

  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_WINDOW_MS;
  }
  loginAttempts.set(key, entry);
}

function clearLoginFailures(req) {
  loginAttempts.delete(req.ip);
}

// Contact formadan gelýän habarlar korporatiw poçta (Hostinger SMTP) arkaly iberilýär.
// Bellik: .env bu taslamada process.env-e däl, myEnw obýektine ýüklenýär (ýokarda seret).
const SMTP_PASS_PLACEHOLDER = 'YOUR_EMAIL_PASSWORD_HERE';
const smtpConfigured = !!(
  myEnw.SMTP_HOST && myEnw.SMTP_USER && myEnw.SMTP_PASS &&
  myEnw.SMTP_PASS !== SMTP_PASS_PLACEHOLDER && myEnw.RECEIVER_EMAIL
);

const mailTransporter = smtpConfigured
  ? nodemailer.createTransport({
      host: myEnw.SMTP_HOST,
      port: Number(myEnw.SMTP_PORT) || 465,
      secure: true,
      auth: { user: myEnw.SMTP_USER, pass: myEnw.SMTP_PASS },
      // Poçta serweri jogap bermese, ulanyjy 2 minut garaşmasyn
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000
    })
  : null;

function describeSmtpError(err) {
  if (err && err.code === 'EAUTH') {
    return 'Login/parol kabul edilmedi – .env-däki SMTP_USER we SMTP_PASS barlaň.';
  }
  if (err && ['ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'EDNS'].includes(err.code)) {
    return `Tor ýalňyşlygy (${err.code}): serwer ${myEnw.SMTP_HOST}:${myEnw.SMTP_PORT} bilen birikip bilmedi. ` +
      'Bu tor/prowaýder SMTP portlaryny blokirleýän bolmagy ähtimal – paroldan bagly däl.';
  }
  return (err && err.message) || String(err);
}

if (mailTransporter) {
  mailTransporter.verify()
    .then(() => console.log(`SMTP taýýar: ${myEnw.SMTP_HOST} (${myEnw.SMTP_USER})`))
    .catch((err) => console.error('SMTP birikmesi barlanylanda ýalňyşlyk:', describeSmtpError(err), '|', err.message));
} else {
  console.warn('SMTP sazlanmadyk: .env faýlynda SMTP_HOST, SMTP_USER, SMTP_PASS, RECEIVER_EMAIL giriziň. Contact forma email ibermez.');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Contact forma üçin ýönekeý limiter: bir IP-den 10 minutda iň köp 5 habar (spam/poçta dolmagyna garşy)
const CONTACT_MAX_PER_WINDOW = 5;
const CONTACT_WINDOW_MS = 10 * 60 * 1000;
const contactAttempts = new Map();

function contactRateLimiter(req, res, next) {
  const now = Date.now();
  const recent = (contactAttempts.get(req.ip) || []).filter((t) => now - t < CONTACT_WINDOW_MS);
  if (recent.length >= CONTACT_MAX_PER_WINDOW) {
    contactAttempts.set(req.ip, recent);
    return res.status(429).json({ ok: false, error: 'Too many messages. Please try again in a few minutes.' });
  }
  recent.push(now);
  contactAttempts.set(req.ip, recent);
  next();
}

const EMAIL_REGEX = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

function validateContact(body) {
  const asText = (v) => (typeof v === 'string' ? v : '');
  // Ady we email-de setir geçişleri aýyrýarys (email header injection-a garşy)
  const name = asText(body.name).replace(/[\r\n]+/g, ' ').trim();
  const email = asText(body.email).replace(/[\r\n]+/g, '').trim();
  const message = asText(body.message).replace(/\r\n/g, '\n').trim();

  const errors = {};
  if (!name) errors.name = 'Adyňyzy giriziň';
  else if (name.length < 2) errors.name = 'Ad azyndan 2 harp bolmaly';
  else if (name.length > 100) errors.name = 'Ad 100 harpdan uzyn bolmaly däl';

  if (!email) errors.email = 'Email salgyňyzy giriziň';
  else if (email.length > 254 || !EMAIL_REGEX.test(email)) errors.email = 'Dogry email salgy giriziň';

  if (!message) errors.message = 'Hat ýazyň';
  else if (message.length < 10) errors.message = 'Hat azyndan 10 harp bolmaly';
  else if (message.length > 5000) errors.message = 'Hat 5000 harpdan uzyn bolmaly däl';

  return { data: { name, email, message }, errors };
}

function buildContactEmail({ name, email, message }, meta) {
  const rows = [
    ['Name', name],
    ['Email', email],
    ['Sent at', meta.sentAt]
  ];

  const text = [
    'New message from the gadymymiras.com contact form',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Message:',
    message,
    '',
    '— Reply to this email to answer the sender directly.'
  ].join('\n');

  const rowsHtml = rows.map(([k, v]) => `
          <tr>
            <td style="padding:8px 12px;background:#f4f6f8;font-weight:600;color:#2c3e50;width:110px;border-bottom:1px solid #e5e8eb;">${escapeHtml(k)}</td>
            <td style="padding:8px 12px;color:#333;border-bottom:1px solid #e5e8eb;">${k === 'Email'
              ? `<a href="mailto:${escapeHtml(v)}" style="color:#3498db;">${escapeHtml(v)}</a>`
              : escapeHtml(v)}</td>
          </tr>`).join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#eef1f4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#2c3e50;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold;">
          New contact form message
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;">${rowsHtml}
          </table>
          <h3 style="margin:24px 0 8px;color:#2c3e50;font-size:15px;">Message</h3>
          <div style="padding:14px 16px;background:#f9fafb;border-left:4px solid #3498db;color:#333;font-size:14px;line-height:1.6;white-space:normal;">
            ${escapeHtml(message).replace(/\n/g, '<br>')}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#f4f6f8;color:#7f8c8d;font-size:12px;">
          Sent from the gadymymiras.com contact form. Press “Reply” to answer ${escapeHtml(name)} directly.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

// Статические файлы (CSS, JS, изображения)
app.use(express.static(path.join(__dirname, 'public')));

// Ähli suratlar WebP-e öwrüldi: köne .jpg/.png salgy soralsa we ol faýl ýok bolsa,
// şol atly .webp faýla ugrukdyrýarys (köne baza ýazgylary / keşlenen sahypalar üçin).
const imageRootDir = path.join(__dirname, 'public', 'image');
app.use('/image', (req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !/\.(jpe?g|png|gif|bmp)$/i.test(req.path)) {
    return next();
  }
  let relPath;
  try {
    relPath = decodeURIComponent(req.path);
  } catch {
    return next();
  }
  const webpAbs = path.resolve(imageRootDir, '.' + relPath.replace(/\.[^./]+$/, '.webp'));
  if (!webpAbs.startsWith(imageRootDir + path.sep)) return next();
  fs.access(webpAbs, fs.constants.F_OK, (err) => {
    if (err) return next();
    res.redirect(301, '/image' + req.path.replace(/\.[^./]+$/, '.webp'));
  });
});

// Suratlar üçin upload konfigurasiýasy
const galleryUploadDir = path.join(__dirname, 'public', 'image', 'galery');
if (!fs.existsSync(galleryUploadDir)) {
  fs.mkdirSync(galleryUploadDir, { recursive: true });
}

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, galleryUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = 'gallery_' + Date.now();
    cb(null, base + ext);
  }
});

const galleryUpload = multer({
  storage: galleryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Diňe surat faýly kabul edilýär.'));
    }
    cb(null, true);
  }
});

// Видео үчүн upload конфигурациясы (poster -> public/image/videoimage, video -> public/video)
const videoImageDir = path.join(__dirname, 'public', 'image', 'videoimage');
const videoDir = path.join(__dirname, 'public', 'video');
if (!fs.existsSync(videoImageDir)) {
  fs.mkdirSync(videoImageDir, { recursive: true });
}
if (!fs.existsSync(videoDir)) {
  fs.mkdirSync(videoDir, { recursive: true });
}

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'poster_file') {
      cb(null, videoImageDir);
    } else {
      cb(null, videoDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = (file.fieldname === 'poster_file' ? 'poster_' : 'video_') + Date.now();
    cb(null, base + ext);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'poster_file') {
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return cb(new Error('Poster faýly üçin surat faýly gerek.'));
      }
      return cb(null, true);
    }
    // video_file
    if (!file.mimetype || !file.mimetype.startsWith('video/')) {
      return cb(new Error('Wideo faýly üçin video format gerek.'));
    }
    cb(null, true);
  }
});

// Tours üçin surat upload konfigurasiýasy (public/image/tour)
const tourImageDir = path.join(__dirname, 'public', 'image', 'tour');
if (!fs.existsSync(tourImageDir)) {
  fs.mkdirSync(tourImageDir, { recursive: true });
}

const tourStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tourImageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = 'tour_' + Date.now();
    cb(null, base + ext);
  }
});

const tourUpload = multer({
  storage: tourStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Diňe surat faýly kabul edilýär.'));
    }
    cb(null, true);
  }
});

// Маршруты
app.get('/', (req, res) => {
  // Получаем туры
  db.query('SELECT * FROM tours', (err, toursResults) => {
    if (err) {
      console.error('Ошибка при выполнении запроса tours: ' + err.stack);
      res.status(500).send('Ошибка сервера');
      return;
    }
    // Получаем отзывы и рендерим страницу после обоих запросов
    db.query('SELECT * FROM feedback', (err2, feedbackResults) => {
      if (err2) {
        console.error('Ошибка при выполнении запроса feedback: ' + err2.stack);
        res.status(500).send('Ошибка сервера');
        return;
      }
      //  console.log('Данные получены1: ', feedbackResults);
      res.render('index', { tours: toursResults, feedback: feedbackResults });
    });
  });
});
app.get('/about', (req, res) => {
  res.render('about');
});

app.get('/contact', (req, res) => {
  res.render('contact');
});

// Sahypalanan sanawlary (gallery/videos/tours) render etmek üçin umumy kömekçi
function paginateAndRender(req, res, { table, columns, view, dataKey, baseUrl, errorMsg }) {
  const requestedPage = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = GALLERY_VIDEOS_PAGE_SIZE;

  db.query(`SELECT COUNT(*) AS c FROM ${table}`, (cerr, countRows) => {
    if (cerr) {
      console.error(`${table} count error:`, cerr);
      return res.status(500).send(errorMsg);
    }
    const total = Number(countRows[0].c) || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    db.query(
      `SELECT ${columns} FROM ${table} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [pageSize, offset],
      (err, rows) => {
        if (err) {
          console.error(`${table} query error:`, err);
          return res.status(500).send(errorMsg);
        }
        res.render(view, {
          [dataKey]: rows,
          pagination: { page, totalPages, total, pageSize, baseUrl }
        });
      }
    );
  });
}

// Public gallery – suratlar bazadan (id, gallery_url), 15 sähetde
app.get('/gallery', (req, res) => {
  paginateAndRender(req, res, {
    table: 'gallery',
    columns: 'id, gallery_url',
    view: 'gallery',
    dataKey: 'photos',
    baseUrl: '/gallery',
    errorMsg: 'Galereýa üçin maglumat okalmady'
  });
});
// Public videos – wideolar bazadan, 15 sähetde
app.get('/videos', (req, res) => {
  paginateAndRender(req, res, {
    table: 'videos',
    columns: 'id, title, video_url, poster_url',
    view: 'videos',
    dataKey: 'videos',
    baseUrl: '/videos',
    errorMsg: 'Wideolar üçin maglumat okalmady'
  });
});

app.get('/tours', (req, res) => {
  paginateAndRender(req, res, {
    table: 'tours',
    columns: '*',
    view: 'tours',
    dataKey: 'tours',
    baseUrl: '/tours',
    errorMsg: 'Turlar üçin maglumat okalmady'
  });
});

app.get('/tour/:id', (req, res) => {
  const tourId = req.params.id;

  // 1️⃣ Tur maglumatlary
  db.query('SELECT * FROM tours WHERE id = ?', [tourId], (err, tourResults) => {
    if (err) {
      console.error('Ошибка при выполнении запроса tours:', err);
      return res.status(500).send('Ошибка сервера');
    }

    if (tourResults.length === 0) {
      return res.status(404).send('Тур не найден');
    }

    // 2️⃣ Günler (days)
    db.query('SELECT * FROM day WHERE tour_id = ?', [tourId], (err, tourDays) => {
      if (err) {
        console.error('Ошибка при выполнении запроса day:', err);
        return res.status(500).send('Ошибка сервера');
      }
// console.log("Maglumatlar ejs ugradyldy!");
      // 3️⃣ Iki massiw bilen render
      res.render('tour', {
        tur: tourResults[0], // bir tur
        days: tourDays       // günleriň massiwi
      });
    });
  });
});




// Contact forma: barlag -> korporatiw poçta iberilýär + admin panel üçin bazada saklanýar
app.post('/api/contact', verifyCsrf, contactRateLimiter, async (req, res) => {
  const { data, errors } = validateContact(req.body || {});
  if (Object.keys(errors).length) {
    return res.status(400).json({ ok: false, error: 'Please check the highlighted fields.', errors });
  }

  if (!mailTransporter) {
    console.error('Contact form: SMTP sazlanmadyk, email iberip bolmady.');
    return res.status(500).json({ ok: false, error: 'The message could not be sent. Please try again later or email us directly at travel@gadymymiras.com.' });
  }

  // Admin paneldäki "Habarlar" bölümi üçin bazada saklaýarys (ýalňyşlyk bolsa diňe log – esasy kanal email)
  const dbSave = new Promise((resolve) => {
    db.query(
      'INSERT INTO messages (name, email, message, is_read, created_at) VALUES (?, ?, ?, 0, NOW())',
      [data.name, data.email, data.message],
      (dbErr) => {
        if (dbErr) console.error('Contact message DB insert error:', dbErr);
        resolve();
      }
    );
  });

  const { text, html } = buildContactEmail(data, {
    sentAt: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ashgabat' }) + ' (Ashgabat)'
  });

  try {
    await mailTransporter.sendMail({
      from: `"Gadymy Miras Website" <${myEnw.SMTP_USER}>`,
      to: myEnw.RECEIVER_EMAIL,
      replyTo: { name: data.name, address: data.email },
      subject: `New website inquiry from ${data.name}`,
      text,
      html
    });
  } catch (mailErr) {
    console.error('Contact email send error:', describeSmtpError(mailErr), '|', mailErr.message);
    await dbSave;
    return res.status(500).json({ ok: false, error: 'The message could not be sent. Please try again later or email us directly at travel@gadymymiras.com.' });
  }

  await dbSave;
  return res.status(200).json({ ok: true, message: 'Thank you! Your message has been sent. We will contact you shortly.' });
});

// Admin routlary üçin – okuňmadyk habar sanyny ähli şablonlara berjek middleware
app.use('/gadymymiras/admin', (req, res, next) => {
  // default baha
  res.locals.unreadMessages = 0;

  db.query('SELECT COUNT(*) AS unread FROM messages WHERE is_read = 0', (err, rows) => {
    if (err) {
      console.error('Unread messages count error:', err);
      return next();
    }
    res.locals.unreadMessages = (rows && rows[0] && rows[0].unread) || 0;
    next();
  });
});

// Admin habarlary – sanaw
app.get('/gadymymiras/admin/messages', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  db.query(
    'SELECT id, name, email, message, is_read, created_at FROM messages ORDER BY created_at DESC',
    (err, rows) => {
      if (err) {
        console.error('Admin messages list error:', err);
        return res.status(500).send('Habarlary okap bolmady');
      }
      res.render('admin/messages', {
        messages: rows,
        selectedMessage: null
      });
    }
  );
});

// Admin habary aýratyn görmek – okalan diýip belläp
app.get('/gadymymiras/admin/messages/:id', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  const wantsJson = !!(req.xhr || ((req.headers.accept || '').includes('application/json')));

  // okalan diýip belle
  db.query('UPDATE messages SET is_read = 1 WHERE id = ?', [id], (updErr) => {
    if (updErr) {
      console.error('Mark message read error:', updErr);
    }

    // AJAX arkaly açylsa (poçta ýaly modal), diňe habaryň özüni JSON edip iber
    if (wantsJson) {
      return db.query(
        'SELECT id, name, email, message, is_read, created_at FROM messages WHERE id = ?',
        [id],
        (oneErr, oneRows) => {
          if (oneErr) {
            console.error('Admin message select error:', oneErr);
            return res.status(500).json({ ok: false, error: 'Habar tapylmady' });
          }
          if (!oneRows || !oneRows.length) {
            return res.status(404).json({ ok: false, error: 'Habar tapylmady' });
          }
          const msg = oneRows[0];
          db.query('SELECT COUNT(*) AS unread FROM messages WHERE is_read = 0', (countErr, countRows) => {
            res.json({
              ok: true,
              message: {
                id: msg.id,
                name: msg.name,
                email: msg.email,
                message: msg.message,
                is_read: msg.is_read,
                created_at: msg.created_at ? msg.created_at.toLocaleString() : ''
              },
              unreadMessages: (!countErr && countRows && countRows[0] && countRows[0].unread) || 0
            });
          });
        }
      );
    }

    // ähli habarlary we saýlanan habary alyp görkez
    db.query(
      'SELECT id, name, email, message, is_read, created_at FROM messages ORDER BY created_at DESC',
      (listErr, listRows) => {
        if (listErr) {
          console.error('Admin messages list error:', listErr);
          return res.status(500).send('Habarlary okap bolmady');
        }
        db.query(
          'SELECT id, name, email, message, is_read, created_at FROM messages WHERE id = ?',
          [id],
          (oneErr, oneRows) => {
            if (oneErr) {
              console.error('Admin message select error:', oneErr);
              return res.status(500).send('Habar tapylmady');
            }
            if (!oneRows || !oneRows.length) {
              return res.redirect('/gadymymiras/admin/messages');
            }
            res.render('admin/messages', {
              messages: listRows,
              selectedMessage: oneRows[0]
            });
          }
        );
      }
    );
  });
});

// Admin habary pozmak
app.post('/gadymymiras/admin/messages/:id/delete', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  db.query('DELETE FROM messages WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Admin message delete error:', err);
      return res.status(500).send('Habary pozup bolmady');
    }
    res.redirect('/gadymymiras/admin/messages');
  });
});

// Admin habarlary köpçülikleýin (saýlanan) pozmak
app.post('/gadymymiras/admin/messages/bulk-delete', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  let ids = req.body.ids;
  if (!ids) {
    return res.redirect('/gadymymiras/admin/messages');
  }
  if (!Array.isArray(ids)) {
    ids = [ids];
  }
  ids = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  if (!ids.length) {
    return res.redirect('/gadymymiras/admin/messages');
  }
  db.query('DELETE FROM messages WHERE id IN (?)', [ids], (err) => {
    if (err) {
      console.error('Admin messages bulk delete error:', err);
      return res.status(500).send('Habarlary pozup bolmady');
    }
    res.redirect('/gadymymiras/admin/messages');
  });
});

// Admin kommentler (feedback) – sanaw
app.get('/gadymymiras/admin/feedback', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  db.query('SELECT id, name, text FROM feedback ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error('Admin feedback list error:', err);
      return res.status(500).send('Kommentleri okap bolmady');
    }
    res.render('admin/feedback', {
      feedback: rows,
      error: null,
      adminTitle: 'Kommentler',
      adminSubtitle: 'Saýtdaky Comments bölümindäki kommentleri dolandyrmak.'
    });
  });
});

// Admin komment – täze goşmak
app.post('/gadymymiras/admin/feedback', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const name = (req.body.name || '').trim();
  const text = (req.body.text || '').trim();
  if (!name || !text) {
    return db.query('SELECT id, name, text FROM feedback ORDER BY id DESC', (err, rows) => {
      if (err) {
        console.error('Admin feedback list error:', err);
        return res.status(500).send('Kommentleri okap bolmady');
      }
      res.render('admin/feedback', {
        feedback: rows,
        error: 'Ady we tekst hökman girizilmeli.',
        adminTitle: 'Kommentler',
        adminSubtitle: 'Saýtdaky Comments bölümindäki kommentleri dolandyrmak.'
      });
    });
  }
  db.query('INSERT INTO feedback (name, text) VALUES (?, ?)', [name, text], (err) => {
    if (err) {
      console.error('Admin feedback insert error:', err);
      return res.status(500).send('Komment goşulanda ýalňyşlyk boldy');
    }
    res.redirect('/gadymymiras/admin/feedback');
  });
});

// Admin komment – üýtgetmek formasy
app.get('/gadymymiras/admin/feedback/:id/edit', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  db.query('SELECT id, name, text FROM feedback WHERE id = ?', [id], (err, rows) => {
    if (err) {
      console.error('Admin feedback select error:', err);
      return res.status(500).send('Komment tapylmady');
    }
    if (!rows || !rows.length) {
      return res.redirect('/gadymymiras/admin/feedback');
    }
    res.render('admin/feedback_edit', {
      item: rows[0],
      error: null,
      adminTitle: 'Komment üýtgetmek',
      adminSubtitle: 'Komment maglumatlaryny üýtgetmek.'
    });
  });
});

// Admin komment – üýtgetmek (POST)
app.post('/gadymymiras/admin/feedback/:id/update', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  const name = (req.body.name || '').trim();
  const text = (req.body.text || '').trim();
  if (!name || !text) {
    return db.query('SELECT id, name, text FROM feedback WHERE id = ?', [id], (err, rows) => {
      if (err || !rows || !rows.length) {
        return res.redirect('/gadymymiras/admin/feedback');
      }
      res.render('admin/feedback_edit', {
        item: rows[0],
        error: 'Ady we tekst hökman girizilmeli.',
        adminTitle: 'Komment üýtgetmek',
        adminSubtitle: 'Komment maglumatlaryny üýtgetmek.'
      });
    });
  }
  db.query('UPDATE feedback SET name = ?, text = ? WHERE id = ?', [name, text, id], (err) => {
    if (err) {
      console.error('Admin feedback update error:', err);
      return res.status(500).send('Komment üýtgedilende ýalňyşlyk boldy');
    }
    res.redirect('/gadymymiras/admin/feedback');
  });
});

// Admin komment – pozmak
app.post('/gadymymiras/admin/feedback/:id/delete', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  db.query('DELETE FROM feedback WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('Admin feedback delete error:', err);
      return res.status(500).send('Kommenti pozup bolmady');
    }
    res.redirect('/gadymymiras/admin/feedback');
  });
});

// /gadymymiras – giriş edilmedik: login; giriş edilen: admin panel
app.get('/gadymymiras', (req, res) => {
  if (req.session.adminLoggedIn) {
    // admin baş sahypasy üçin gysga statistikalar (häzirlikçe diňe okuňmadyk habar sany)
    db.query('SELECT COUNT(*) AS unread FROM messages WHERE is_read = 0', (err, rows) => {
      const stats = {
        unreadMessages: (!err && rows && rows[0] && rows[0].unread) ? rows[0].unread : 0
      };
      return res.render('admin/index', { stats });
    });
    return;
  }
  res.render('admin/login');
});

// Admin galereýa – görkezmek / dolandyrmak (id, gallery_url)
app.get('/gadymymiras/admin/gallery', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  db.query('SELECT id, gallery_url FROM gallery ORDER BY id DESC', (err, galleryResults) => {
    if (err) {
      console.error('Admin gallery query error:', err);
      return res.status(500).send('Galereýa maglumatlary okap bolmady');
    }
    res.render('admin/gallery', {
      photos: galleryResults,
      error: null,
      success: null
    });
  });
});

// Admin wideolar – görkezmek / dolandyrmak
app.get('/gadymymiras/admin/videos', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  db.query('SELECT id, title, video_url, poster_url FROM videos ORDER BY id DESC', (err, videoResults) => {
    if (err) {
      console.error('Admin videos query error:', err);
      return res.status(500).send('Wideolar maglumatlaryny okap bolmady');
    }
    res.render('admin/videos', {
      videos: videoResults,
      error: null
    });
  });
});

// Admin wideolar – täze goşmak (diňe faýldan)
app.post('/gadymymiras/admin/videos', videoUpload.fields([
  { name: 'poster_file', maxCount: 1 },
  { name: 'video_file', maxCount: 1 }
]), verifyCsrf, webpUploads('poster_file'), (req, res) => {
  const wantsJson = !!(req.xhr || ((req.headers.accept || '').includes('application/json')));

  if (!req.session.adminLoggedIn) {
    if (wantsJson) return res.status(401).json({ ok: false, error: 'Login gerek.' });
    return res.redirect('/gadymymiras/login');
  }

  const title = (req.body.title || '').trim();

  const posterFile = req.files && req.files.poster_file && req.files.poster_file[0];
  const videoFile = req.files && req.files.video_file && req.files.video_file[0];

  if (!title || !posterFile || !videoFile) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: 'Ady, poster faýly we wideo faýly hökman saýlamaly.' });
    }
    return db.query('SELECT id, title, video_url, poster_url FROM videos ORDER BY id DESC', (err, videoResults) => {
      if (err) {
        console.error('Admin videos query error:', err);
        return res.status(500).send('Wideolar maglumatlaryny okap bolmady');
      }
      return res.render('admin/videos', {
        videos: videoResults,
        error: 'Ady, poster faýly we wideo faýly hökman saýlamaly.'
      });
    });
  }

  const posterUrl = '/image/videoimage/' + posterFile.filename;
  const videoUrl = '/video/' + videoFile.filename;

  db.query(
    'INSERT INTO videos (title, video_url, poster_url) VALUES (?, ?, ?)',
    [title, videoUrl, posterUrl],
    (err) => {
      if (err) {
        console.error('Admin videos insert error:', err);
        if (wantsJson) return res.status(500).json({ ok: false, error: 'Wideo goşulanda ýalňyşlyk boldy' });
        return res.status(500).send('Wideo goşulanda ýalňyşlyk boldy');
      }
      if (wantsJson) return res.json({ ok: true, redirect: '/gadymymiras/admin/videos' });
      res.redirect('/gadymymiras/admin/videos');
    }
  );
});

// Admin wideolar – üýtgetmek (diňe faýldan wideo/poster, tekstden diňe ady)
app.post('/gadymymiras/admin/videos/:id/update', videoUpload.fields([
  { name: 'poster_file', maxCount: 1 },
  { name: 'video_file', maxCount: 1 }
]), verifyCsrf, webpUploads('poster_file'), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  const id = req.params.id;
  const title = (req.body.title || '').trim();

  const posterFile = req.files && req.files.poster_file && req.files.poster_file[0];
  const videoFile = req.files && req.files.video_file && req.files.video_file[0];

  if (!title) {
    return db.query('SELECT id, title, video_url, poster_url FROM videos ORDER BY id DESC', (err, videoResults) => {
      if (err) {
        console.error('Admin videos query error:', err);
        return res.status(500).send('Wideolar maglumatlaryny okap bolmady');
      }
      return res.render('admin/videos', {
        videos: videoResults,
        error: 'Ady boş bolup bilmez.'
      });
    });
  }

  // Häzirki URL-leri alýarys, soň täze faýl bar bolsa çalyşýarys
  db.query('SELECT video_url, poster_url FROM videos WHERE id = ?', [id], (err, rows) => {
    if (err) {
      console.error('Admin videos select for update error:', err);
      return res.status(500).send('Wideony tapyp bolmady');
    }

    if (!rows || !rows.length) {
      return res.redirect('/gadymymiras/admin/videos');
    }

    let currentVideoUrl = rows[0].video_url;
    let currentPosterUrl = rows[0].poster_url;

    if (posterFile) {
      currentPosterUrl = '/image/videoimage/' + posterFile.filename;
    }
    if (videoFile) {
      currentVideoUrl = '/video/' + videoFile.filename;
    }

    db.query(
      'UPDATE videos SET title = ?, video_url = ?, poster_url = ? WHERE id = ?',
      [title, currentVideoUrl, currentPosterUrl, id],
      (updErr) => {
        if (updErr) {
          console.error('Admin videos update error:', updErr);
          return res.status(500).send('Wideony üýtgedip bolmady');
        }
        res.redirect('/gadymymiras/admin/videos');
      }
    );
  });
});

// Admin wideolar – pozmak (bazadan we faýldan)
app.post('/gadymymiras/admin/videos/:id/delete', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  const id = req.params.id;
  db.query('SELECT video_url, poster_url FROM videos WHERE id = ?', [id], (err, rows) => {
    if (err) {
      console.error('Admin videos select for delete error:', err);
      return res.status(500).send('Wideony tapyp bolmady');
    }

    const row = rows && rows[0];

    const filePaths = [];
    if (row && row.video_url && row.video_url.startsWith('/')) {
      filePaths.push(path.join(__dirname, 'public', row.video_url.replace(/^\//, '')));
    }
    if (row && row.poster_url && row.poster_url.startsWith('/')) {
      filePaths.push(path.join(__dirname, 'public', row.poster_url.replace(/^\//, '')));
    }

    // Her bir faýly aýratyn pozmaga synanşýarys
    filePaths.forEach((filePath) => {
      fs.unlink(filePath, (fsErr) => {
        if (fsErr && fsErr.code !== 'ENOENT') {
          console.error('Wideo ýa poster faýlyny pozup bolmady:', fsErr);
        }
      });
    });

    db.query('DELETE FROM videos WHERE id = ?', [id], (delErr) => {
      if (delErr) {
        console.error('Admin videos delete error:', delErr);
        return res.status(500).send('Wideony pozup bolmady');
      }
      res.redirect('/gadymymiras/admin/videos');
    });
  });
});

// Admin galereýa – täze surat goşmak (faýl ýa-da URL)
app.post('/gadymymiras/admin/gallery', galleryUpload.single('image_file'), verifyCsrf, webpUploads('image_file'), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  const urlFromInput = (req.body.image_url || '').trim();
  let finalUrl = '';

  if (req.file) {
    finalUrl = '/image/galery/' + req.file.filename;
  } else if (urlFromInput) {
    finalUrl = urlFromInput;
  }

  if (!finalUrl) {
    return db.query('SELECT id, gallery_url FROM gallery ORDER BY id DESC', (err, galleryResults) => {
      if (err) {
        console.error('Admin gallery query error:', err);
        return res.status(500).send('Galereýa maglumatlary okap bolmady');
      }
      return res.render('admin/gallery', {
        photos: galleryResults,
        error: 'Surat faýly saýlamaly ýa-da URL girizmeli.',
        success: null
      });
    });
  }

  db.query(
    'INSERT INTO gallery (gallery_url) VALUES (?)',
    [finalUrl],
    (err) => {
      if (err) {
        console.error('Admin gallery insert error:', err);
        return res.status(500).send('Surat goşulanda ýalňyşlyk boldy');
      }
      res.redirect('/gadymymiras/admin/gallery');
    }
  );
});

// Admin galereýa – suraty üýtgetmek (faýl ýa-da URL)
app.post('/gadymymiras/admin/gallery/:id/update', galleryUpload.single('image_file'), verifyCsrf, webpUploads('image_file'), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  const id = req.params.id;
  const urlFromInput = (req.body.image_url || '').trim();
  let finalUrl = '';

  if (req.file) {
    finalUrl = '/image/galery/' + req.file.filename;
  } else if (urlFromInput) {
    finalUrl = urlFromInput;
  }

  if (!finalUrl) {
    return db.query('SELECT id, gallery_url FROM gallery ORDER BY id DESC', (err, galleryResults) => {
      if (err) {
        console.error('Admin gallery query error:', err);
        return res.status(500).send('Galereýa maglumatlary okap bolmady');
      }
      return res.render('admin/gallery', {
        photos: galleryResults,
        error: 'Täze surat faýly ýa URL görkezmeli.',
        success: null
      });
    });
  }

  db.query(
    'UPDATE gallery SET gallery_url = ? WHERE id = ?',
    [finalUrl, id],
    (err) => {
      if (err) {
        console.error('Admin gallery update error:', err);
        return res.status(500).send('Suraty üýtgedip bolmady');
      }
      res.redirect('/gadymymiras/admin/gallery');
    }
  );
});

// Admin galereýa – suraty pozmak (bazadan we faýldan)
app.post('/gadymymiras/admin/gallery/:id/delete', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  const id = req.params.id;
  // Ilki URL-ni alýarys
  db.query('SELECT gallery_url FROM gallery WHERE id = ?', [id], (err, rows) => {
    if (err) {
      console.error('Admin gallery select for delete error:', err);
      return res.status(500).send('Suraty tapyp bolmady');
    }

    const row = rows && rows[0];
    let fileToDelete = null;

    if (row && row.gallery_url && row.gallery_url.startsWith('/image/galery/')) {
      // Diňe öz serwerimiziň papkasyndaky suratlary pozýarys
      const relativePath = row.gallery_url.replace(/^\//, ''); // "image/galery/..."
      fileToDelete = path.join(__dirname, 'public', relativePath.replace(/^image[\\/]/, 'image/'));
    }

    // Ilki faýly (eger bar bolsa) pozmaga synanş
    if (fileToDelete) {
      fs.unlink(fileToDelete, (fsErr) => {
        if (fsErr && fsErr.code !== 'ENOENT') {
          console.error('Surat faýlyny pozup bolmady:', fsErr);
        }
        // Faýl pozulsa-da / pozulmasa-da bazadan ýazgyny pozýarys
        db.query('DELETE FROM gallery WHERE id = ?', [id], (delErr) => {
          if (delErr) {
            console.error('Admin gallery delete error:', delErr);
            return res.status(500).send('Suraty pozup bolmady');
          }
          res.redirect('/gadymymiras/admin/gallery');
        });
      });
    } else {
      // Daşarky URL – diňe bazadan pozýarys
      db.query('DELETE FROM gallery WHERE id = ?', [id], (delErr) => {
        if (delErr) {
          console.error('Admin gallery delete error:', delErr);
          return res.status(500).send('Suraty pozup bolmady');
        }
        res.redirect('/gadymymiras/admin/gallery');
      });
    }
  });
});

app.get('/gadymymiras/login', (req, res) => {
  if (req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras');
  }
  res.render('admin/login');
});

// Admin login POST – admin tablisasyna barlag
app.post('/gadymymiras/login', loginRateLimiter, verifyCsrf, (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  if (!username || !password) {
    return res.render('admin/login', { error: 'Ulanyjy ady we parol gerek.' });
  }
  // admin tablisasynda: login we parol sütunlary (parol hash görnüşinde saklanýar)
  db.query('SELECT * FROM admin WHERE login = ?', [username], (err, results) => {
    if (err) {
      console.error('Admin login error:', err);
      return res.render('admin/login', { error: 'Serwer ýalňyşlygy. Täzeden synanyşyň.' });
    }
    const admin = results[0];
    if (admin && verifyPassword(password, admin.parol)) {
      clearLoginFailures(req);
      req.session.adminLoggedIn = true;
      req.session.adminUser = admin.username || admin.login;
      return res.redirect('/gadymymiras');
    }
    registerLoginFailure(req);
    res.render('admin/login', { error: 'Ulanyjy ady ýa-da parol nädogry.' });
  });
});

// Admin logout
app.get('/gadymymiras/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/gadymymiras/login');
  });
});

// /admin – howpsuzlyk üçin 404 (açylmaýar)
app.get('/admin', (req, res) => {
  res.status(404).send('Not Found');
});

// Запуск сервера (DB taýýar bolandan soň)
Promise.resolve(db.ready)
  .then(() => {
    app.listen(port, () => {
      console.log(`Сервер запущен на http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('DB init/migration failed:', err);
    process.exit(1);
  });

// Admin tours – list and add
app.get('/gadymymiras/admin/tours', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  db.query('SELECT * FROM tours ORDER BY id DESC', (err, toursResults) => {
    if (err) {
      console.error('Admin tours query error:', err);
      return res.status(500).send('Turlar maglumatlaryny okap bolmady');
    }
    db.query('SELECT * FROM day', (err2, dayResults) => {
      if (err2) {
        console.error('Admin day query error:', err2);
        return res.status(500).send('Günler maglumatlaryny okap bolmady');
      }
      res.render('admin/tours', {
        tours: toursResults,
        days: dayResults,
        error: null,
        adminTitle: 'Turlar',
        adminSubtitle: 'Saýtdaky turlary we programmalaryny dolandyrmak.'
      });
    });
  });
});

// Admin tours – create
app.post('/gadymymiras/admin/tours', tourUpload.single('tour_picture_file'), verifyCsrf, webpUploads('tour_picture_file'), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const title = (req.body.tour_title || '').trim();
  const region = (req.body.tour_region || '').trim();
  let picture = (req.body.tour_picture || '').trim();
  const popularity = (req.body.tour_popularity || '').trim();
  const dayCount = parseInt(req.body.day || '0', 10) || 0;
  const text = (req.body.tour_text || '').trim();
  const tourGroupLabel = (req.body.tour_group_label || '').trim();

  // Eger faýldan surat goýlan bolsa – ony ulanylýar
  if (req.file && req.file.filename) {
    const relPath = path.join('image', 'tour', req.file.filename).replace(/\\/g, '/');
    picture = '/' + relPath;
  }

  if (!title) {
    return res.redirect('/gadymymiras/admin/tours');
  }

  db.query('INSERT INTO tours (tour_title, tour_region, tour_picture, tour_popularity, day, tour_text, tour_group_label) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, region, picture, popularity, dayCount, text, tourGroupLabel || null], (err, result) => {
      if (err) {
        console.error('Admin tours insert error:', err);
        return res.status(500).send('Tur goşulanda ýalňyşlyk boldy');
      }
      const newTourId = result.insertId;
      // handle day inputs (arrays of titles/texts)
      const titles = req.body['day_title[]'] || req.body.day_title || [];
      const texts = req.body['day_text[]'] || req.body.day_text || [];

      // Normalize to arrays
      const arrTitles = Array.isArray(titles) ? titles : (titles ? [titles] : []);
      const arrTexts = Array.isArray(texts) ? texts : (texts ? [texts] : []);

      // Insert days if any
      const inserts = [];
      for (let i = 0; i < arrTitles.length; i++) {
        const t = (arrTitles[i] || '').trim();
        const tx = (arrTexts[i] || '').trim();
        if (t || tx) {
          inserts.push([newTourId, t, tx]);
        }
      }
      if (inserts.length) {
        db.query('INSERT INTO day (tour_id, day_title, text) VALUES ?', [inserts], (dErr) => {
          if (dErr) {
            console.error('Day insert error:', dErr);
          }
          return res.redirect('/gadymymiras/admin/tours');
        });
      } else {
        return res.redirect('/gadymymiras/admin/tours');
      }
    });
});

// Admin tours – edit form
app.get('/gadymymiras/admin/tours/:id/edit', (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  db.query('SELECT * FROM tours WHERE id = ?', [id], (err, tourRows) => {
    if (err) {
      console.error('Admin tours select error:', err);
      return res.status(500).send('Tur tapylmady');
    }
    if (!tourRows || !tourRows.length) {
      return res.redirect('/gadymymiras/admin/tours');
    }
    db.query('SELECT * FROM day WHERE tour_id = ? ORDER BY id ASC', [id], (dErr, dayRows) => {
      if (dErr) {
        console.error('Admin day select error:', dErr);
        return res.status(500).send('Günler tapylmady');
      }
      res.render('admin/tours_edit', {
        tour: tourRows[0],
        days: dayRows,
        error: null,
        adminTitle: 'Turlar — Üýtget',
        adminSubtitle: 'Tur maglumatlaryny we günlerini üýtgetmek.'
      });
    });
  });
});

// Admin tours – update
app.post('/gadymymiras/admin/tours/:id/update', tourUpload.single('tour_picture_file'), verifyCsrf, webpUploads('tour_picture_file'), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  const title = (req.body.tour_title || '').trim();
  const region = (req.body.tour_region || '').trim();
  let picture = (req.body.tour_picture || '').trim();
  const popularity = (req.body.tour_popularity || '').trim();
  const dayCount = parseInt(req.body.day || '0', 10) || 0;
  const text = (req.body.tour_text || '').trim();
  const tourGroupLabel = (req.body.tour_group_label || '').trim();

  // Eger täze faýl goýlan bolsa – öňküsiniň ýerine şony ýazýarys
  if (req.file && req.file.filename) {
    const relPath = path.join('image', 'tour', req.file.filename).replace(/\\/g, '/');
    picture = '/' + relPath;
  }

  if (!title) {
    return res.redirect('/gadymymiras/admin/tours');
  }

  db.query('UPDATE tours SET tour_title = ?, tour_region = ?, tour_picture = ?, tour_popularity = ?, day = ?, tour_text = ?, tour_group_label = ? WHERE id = ?',
    [title, region, picture, popularity, dayCount, text, tourGroupLabel || null, id], (err) => {
      if (err) {
        console.error('Admin tours update error:', err);
        return res.status(500).send('Tur üýtgedilende ýalňyşlyk boldy');
      }
      // Replace days: delete existing, then insert new ones from arrays
      db.query('DELETE FROM day WHERE tour_id = ?', [id], (delErr) => {
        if (delErr) {
          console.error('Delete days error:', delErr);
        }
        const titles = req.body['day_title[]'] || req.body.day_title || [];
        const texts = req.body['day_text[]'] || req.body.day_text || [];
        const arrTitles = Array.isArray(titles) ? titles : (titles ? [titles] : []);
        const arrTexts = Array.isArray(texts) ? texts : (texts ? [texts] : []);
        const inserts = [];
        for (let i = 0; i < arrTitles.length; i++) {
          const t = (arrTitles[i] || '').trim();
          const tx = (arrTexts[i] || '').trim();
          if (t || tx) {
            inserts.push([id, t, tx]);
          }
        }
        if (inserts.length) {
          db.query('INSERT INTO day (tour_id, day_title, text) VALUES ?', [inserts], (iErr) => {
            if (iErr) {
              console.error('Day insert after update error:', iErr);
            }
            return res.redirect('/gadymymiras/admin/tours');
          });
        } else {
          return res.redirect('/gadymymiras/admin/tours');
        }
      });
    });
});

// Admin tours – delete
app.post('/gadymymiras/admin/tours/:id/delete', verifyCsrf, (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const id = req.params.id;
  db.query('DELETE FROM day WHERE tour_id = ?', [id], (dErr) => {
    if (dErr) {
      console.error('Delete days before tour delete error:', dErr);
    }
    db.query('DELETE FROM tours WHERE id = ?', [id], (err) => {
      if (err) {
        console.error('Admin tours delete error:', err);
        return res.status(500).send('Tury pozup bolmady');
      }
      res.redirect('/gadymymiras/admin/tours');
    });
  });
});

// Tapylmadyk ýollar üçin 404
app.use((req, res) => {
  res.status(404).send('Sahypa tapylmady');
});

// Umumy ýalňyşlyk barlaýjy (multer faýl çäk ýalňyşlyklary we beýleki garaşylmadyk ýalňyşlyklar)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  const wantsJson = !!(req.xhr || ((req.headers.accept || '').includes('application/json')));

  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Faýl ölçegi rugsat edilenden uly.'
      : 'Faýl ýüklemede ýalňyşlyk boldy.';
    if (wantsJson) return res.status(400).json({ ok: false, error: msg });
    return res.status(400).send(msg);
  }

  // Ýüklenen faýl surat hökmünde okalmady (WebP-e öwrülmedi)
  if (err.code === 'IMAGE_CONVERT_FAILED') {
    if (wantsJson) return res.status(400).json({ ok: false, error: err.message });
    return res.status(400).send(err.message);
  }

  if (wantsJson) return res.status(500).json({ ok: false, error: 'Serwerde garaşylmadyk ýalňyşlyk ýüze çykdy.' });
  res.status(500).send('Serwerde garaşylmadyk ýalňyşlyk ýüze çykdy.');
});