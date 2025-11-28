const express = require('express');
const cors = require('cors');
const db = require('./config/db.js'); 

const app = express();

app.use(cors()); 
app.use(express.json()); 

app.use((req, res, next) => {
    const userRole = req.headers['x-role']; 
    const userId = req.headers['x-user-id']; 

    req.user = { role: userRole, id: userId };
    next();
});

const adminRoutes = require('./routes/adminRoutes.js');
const studentRoutes = require('./routes/studentRoutes.js');

app.use('/api/admin', adminRoutes);

app.use('/api/student', studentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});