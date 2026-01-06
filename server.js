const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch");
const db = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ====================== ADMIN: CREATE USER ======================
app.post("/register", (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
        return res.json({ success: false, message: "User ID and password required" });
    }

    const hashed = bcrypt.hashSync(password, 8);

    const query = `INSERT INTO users (user_id, password) VALUES (?, ?)`;
    db.run(query, [userId, hashed], function (err) {
        if (err) {
            return res.json({ success: false, message: "User ID already exists" });
        }
        res.json({ success: true, message: "User created successfully" });
    });
});

// ====================== LOGIN ======================
app.post("/login", (req, res) => {
    const { userId, password } = req.body;

    db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            return res.json({ success: false, message: "Invalid password" });
        }

        res.json({
            success: true,
            user: {
                userId: user.user_id,
                balance: user.balance
            }
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

// ====================== ADMIN: CREDIT / DEBIT ======================
app.post("/admin/balance", (req, res) => {
    const { userId, amount, type } = req.body;

    db.get(`SELECT balance FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (!user) return res.json({ success: false, message: "User not found" });

        let newBalance = user.balance;

        if (type === "credit") {
            newBalance += amount;
        } else if (type === "debit") {
            if (amount > user.balance) {
                return res.json({ success: false, message: "Insufficient balance" });
            }
            newBalance -= amount;
        }

        db.run(`UPDATE users SET balance = ? WHERE user_id = ?`, [newBalance, userId], (err) => {
            if (err) return res.json({ success: false, message: "Update failed" });
            res.json({ success: true, newBalance });
        });
    });
});

// ====================== LIVE MATCHES ======================
app.get("/live-matches", async (req, res) => {
    try {
        const apiKey = "24a858bf-39db-420d-b4c3-a3962cb2686a"; // your CricAPI key
        const url = `https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`;

        console.log("Fetching matches:", url);

        const response = await fetch(url);
        const data = await response.json();

        if (!data || !data.data || data.data.length === 0) {
            return res.json({
                success: false,
                message: "No matches returned by API",
                raw: data
            });
        }

        res.json({
            success: true,
            count: data.data.length,
            matches: data.data
        });

    } catch (error) {
        console.error("Fetch Error:", error);
        res.json({
            success: false,
            message: "Failed to fetch matches",
            error: error.toString()
        });
    }
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

    db.all(`SELECT * FROM bets WHERE user_id = ?`, [userId], (err, rows) => {
        res.json({ success: true, history: rows });
    });
});

// ====================== LIVE ODDS ======================
// Generates odds based on live matches (ready for auto-refresh)
app.get("/odds", async (req, res) => {
    try {
        const apiKey = "24a858bf-39db-420d-b4c3-a3962cb2686a";
        const url = `https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`;

        console.log("Fetching matches for odds:", url);

        const response = await fetch(url);
        const data = await response.json();

        if (!data || !data.data || data.data.length === 0) {
            return res.json({ success: false, message: "No live matches available" });
        }

        const markets = data.data.map(m => {
            if (!m.teams || m.teams.length < 2) return null;

            const team1 = m.teams[0];
            const team2 = m.teams[1];

            // Demo odds (replace later with real odds API)
            const odds1Back = (Math.random() * (2.5 - 1.5) + 1.5).toFixed(2);
            const odds1Lay  = (parseFloat(odds1Back) + 0.05).toFixed(2);
            const odds2Back = (Math.random() * (2.5 - 1.5) + 1.5).toFixed(2);
            const odds2Lay  = (parseFloat(odds2Back) + 0.05).toFixed(2);

            return {
                matchId: m.id || m.name,
                name: m.name || "Cricket Match",
                teams: [team1, team2],
                odds: {
                    [team1]: { back: odds1Back, lay: odds1Lay },
                    [team2]: { back: odds2Back, lay: odds2Lay }
                }
            };
        }).filter(m => m !== null);

        res.json({ success: true, markets });

    } catch (error) {
        console.error("Odds API Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch odds",
            error: error.toString()
        });
    }
});

// ====================== START SERVER ======================
app.listen(3000, "0.0.0.0", () => {
    console.log("Server running on all devices at port 3000");
});