const myEnw={};
const path = require('path');
require('dotenv').config({ processEnv: myEnw, path: path.resolve(__dirname, '.env'), override: true  });
const mysql = require('mysql2');
const { hashPassword, isHashed } = require('./password');
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

        // parol sütünini uzaltmak (öňki varchar(25) hash üçin gysga)
        connection.query(
          'ALTER TABLE admin MODIFY COLUMN parol VARCHAR(255) NOT NULL',
          (widenErr) => {
            if (widenErr) {
              console.error('admin.parol widen migration:', widenErr.message);
              return reject(widenErr);
            }

            // açyk tekst parollary hash edip goýmak (yzygiderli howpsuzlyk üçin)
            connection.query('SELECT id, parol FROM admin', (selErr, rows) => {
              if (selErr) {
                console.error('admin password migration select:', selErr.message);
                return reject(selErr);
              }

              const plaintextRows = (rows || []).filter((row) => !isHashed(row.parol));
              if (!plaintextRows.length) {
                return resolve();
              }

              let remaining = plaintextRows.length;
              let migrationFailed = false;
              plaintextRows.forEach((row) => {
                const hashed = hashPassword(row.parol);
                connection.query(
                  'UPDATE admin SET parol = ? WHERE id = ?',
                  [hashed, row.id],
                  (updErr) => {
                    if (updErr && !migrationFailed) {
                      migrationFailed = true;
                      console.error('admin password migration update:', updErr.message);
                      return reject(updErr);
                    }
                    remaining -= 1;
                    if (remaining === 0 && !migrationFailed) {
                      console.log(`Admin parollary hash edildi (${plaintextRows.length}).`);
                      resolve();
                    }
                  }
                );
              });
            });
          }
        );
      }
    );
  });
});

module.exports = connection;