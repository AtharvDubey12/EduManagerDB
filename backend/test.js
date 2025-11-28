const db = require('./config/db.js');

db.query('SELECT * FROM students', (err, results) => {
    if (err) throw err;
    console.log(results);
});