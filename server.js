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
const SPORTBEX_BASE = "https://trial-api.sportbex.com/api";
const SPORTBEX_KEY = "YOUR_SPORTBEX_API_KEY"; // 🔒 DO NOT expose in frontend

const sportbexHeaders = {
    "sportbex-api-key": SPORTBEX_KEY,
    "Content-Type": "application/json"
};

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
// ====================== SPORTBEX ODDS (DEBUG MODE) ==================
// ===================================================================
app.get("/odds", async (req, res) => {
    try {
        const sportId = 4; // Cricket (we will expand later)

        // 1️⃣ GET COMPETITIONS
        const compRes = await fetch(
            `${SPORTBEX_BASE}/odds/${sportId}/get-competitions`,
            { headers: sportbexHeaders }
        );

        const compText = await compRes.text();
        console.log("RAW COMPETITIONS RESPONSE:", compText);

        let compJson;
        try {
            compJson = JSON.parse(compText);
        } catch (e) {
            return res.json({
                success: false,
                message: "Sportbex returned non-JSON",
                raw: compText
            });
        }

        // Handle different response formats
        let competitions = [];
        if (Array.isArray(compJson)) competitions = compJson;
        else if (compJson.data && Array.isArray(compJson.data)) competitions = compJson.data;
        else if (compJson.result && Array.isArray(compJson.result)) competitions = compJson.result;
        else {
            return res.json({
                success: false,
                message: "Invalid competitions response",
                response: compJson
            });
        }

        if (competitions.length === 0) {
            return res.json({
                success: false,
                message: "No competitions available",
                response: compJson
            });
        }

        const markets = [];

        // 2️⃣ LOOP COMPETITIONS
        for (const comp of competitions.slice(0, 2)) {

            // GET EVENTS
            const eventRes = await fetch(
                `${SPORTBEX_BASE}/odds/${sportId}/get-events?competitionId=${comp.id}`,
                { headers: sportbexHeaders }
            );

            const eventText = await eventRes.text();
            console.log("RAW EVENTS RESPONSE:", eventText);

            let eventJson;
            try {
                eventJson = JSON.parse(eventText);
            } catch (e) {
                continue;
            }

            let events = [];
            if (Array.isArray(eventJson)) events = eventJson;
            else if (eventJson.data && Array.isArray(eventJson.data)) events = eventJson.data;
            else if (eventJson.result && Array.isArray(eventJson.result)) events = eventJson.result;
            else continue;

            for (const ev of events.slice(0, 2)) {

                // 3️⃣ GET MARKET IDS
                const marketIdRes = await fetch(
                    `${SPORTBEX_BASE}/odds/${sportId}/market-ids?eventId=${ev.id}`,
                    { headers: sportbexHeaders }
                );

                const marketText = await marketIdRes.text();
                console.log("RAW MARKET IDS RESPONSE:", marketText);

                let marketJson;
                try {
                    marketJson = JSON.parse(marketText);
                } catch (e) {
                    continue;
                }

                let marketIds = [];
                if (Array.isArray(marketJson)) marketIds = marketJson;
                else if (marketJson.data && Array.isArray(marketJson.data)) marketIds = marketJson.data;
                else if (marketJson.result && Array.isArray(marketJson.result)) marketIds = marketJson.result;
                else continue;

                if (marketIds.length === 0) continue;

                // 4️⃣ GET ODDS
                const oddsRes = await fetch(
                    `${SPORTBEX_BASE}/odds/${sportId}/get-event-odds`,
                    {
                        method: "POST",
                        headers: sportbexHeaders,
                        body: JSON.stringify({ marketIds: [marketIds[0]] })
                    }
                );

                const oddsText = await oddsRes.text();
                console.log("RAW ODDS RESPONSE:", oddsText);

                let oddsJson;
                try {
                    oddsJson = JSON.parse(oddsText);
                } catch (e) {
                    continue;
                }

                const runners = oddsJson.runners || oddsJson.data?.runners || oddsJson.result?.runners;
                if (!runners || runners.length < 2) continue;

                const team1 = runners[0].name;
                const team2 = runners[1].name;

                markets.push({
                    sport: "Cricket",
                    match: ev.name,
                    teams: [team1, team2],
                    odds: {
                        [team1]: { back: runners[0].backPrice },
                        [team2]: { back: runners[1].backPrice }
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

// ====================== ROOT ======================
app.get("/", (req, res) => {
    res.send("Sportbex Betting API is running");
});

// ====================== START ======================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});