const db=require('./db');
const myEnw={};
const path = require('path');
require('dotenv').config({ processEnv: myEnw, path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = myEnw.PORT || 3000;

// Настройка EJS как шаблонизатора
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware для парсинга тела запросов
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Статические файлы (CSS, JS, изображения)
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/gallery', (req, res) => {
  res.render('gallery');
});
app.get('/videos', (req, res) => {
  res.render('videos');
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
  db.query('SELECT * FROM tours WHERE id = ?', [tourId], (err, tourResults) => {
    if (err) {
      console.error('Ошибка при выполнении запроса tours: ' + err.stack);
      res.status(500).send('Ошибка сервера');
      return;
    }
    if (tourResults.length === 0) {
      res.status(404).send('Тур не найден');
      return;
    }
    res.render('tour', { tur: tourResults[0] });
  });
});

app.get('/admin', (req, res) => {
  res.render('admin/index');
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});