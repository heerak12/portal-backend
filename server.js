const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch");
const db = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ====================== REGISTER ======================
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
        if (!user) return res.json({ success: false, message: "User not found" });

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) return res.json({ success: false, message: "Invalid password" });

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

// ====================== LIVE MATCHES ======================
app.get("/live-matches", async (req, res) => {
    try {
        const apiKey = "24a858bf-39db-420d-b4c3-a3962cb2686a";
        const url = `https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`;

        const response = await fetch(url);
        const data = await response.json();

        if (!data || !data.data || data.data.length === 0) {
            return res.json({ success: false, message: "No matches found" });
        }

        res.json({ success: true, matches: data.data });

    } catch (err) {
        console.error("Live matches error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch matches" });
    }
});

// ====================== ODDS API ======================
app.get("/odds", async (req, res) => {
    try {
        const apiKey = "24a858bf-39db-420d-b4c3-a3962cb2686a";
        const url = `https://api.cricapi.com/v1/matches?apikey=${apiKey}&offset=0`;

        console.log("Fetching odds from:", url);

        const response = await fetch(url);
        const data = await response.json();

        if (!data || !data.data || data.data.length === 0) {
            return res.json({ success: false, message: "No matches available for odds" });
        }

        const markets = data.data.map(m => {
            if (!m.teams || m.teams.length < 2) return null;

            const team1 = m.teams[0];
            const team2 = m.teams[1];

            const odds1Back = (Math.random() * (2.5 - 1.5) + 1.5).toFixed(2);
            const odds1Lay = (parseFloat(odds1Back) + 0.05).toFixed(2);
            const odds2Back = (Math.random() * (2.5 - 1.5) + 1.5).toFixed(2);
            const odds2Lay = (parseFloat(odds2Back) + 0.05).toFixed(2);

            return {
                name: m.name || "Cricket Match",
                teams: [team1, team2],
                odds: {
                    [team1]: { back: odds1Back, lay: odds1Lay },
                    [team2]: { back: odds2Back, lay: odds2Lay }
                }
            };
        }).filter(Boolean);

        res.json({ success: true, markets });

    } catch (err) {
        console.error("Odds error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch odds" });
    }
});

// ====================== START SERVER ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port", PORT);
});