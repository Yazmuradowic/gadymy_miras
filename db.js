const myEnw={};
const path = require('path');
require('dotenv').config({ processEnv: myEnw, path: path.resolve(__dirname, '.env'), override: true  });
const mysql = require('mysql');
const connection = mysql.createConnection({
  host: myEnw.DB_HOST,
  user: myEnw.DB_USER,
  password: myEnw.DB_PASSWORD,
  database: myEnw.DB_NAME
});

// Export a "ready" promise so the server can wait
// until the DB connection + lightweight migration is done.
connection.ready = new Promise((resolve, reject) => {
  connection.connect((err) => {
    if (err) {
      console.error('Ошибка подключения к базе данных: ' + err.stack);
      return reject(err);
    }
    console.log('Подключено к базе данных с ID ' + connection.threadId);

    connection.query(
      'ALTER TABLE tours ADD COLUMN tour_group_label VARCHAR(255) DEFAULT NULL',
      (alterErr) => {
        if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') {
          console.error('tours.tour_group_label migration:', alterErr.message);
          return reject(alterErr);
        }
        return resolve();
      }
    );
  });
});

module.exports = connection;