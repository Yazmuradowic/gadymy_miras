const db=require('./db');
const myEnw={};
const path = require('path');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config({ processEnv: myEnw, path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const nodemailer = require('nodemailer');
const app = express();
const port = myEnw.PORT || 3000;

// Настройка EJS как шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware для парсинга тела запросов
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session
app.use(session({
  secret: myEnw.SESSION_SECRET || 'gadymy_miras_secret_key_2026',
  resave: false,
  saveUninitialized: false
}));

// Статические файлы (CSS, JS, изображения)
app.use(express.static(path.join(__dirname, 'public')));

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

// Public gallery – suratlar bazadan (id, gallery_url)
app.get('/gallery', (req, res) => {
  db.query('SELECT id, gallery_url FROM gallery ORDER BY id DESC', (err, galleryResults) => {
    if (err) {
      console.error('Gallery query error:', err);
      return res.status(500).send('Galereýa üçin maglumat okalmady');
    }
    res.render('gallery', { photos: galleryResults });
  });
});
// Public videos – wideolar bazadan
app.get('/videos', (req, res) => {
  db.query('SELECT id, title, video_url, poster_url FROM videos ORDER BY id DESC', (err, videoResults) => {
    if (err) {
      console.error('Videos query error:', err);
      return res.status(500).send('Wideolar üçin maglumat okalmady');
    }
    res.render('videos', { videos: videoResults });
  });
});

app.get('/tours', (req, res) => {
  db.query('SELECT * FROM tours', (err, toursResults) => {
    if (err) {
      console.error('Ошибка при выполнении запроса tours: ' + err.stack);
      res.status(500).send('Ошибка сервера');
      return;
    }
    res.render('tours', { tours: toursResults });
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




app.post('/contact', (req, res) => {
  // console.log('Contact request body:', req.body);
  const ady = req.body.name;
  const pocta = req.body.email;
  const message = req.body.message;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'gadymy.miras.travel@gmail.com',
      pass: process.env.GMAIL_PASS || 'ppczzjpndbgxzdwt'
    }
  });

  const mailOptions = {
    from: 'gadymy.miras.travel@gmail.com',  // ← Gmail akkauntyny özüne
    to: process.env.CONTACT_TO || 'travel@gadymymiras.com',
    subject: ady || 'New contact message',
    replyTo: pocta,  // ← Ulanyjynyň e-maili bu sazy
    text: `From: ${pocta}\nName: ${ady}\nMessage: ${message}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Mail send error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }
    return res.json({ ok: true });
  });
});

// /gadymymiras – giriş edilmedik: login; giriş edilen: admin panel
app.get('/gadymymiras', (req, res) => {
  if (req.session.adminLoggedIn) {
    return res.render('admin/index');
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
]), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }

  const title = (req.body.title || '').trim();

  const posterFile = req.files && req.files.poster_file && req.files.poster_file[0];
  const videoFile = req.files && req.files.video_file && req.files.video_file[0];

  if (!title || !posterFile || !videoFile) {
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
        return res.status(500).send('Wideo goşulanda ýalňyşlyk boldy');
      }
      res.redirect('/gadymymiras/admin/videos');
    }
  );
});

// Admin wideolar – üýtgetmek (diňe faýldan wideo/poster, tekstden diňe ady)
app.post('/gadymymiras/admin/videos/:id/update', videoUpload.fields([
  { name: 'poster_file', maxCount: 1 },
  { name: 'video_file', maxCount: 1 }
]), (req, res) => {
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
app.post('/gadymymiras/admin/videos/:id/delete', (req, res) => {
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
app.post('/gadymymiras/admin/gallery', galleryUpload.single('image_file'), (req, res) => {
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
app.post('/gadymymiras/admin/gallery/:id/update', galleryUpload.single('image_file'), (req, res) => {
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
app.post('/gadymymiras/admin/gallery/:id/delete', (req, res) => {
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
app.post('/gadymymiras/login', (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  if (!username || !password) {
    return res.render('admin/login', { error: 'Ulanyjy ady we parol gerek.' });
  }
  // admin tablisasynda: login we parol sütunlary
  db.query('SELECT * FROM admin WHERE login = ? AND parol = ?', [username, password], (err, results) => {
    if (err) {
      console.error('Admin login error:', err);
      return res.render('admin/login', { error: 'Serwer ýalňyşlygy. Täzeden synanyşyň.' });
    }
    if (results.length > 0) {
      req.session.adminLoggedIn = true;
      req.session.adminUser = results[0].username || results[0].login;
      return res.redirect('/gadymymiras');
    }
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

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
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
app.post('/gadymymiras/admin/tours', tourUpload.single('tour_picture_file'), (req, res) => {
  if (!req.session.adminLoggedIn) {
    return res.redirect('/gadymymiras/login');
  }
  const title = (req.body.tour_title || '').trim();
  const region = (req.body.tour_region || '').trim();
  let picture = (req.body.tour_picture || '').trim();
  const popularity = (req.body.tour_popularity || '').trim();
  const dayCount = parseInt(req.body.day || '0', 10) || 0;
  const text = (req.body.tour_text || '').trim();

  // Eger faýldan surat goýlan bolsa – ony ulanylýar
  if (req.file && req.file.filename) {
    const relPath = path.join('image', 'tour', req.file.filename).replace(/\\/g, '/');
    picture = '/' + relPath;
  }

  if (!title) {
    return res.redirect('/gadymymiras/admin/tours');
  }

  db.query('INSERT INTO tours (tour_title, tour_region, tour_picture, tour_popularity, day, tour_text) VALUES (?, ?, ?, ?, ?, ?)',
    [title, region, picture, popularity, dayCount, text], (err, result) => {
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
app.post('/gadymymiras/admin/tours/:id/update', tourUpload.single('tour_picture_file'), (req, res) => {
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

  // Eger täze faýl goýlan bolsa – öňküsiniň ýerine şony ýazýarys
  if (req.file && req.file.filename) {
    const relPath = path.join('image', 'tour', req.file.filename).replace(/\\/g, '/');
    picture = '/' + relPath;
  }

  if (!title) {
    return res.redirect('/gadymymiras/admin/tours');
  }

  db.query('UPDATE tours SET tour_title = ?, tour_region = ?, tour_picture = ?, tour_popularity = ?, day = ?, tour_text = ? WHERE id = ?',
    [title, region, picture, popularity, dayCount, text, id], (err) => {
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
app.post('/gadymymiras/admin/tours/:id/delete', (req, res) => {
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