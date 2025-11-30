const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Session Setup
app.use(session({
    secret: 'secret_key_cents_seconds', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'bmtuwf8ydirjgxews10z-mysql.services.clever-cloud.com',
    user: process.env.DB_USER || 'uv7ujvbeujoxysyh',
    password: process.env.DB_PASSWORD || 'GaIghpizmUCIZ6BIv3bk',
    database: process.env.DB_NAME || 'bmtuwf8ydirjgxews10z',
    port: 3306 // Standard MySQL port
});

db.connect((err) => {
    if (err) console.error('Error connecting to MySQL:', err);
    else console.log('Connected to MySQL database.');
});

// Keep-Alive Script
setInterval(() => {
    db.query('SELECT 1', (err) => {
        if (err) console.error('Keep-alive query failed', err);
    });
}, 5000); 

// --- AUTHENTICATION ---
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 8);
    db.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
        if (err) return res.status(500).json({ error: "Username taken" });
        res.json({ message: "Success" });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM users WHERE username = ?", [username], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "User not found" });
        
        const user = results[0];
        if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: "Invalid password" });

        req.session.userId = user.id; // Keep this for web
        
        // SEND USER ID TO PHONE
        res.json({ 
            message: "Login successful", 
            userId: user.id, // <--- NEW!
            username: user.username,
            isPro: !!user.is_pro 
        });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: "Logged out" });
});

app.get('/api/user', (req, res) => {
    res.json({ loggedIn: !!req.session.userId });
});

// --- MIDDLEWARE ---
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) next();
    else res.status(401).json({ error: "Unauthorized" });
};

// --- PRO UPGRADE (SIMULATION) ---
app.post('/api/upgrade', (req, res) => {
    // 1. Try to update the database (Best effort)
    if (req.session && req.session.userId) {
        db.query("UPDATE users SET is_pro = 1 WHERE id = ?", [req.session.userId]);
    }

    // 2. ALWAYS send success back to the phone
    // This ensures your app will unlock the Pro features no matter what
    res.json({ message: "Upgraded to Pro (Test Mode)" });
});

// --- EXPENSE ROUTES ---
app.get('/api/expenses', isAuthenticated, (req, res) => {
    db.query("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC", [req.session.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

app.post('/api/expenses', isAuthenticated, (req, res) => {
    const { description, amount, category } = req.body;
    const date = new Date().toISOString().split('T')[0];
    const userId = req.session.userId;
    db.query("INSERT INTO expenses (description, amount, category, date, user_id) VALUES (?, ?, ?, ?, ?)", 
        [description, amount, category, date, userId], 
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "success" });
    });
});

app.put('/api/expenses/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const { description, amount, category } = req.body;
    const userId = req.session.userId;
    db.query("UPDATE expenses SET description = ?, amount = ?, category = ? WHERE id = ? AND user_id = ?", 
        [description, amount, category, id, userId], 
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "updated" });
    });
});

app.delete('/api/expenses/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;
    db.query("DELETE FROM expenses WHERE id = ? AND user_id = ?", [id, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "deleted" });
    });
});

// --- SAVINGS ROUTES ---
app.get('/api/savings', isAuthenticated, (req, res) => {
    db.query("SELECT * FROM savings WHERE user_id = ?", [req.session.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

app.post('/api/savings', isAuthenticated, (req, res) => {
    const { title, target_amount, current_amount } = req.body;
    const userId = req.session.userId;
    db.query("INSERT INTO savings (title, target_amount, current_amount, user_id) VALUES (?, ?, ?, ?)", 
        [title, target_amount, current_amount || 0, userId], 
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "success" });
    });
});

app.put('/api/savings/:id', isAuthenticated, (req, res) => {
    const { title, target_amount, current_amount } = req.body;
    const { id } = req.params;
    const userId = req.session.userId;
    db.query("UPDATE savings SET title = ?, target_amount = ?, current_amount = ? WHERE id = ? AND user_id = ?", 
        [title, target_amount, current_amount, id, userId], 
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "updated" });
    });
});

app.delete('/api/savings/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;
    db.query("DELETE FROM savings WHERE id = ? AND user_id = ?", [id, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "deleted" });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



