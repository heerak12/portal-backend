// ====================== IMPORTS ======================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch");
const db = require("./db"); // Your sqlite db connection

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ====================== CONFIG ======================
const PORT = process.env.PORT || 3000;

// Sportbex API
const SPORTBEX_BASE = "https://trial-api.sportbex.com/api";
const SPORTBEX_KEY = "j5nwX8kEl6qES0lZFCW8t9YKFSxGWCkX32AhXR0j"; // 🔒 KEEP SECRET

const sportbexHeaders = {
    "sportbex-api-key": SPORTBEX_KEY,
    "Content-Type": "application/json"
};

// ====================== REGISTER USER ======================
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

        db.run(
            `UPDATE users SET balance = ? WHERE user_id = ?`,
            [newBalance, userId],
            (err) => {
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

// ====================== SPORTBEX ODDS (CRICKET + FOOTBALL) ======================
app.get("/odds", async (req, res) => {
    try {
        const markets = [];

        // Sport IDs from Sportbex
        const sports = [
            { id: 4, name: "Cricket" },
            { id: 1, name: "Football" }
        ];

        for (const sport of sports) {

            // 1️⃣ Get competitions
            const compRes = await fetch(
                `${SPORTBEX_BASE}/odds/${sport.id}/get-competitions`,
                { headers: sportbexHeaders }
            );
            const competitions = await compRes.json();

            if (!Array.isArray(competitions) || competitions.length === 0) continue;

            for (const comp of competitions.slice(0, 3)) {

                // 2️⃣ Get events
                const eventRes = await fetch(
                    `${SPORTBEX_BASE}/odds/${sport.id}/get-events?competitionId=${comp.id}`,
                    { headers: sportbexHeaders }
                );
                const events = await eventRes.json();

                if (!Array.isArray(events) || events.length === 0) continue;

                for (const ev of events.slice(0, 3)) {

                    // 3️⃣ Get market IDs
                    const marketIdRes = await fetch(
                        `${SPORTBEX_BASE}/odds/${sport.id}/market-ids?eventId=${ev.id}`,
                        { headers: sportbexHeaders }
                    );
                    const marketIds = await marketIdRes.json();

                    if (!Array.isArray(marketIds) || marketIds.length === 0) continue;

                    // 4️⃣ Get odds
                    const oddsRes = await fetch(
                        `${SPORTBEX_BASE}/odds/${sport.id}/get-event-odds`,
                        {
                            method: "POST",
                            headers: sportbexHeaders,
                            body: JSON.stringify({
                                marketIds: [marketIds[0]]
                            })
                        }
                    );

                    const oddsData = await oddsRes.json();
                    if (!oddsData || !oddsData.runners || oddsData.runners.length < 2) continue;

                    const team1 = oddsData.runners[0].name;
                    const team2 = oddsData.runners[1].name;

                    markets.push({
                        sport: sport.name,
                        match: ev.name,
                        teams: [team1, team2],
                        odds: {
                            [team1]: { back: oddsData.runners[0].backPrice },
                            [team2]: { back: oddsData.runners[1].backPrice }
                        }
                    });
                }
            }
        }

        if (markets.length === 0) {
            return res.json({
                success: false,
                message: "No data returned from Sportbex API"
            });
        }

        res.json({ success: true, markets });

    } catch (err) {
        console.error("Sportb

// ====================== ROOT ======================
app.get("/", (req, res) => {
    res.send("Sportbex Betting API is running");
});

// ====================== START SERVER ======================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});