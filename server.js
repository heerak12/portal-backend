// ====================== IMPORTS ======================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch");
const db = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ====================== CONFIG ======================
const PORT = process.env.PORT || 3000;

// 🔐 SPORTBEX CONFIG
const SPORTBEX_BASE = "https://trial-api.sportbex.com";
const SPORTBEX_KEY = "j5nwX8kEl6qES0lZFCW8t9YKFSxGWCkX32AhXR0j"; // <-- PUT YOUR REAL KEY HERE

const sportbexHeaders = {
    "sportbex-api-key": SPORTBEX_KEY,
    "Content-Type": "application/json"
};

// ====================== ROOT ======================
app.get("/", (req, res) => {
    res.send("Sportbex Betting API is running");
});

// ====================== SPORTBEX TEST ======================
app.get("/sportbex-test", async (req, res) => {
    try {
        const testUrl = `${SPORTBEX_BASE}/api/betfair/markets/4/1`;

        const response = await fetch(testUrl, { headers: sportbexHeaders });
        const text = await response.text();

        res.json({
            success: true,
            url: testUrl,
            status: response.status,
            rawResponse: text
        });

    } catch (err) {
        res.json({
            success: false,
            message: "Sportbex API test failed",
            error: err.toString()
        });
    }
});

// ====================== REGISTER ======================
app.post("/register", (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.json({ success: false, message: "User ID and password required" });
    }

    const hashed = bcrypt.hashSync(password, 8);

    db.run(
        `INSERT INTO users (user_id, password, balance) VALUES (?, ?, 0)`,
        [userId, hashed],
        function (err) {
            if (err) {
                return res.json({ success: false, message: "User ID already exists" });
            }
            res.json({ success: true, message: "User created successfully" });
        }
    );
});

// ====================== LOGIN ======================
app.post("/login", (req, res) => {
    const { userId, password } = req.body;

    db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false, message: "User not found" });

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) return res.json({ success: false, message: "Invalid password" });

        res.json({
            success: true,
            user: { userId: user.user_id, balance: user.balance }
        });
    });
});

// ====================== GET BALANCE ======================
app.get("/balance/:userId", (req, res) => {
    const userId = req.params.userId;

    db.get(`SELECT balance FROM users WHERE user_id = ?`, [userId], (err, row) => {
        if (!row) return res.json({ success: false, message: "User not found" });
        res.json({ success: true, balance: row.balance });
    });
});

// ====================== ADMIN CREDIT / DEBIT ======================
app.post("/admin/balance", (req, res) => {
    const { userId, amount, type } = req.body;

    db.get(`SELECT balance FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false, message: "User not found" });

        let newBalance = user.balance;
        if (type === "credit") newBalance += amount;
        if (type === "debit") {
            if (amount > user.balance) {
                return res.json({ success: false, message: "Insufficient balance" });
            }
            newBalance -= amount;
        }

        db.run(
            `UPDATE users SET balance = ? WHERE user_id = ?`,
            [newBalance, userId],
            err => {
                if (err) return res.json({ success: false, message: "Update failed" });
                res.json({ success: true, newBalance });
            }
        );
    });
});

// ====================== PLACE BET ======================
app.post("/bet", (req, res) => {
    const { userId, match, team, stake, odds } = req.body;

    db.get(`SELECT balance FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false, message: "User not found" });
        if (user.balance < stake) {
            return res.json({ success: false, message: "Insufficient balance" });
        }

        let win = Math.random() > 0.5;
        let profit = win ? (stake * odds) - stake : -stake;
        let newBalance = win
            ? user.balance + (stake * odds) - stake
            : user.balance - stake;

        db.run(`UPDATE users SET balance = ? WHERE user_id = ?`, [newBalance, userId]);

        db.run(
            `INSERT INTO bets (user_id, match, team, stake, odds, profit) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, match, team, stake, odds, profit]
        );

        res.json({ success: true, win, profit, newBalance });
    });
});

// ====================== BET HISTORY ======================
app.get("/history/:userId", (req, res) => {
    const userId = req.params.userId;

    db.all(`SELECT * FROM bets WHERE user_id = ? ORDER BY id DESC`, [userId], (err, rows) => {
        res.json({ success: true, history: rows });
    });
});

// ===================================================================
// ====================== SPORTBEX ODDS API ===========================
// ===================================================================

// Example usage:
// /odds?sportId=4&competitionId=1

app.get("/odds", async (req, res) => {
    try {
        const sportId = req.query.sportId || 4;
        const competitionId = req.query.competitionId || 1;

        const url = `${SPORTBEX_BASE}/api/betfair/markets/${sportId}/${competitionId}`;
        console.log("Fetching:", url);

        const response = await fetch(url, { headers: sportbexHeaders });
        const data = await response.json();

        if (!data || Object.keys(data).length === 0) {
            return res.json({
                success: false,
                message: "No data returned from Sportbex",
                response: data
            });
        }

        res.json({
            success: true,
            sportId,
            competitionId,
            markets: data
        });

    } catch (err) {
        console.error("SPORTBEX ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Sportbex API failed",
            error: err.toString()
        });
    }
});

// ====================== START SERVER ======================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});