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

// 🔐 Sportbex API Config
const SPORTBEX_BASE = "https://trial-api.sportbex.com";

// ⚠️ IMPORTANT: Replace with your NEW regenerated key
const SPORTBEX_KEY = "j5nwX8kEl6qES0lZFCW8t9YKFSxGWCkX32AhXR0j";

const sportbexHeaders = {
    "sportbex-api-key": SPORTBEX_KEY,
    "Content-Type": "application/json"
};

// ====================== ROOT ======================
app.get("/", (req, res) => {
    res.send("Sportbex Betting API is running");
});

// ====================== SPORTBEX TEST ======================
// This confirms if your API key is valid or not
app.get("/sportbex-test", async (req, res) => {
    try {
        const testUrl = `${SPORTBEX_BASE}/api/betfair/competition/8`;

        const response = await fetch(testUrl, {
            headers: sportbexHeaders
        });

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

// ====================== BALANCE ======================
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
// ====================== SPORTBEX ODDS (CRICKET) =====================
// ===================================================================
app.get("/odds", async (req, res) => {
    try {
        const sportId = 8; // Cricket

        // 1️⃣ GET COMPETITIONS
        const compRes = await fetch(
            `${SPORTBEX_BASE}/api/betfair/competition/${sportId}`,
            { headers: sportbexHeaders }
        );

        const competitions = await compRes.json();

        if (!Array.isArray(competitions) || competitions.length === 0) {
            return res.json({
                success: false,
                message: "No competitions returned",
                response: competitions
            });
        }

        const markets = [];

        // 2️⃣ LOOP COMPETITIONS
        for (const comp of competitions.slice(0, 3)) {

            // GET EVENTS
            const eventRes = await fetch(
                `${SPORTBEX_BASE}/api/betfair/event/${sportId}/${comp.id}`,
                { headers: sportbexHeaders }
            );

            const events = await eventRes.json();
            if (!Array.isArray(events) || events.length === 0) continue;

            for (const ev of events.slice(0, 3)) {

                // 3️⃣ GET MARKET IDS
                const marketIdRes = await fetch(
                    `${SPORTBEX_BASE}/api/betfair/marketIds/${sportId}/${ev.id}`,
                    { headers: sportbexHeaders }
                );

                const marketIds = await marketIdRes.json();
                if (!Array.isArray(marketIds) || marketIds.length === 0) continue;

                // 4️⃣ GET ODDS
                const oddsRes = await fetch(
                    `${SPORTBEX_BASE}/api/betfair/listMarketBook/${sportId}`,
                    {
                        method: "POST",
                        headers: sportbexHeaders,
                        body: JSON.stringify({ marketIds: [marketIds[0]] })
                    }
                );

                const oddsData = await oddsRes.json();
                if (!Array.isArray(oddsData) || oddsData.length === 0) continue;

                const runners = oddsData[0].runners;
                if (!runners || runners.length < 2) continue;

                const team1 = runners[0].runnerName;
                const team2 = runners[1].runnerName;

                markets.push({
                    sport: "Cricket",
                    match: ev.eventName,
                    teams: [team1, team2],
                    odds: {
                        [team1]: {
                            back: runners[0].ex.availableToBack?.[0]?.price || null,
                            lay: runners[0].ex.availableToLay?.[0]?.price || null
                        },
                        [team2]: {
                            back: runners[1].ex.availableToBack?.[0]?.price || null,
                            lay: runners[1].ex.availableToLay?.[0]?.price || null
                        }
                    }
                });
            }
        }

        if (markets.length === 0) {
            return res.json({
                success: false,
                message: "No markets returned from Sportbex"
            });
        }

        res.json({ success: true, markets });

    } catch (err) {
        console.error("SPORTBEX ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Sportbex API failed",
            error: err.toString()
        });
    }
});

// ====================== START ======================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});