const express = require('express');
const router = express.Router();
const db = require('../config/db');

const ensureAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
    next();
};

router.use(ensureAdmin);

router.post('/add-student', (req, res) => {
    const { name, category, password } = req.body;
    const finalPassword = password || '123';
    const sql = 'INSERT INTO students (name, category, password) VALUES (?, ?, ?)';
    
    db.query(sql, [name, category, finalPassword], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Student added with password!', studentId: result.insertId });
    });
});

router.post('/enroll', (req, res) => {
    const { student_id, subject_id } = req.body;
    if (!student_id || !subject_id) return res.status(400).json({ error: "Missing IDs" });

    const sql = 'INSERT INTO student_subjects (student_id, subject_id, enrollment_date) VALUES (?, ?, NOW())';
    db.query(sql, [student_id, subject_id], (err, result) => {
        if (err) {
            if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: "Invalid Student or Subject ID." });
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Already enrolled." });
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Student enrolled successfully!' });
    });
});

router.post('/update-marks', (req, res) => {
    const { student_id, subject_id, marks, grade } = req.body;
    const checkSql = 'SELECT * FROM academic_records WHERE student_id = ? AND subject_id = ?';
    
    db.query(checkSql, [student_id, subject_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) {
            const updateSql = 'UPDATE academic_records SET marks = ?, grade = ? WHERE student_id = ? AND subject_id = ?';
            db.query(updateSql, [marks, grade, student_id, subject_id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Marks updated.' });
            });
        } else {
            const insertSql = 'INSERT INTO academic_records (student_id, subject_id, marks, grade) VALUES (?, ?, ?, ?)';
            db.query(insertSql, [student_id, subject_id, marks, grade], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Marks added.' });
            });
        }
    });
});

router.post('/pay-fee', (req, res) => {
    const { student_id, subject_id, amount } = req.body;
    const sql = 'INSERT INTO fee_payments (student_id, subject_id, amount) VALUES (?, ?, ?)';
    db.query(sql, [student_id, subject_id, amount], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Payment recorded successfully.' });
    });
});

router.post('/add-concession', (req, res) => {
    const { reason, discount_percent } = req.body;
    if (!reason || discount_percent === undefined) {
        return res.status(400).json({ error: "Reason and Discount Percent are required." });
    }

    const sql = 'INSERT INTO concession_master (reason, discount_percent) VALUES (?, ?)';
    db.query(sql, [reason, discount_percent], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'New concession type created successfully!', concessionId: result.insertId });
    });
});

router.post('/assign-concession', (req, res) => {
    const { student_id, concession_type_id } = req.body;
    if (!student_id || !concession_type_id) {
        return res.status(400).json({ error: "Student ID and Concession Type ID are required." });
    }

    const sql = 'INSERT INTO student_concessions (student_id, concession_type_id) VALUES (?, ?)';
    db.query(sql, [student_id, concession_type_id], (err, result) => {
        if (err) {
            if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: "Invalid Student ID or Concession ID." });
            if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "This student already has this concession." });
            return res.status(500).json({ error: "Database error: " + err.message });
        }
        res.json({ message: 'Concession granted successfully!' });
    });
});

router.get('/student/:id', (req, res) => {
    const requestedId = req.params.id;
    
    const studentQuery = 'SELECT * FROM students WHERE student_id = ?';
    const academicQuery = `SELECT s.subject_name, s.standard_fee, ar.marks, ar.grade FROM student_subjects ss JOIN Subjects s ON ss.subject_id = s.subject_id LEFT JOIN academic_records ar ON (ss.student_id = ar.student_id AND ss.subject_id = ar.subject_id) WHERE ss.student_id = ?`;
    const paymentQuery = `SELECT s.subject_name, fp.amount, fp.payment_date FROM fee_payments fp JOIN subjects s ON fp.subject_id = s.subject_id WHERE fp.student_id = ?`;
    const concessionQuery = `SELECT cm.reason, cm.discount_percent FROM student_concessions sc JOIN concession_master cm ON sc.concession_type_id = cm.concession_type_id WHERE sc.student_id = ?`;

    db.query(studentQuery, [requestedId], (err, studentResult) => {
        if (err) return res.status(500).send(err);
        if (studentResult.length === 0) return res.status(404).json({ error: 'Student not found' });

        db.query(academicQuery, [requestedId], (err, academicResult) => {
            if (err) return res.status(500).send(err);
            db.query(paymentQuery, [requestedId], (err, paymentResult) => {
                if (err) return res.status(500).send(err);
                db.query(concessionQuery, [requestedId], (err, concessionResult) => {
                    if (err) return res.status(500).send(err);

                    let rawTotalDue = 0;
                    academicResult.forEach(sub => rawTotalDue += Number(sub.standard_fee));

                    let totalDiscountPercent = 0;
                    let concessionReasons = [];
                    concessionResult.forEach(c => {
                        totalDiscountPercent += Number(c.discount_percent);
                        concessionReasons.push(`${c.reason} (${c.discount_percent}%)`);
                    });
                    if (totalDiscountPercent > 100) totalDiscountPercent = 100;

                    const discountAmount = (rawTotalDue * totalDiscountPercent) / 100;
                    const finalTotalDue = rawTotalDue - discountAmount;
                    
                    let totalPaid = 0;
                    paymentResult.forEach(pay => totalPaid += Number(pay.amount));

                    res.json({
                        profile: { ...studentResult[0], active_concessions: concessionReasons.join(', ') },
                        academics: academicResult,
                        payments: paymentResult,
                        financial_summary: {
                            raw_total: rawTotalDue,
                            discount_amount: discountAmount,
                            total_due: finalTotalDue,
                            total_paid: totalPaid,
                            balance: finalTotalDue - totalPaid
                        }
                    });
                });
            });
        });
    });
});

router.post('/add-subject', (req, res) => {
    const { subject_name, standard_fee } = req.body;
    
    if (!subject_name || !standard_fee) {
        return res.status(400).json({ error: "Subject Name and Fee are required" });
    }

    const sql = 'INSERT INTO subjects (subject_name, standard_fee) VALUES (?, ?)';
    db.query(sql, [subject_name, standard_fee], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Subject created successfully!', subjectId: result.insertId });
    });
});

router.get('/subject/:id/students', (req, res) => {
    const subjectId = req.params.id;

    
    const subjectSql = 'SELECT subject_name FROM subjects WHERE subject_id = ?';
  
    const studentSql = `
        SELECT s.student_id, s.name, s.category, ss.enrollment_date 
        FROM student_subjects ss
        JOIN students s ON ss.student_id = s.student_id
        WHERE ss.subject_id = ?
    `;

    db.query(subjectSql, [subjectId], (err, subResult) => {
        if (err) return res.status(500).json({ error: err.message });
        if (subResult.length === 0) return res.status(404).json({ error: "Subject not found" });

        db.query(studentSql, [subjectId], (err, students) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                subject: subResult[0],
                students: students
            });
        });
    });
});

module.exports = router;