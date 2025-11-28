const db = require('./config/db.js');

db.query('SELECT * FROM Students', (err, results) => {
    if (err) throw err;
    console.log(results);
});