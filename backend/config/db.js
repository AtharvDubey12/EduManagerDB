const mysql = require('mysql2');
require('dotenv').config();


const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234', 
    database: process.env.DB_NAME || 'school_fees_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err.message);
        return;
    }
    console.log('Connected to MySQL database successfully!');
});

module.exports = db;