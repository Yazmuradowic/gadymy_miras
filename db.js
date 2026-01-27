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
connection.connect((err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных: ' + err.stack);
    return;
  }
    console.log('Подключено к базе данных с ID ' + connection.threadId);    
});
module.exports = connection;