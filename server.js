const fetch = require("node-fetch");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
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
// ====================== LIVE + UPCOMING MATCHES ======================
app.get("/live-matches", async (req, res) => {
    try {
        const apiKey = "24a858bf-39db-420d-b4c3-a3962cb2686a"; // <-- Put your real key

        const url = `https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`;
        console.log("Fetching:", url);

        const response = await fetch(url);
        const data = await response.json();

        console.log("API Response:", data);

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
const fetch = require("node-fetch");

// ===== LIVE ODDS (DEMO VERSION) =====
// This returns real match data but generates dynamic odds.
// Later we can connect a paid odds API here.

app.get("/odds", async (req, res) => {
    try {
        // Use your existing live matches API
        const response = await fetch("https://portal-backend-4.onrender.com/live-matches");
        const data = await response.json();

        let matches = [];
        if (data.matches && Array.isArray(data.matches)) matches = data.matches;
        else if (data.data && Array.isArray(data.data)) matches = data.data;

        if (!matches || matches.length === 0) {
            return res.json({ success: false, message: "No live matches" });
        }

        // Convert matches → markets with odds
        const markets = matches.map(m => {
            const team1 = m.teams[0];
            const team2 = m.teams[1];

            // Generate dynamic odds (until real API is connected)
            const odds1Back = (Math.random() * (2.5 - 1.5) + 1.5).toFixed(2);
            const odds1Lay = (parseFloat(odds1Back) + 0.05).toFixed(2);
            const odds2Back = (Math.random() * (2.5 - 1.5) + 1.5).toFixed(2);
            const odds2Lay = (parseFloat(odds2Back) + 0.05).toFixed(2);

            return {
                matchId: m.id || m.name,
                name: m.name || "Cricket Match",
                teams: [team1, team2],
                odds: {
                    [team1]: { back: odds1Back, lay: odds1Lay },
                    [team2]: { back: odds2Back, lay: odds2Lay }
                }
            };
        });

        res.json({ success: true, markets });

    } catch (err) {
        console.error("Odds API Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch odds" });
    }
});
const fetch = require("node-fetch");

// ================== ODDS API ==================
// This creates betting odds based on live matches.
// (Later we can connect a paid odds provider here)

app.get("/odds", async (req, res) => {
    try {
        // Fetch your existing live matches
        const response = await fetch("https://portal-backend-4.onrender.com/live-matches");
        const data = await response.json();

        let matches = [];
        if (data.matches && Array.isArray(data.matches)) matches = data.matches;
        else if (data.data && Array.isArray(data.data)) matches = data.data;

        if (!matches || matches.length === 0) {
            return res.json({ success: false, message: "No live matches" });
        }

        // Convert matches → betting markets with odds
        const markets = matches.map(m => {
            const team1 = m.teams[0];
            const team2 = m.teams[1];

            // Generate demo odds (for now)
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
        });

        res.json({ success: true, markets });

    } catch (err) {
        console.error("Odds API Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch odds" });
    }
});

// ====================== START SERVER ======================
app.listen(3000, "0.0.0.0", () => {
    console.log("Server running on all devices at port 3000");
});