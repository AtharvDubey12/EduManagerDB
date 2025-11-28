const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/login', (req, res) => {
    const { student_id, password } = req.body;

    if (!student_id || !password) {
        return res.status(400).json({ error: "Please enter both ID and Password" });
    }

    
    const sql = 'SELECT * FROM students WHERE student_id = ? AND password = ?';
    
    db.query(sql, [student_id, password], (err, results) => {
        if (err) {
            console.error("Login Error:", err);
            return res.status(500).json({ error: "Database error" });
        }
        
        if (results.length > 0) {
            
            res.json({ success: true, message: "Login successful", studentId: student_id });
        } else {
            
            res.status(401).json({ error: "Invalid Student ID or Password" });
        }
    });
});


router.get('/:id/dashboard', (req, res) => {
    const requestedId = req.params.id;
    
   
    if (req.user.role === 'student' && req.user.id !== requestedId) {
        return res.status(403).json({ error: 'Unauthorized. You can only view your own profile.' });
    }

    
    const studentQuery = 'SELECT * FROM students WHERE student_id = ?';
    
    const academicQuery = `
        SELECT s.subject_name, s.standard_fee, ar.marks, ar.grade 
        FROM student_subjects ss
        JOIN subjects s ON ss.subject_id = s.subject_id
        LEFT JOIN academic_records ar ON (ss.student_id = ar.student_id AND ss.subject_id = ar.subject_id)
        WHERE ss.student_id = ?
    `;

    const paymentQuery = `
        SELECT s.subject_name, fp.amount, fp.payment_date 
        FROM fee_payments fp
        JOIN subjects s ON fp.subject_id = s.subject_id
        WHERE fp.student_id = ?
    `;

    const concessionQuery = `
        SELECT cm.reason, cm.discount_percent 
        FROM student_concessions sc
        JOIN concession_master cm ON sc.concession_type_id = cm.concession_type_id
        WHERE sc.student_id = ?
    `;

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
                        profile: {
                            ...studentResult[0],
                            active_concessions: concessionReasons.join(', ') 
                        },
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

module.exports = router;