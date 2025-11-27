const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
// CHANGE 1: Let Render decide the port, or fallback to 3000 for local testing
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Session Setup
app.use(session({
    secret: 'secret_key_cents_seconds', // In a real real app, use process.env.SESSION_SECRET
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

// CHANGE 2: Use Environment Variables for Database
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'uts123',
    database: process.env.DB_NAME || 'cents_in_seconds_db',
    port: 3306 // Standard MySQL port
});

db.connect((err) => {
    if (err) console.error('Error connecting to MySQL:', err);
    else console.log('Connected to MySQL database.');
});

// CHANGE 3: Keep-Alive Script (Prevents "Protocol Enqueue After Fatal Error")
setInterval(() => {
    db.query('SELECT 1', (err) => {
        if (err) console.error('Keep-alive query failed', err);
    });
}, 5000); // Ping database every 5 seconds

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

        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ message: "Login successful", username: user.username });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: "Logged out" });
});

app.get('/api/user', (req, res) => {
    res.json({ loggedIn: !!req.session.userId });
});

// --- MIDDLEWARE TO PROTECT ROUTES ---
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) next();
    else res.status(401).json({ error: "Unauthorized" });
};

// --- EXPENSE ROUTES ---

// 1. GET
app.get('/api/expenses', isAuthenticated, (req, res) => {
    db.query("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC", [req.session.userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: results });
    });
});

// 2. POST (Add)
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

// 3. PUT (Update)
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

// 4. DELETE
app.delete('/api/expenses/:id', isAuthenticated, (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;
    db.query("DELETE FROM expenses WHERE id = ? AND user_id = ?", [id, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "deleted" });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});