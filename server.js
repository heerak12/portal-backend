const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// ===================== ODDS API CONFIG =====================
const ODDS_API_KEY = "c34f34e6dfd97cae8a254aa037d959ba"; // <-- PUT YOUR REAL KEY HERE
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

// ====================== ROOT ======================
app.get("/", (req, res) => {
    res.send("Odds API Betting Server is running");
});

// ====================== GET ALL SPORTS ======================
app.get("/sports", async (req, res) => {
    try {
        const url = `${ODDS_API_BASE}/sports?apiKey=${ODDS_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        res.json({
            success: true,
            sports: data
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch sports",
            error: err.toString()
        });
    }
});

// ====================== GET ODDS ======================
// Example:
// /odds?sport=soccer_epl
// /odds?sport=cricket_ipl&live=true

app.get("/odds", async (req, res) => {
    try {
        const { sport, live } = req.query;

        if (!sport) {
            return res.json({
                success: false,
                message: "Please provide ?sport="
            });
        }

        let url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk&markets=h2h,spreads,totals&oddsFormat=decimal`;

        if (live === "true") {
            url += "&eventType=live";
        }

        console.log("Fetching:", url);

        const response = await fetch(url);
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            return res.json({
                success: false,
                message: "No matches available",
                raw: data
            });
        }

        // Convert Odds API format → Clean betting format
        const markets = data.map(match => {
            const home = match.home_team;
            const away = match.away_team;

            let odds = {};

            match.bookmakers.forEach(bookmaker => {
                bookmaker.markets.forEach(market => {
                    if (market.key === "h2h") {
                        market.outcomes.forEach(o => {
                            odds[o.name] = o.price;
                        });
                    }
                });
            });

            return {
                matchId: match.id,
                match: `${home} vs ${away}`,
                sport: match.sport_title,
                startTime: match.commence_time,
                teams: [home, away],
                odds: odds
            };
        });

        res.json({
            success: true,
            count: markets.length,
            markets
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Odds API failed",
            error: err.toString()
        });
    }
});

// ====================== START SERVER ======================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});