const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ====================== SPORTBEX CONFIG ======================
const SPORTBEX_BASE = "https://trial-api.sportbex.com";
const SPORTBEX_KEY = "j5nwX8kEl6qES0lZFCW8t9YKFSxGWCkX32AhXR0j"; // PUT YOUR REAL KEY HERE

const sportbexHeaders = {
    "sportbex-api-key": SPORTBEX_KEY,
    "Content-Type": "application/json"
};

// ====================== ROOT ======================
app.get("/", (req, res) => {
    res.send("Sportbex Betting API is running");
});

// ====================== TEST ROUTE ======================
app.get("/sportbex-test", (req, res) => {
    res.json({ success: true, message: "sportbex-test route is working" });
});

// ===================================================================
// ====================== GENERIC PROXY (DISCOVERY TOOL) ==============
// ===================================================================
// Usage: /sportbex-proxy?path=api/betfair/markets/4/1

app.get("/sportbex-proxy", async (req, res) => {
    try {
        const { path } = req.query;

        if (!path) {
            return res.json({
                success: false,
                message: "Please provide ?path=..."
            });
        }

        const url = `${SPORTBEX_BASE}/${path}`;
        console.log("Proxy Fetch:", url);

        const response = await fetch(url, { headers: sportbexHeaders });
        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return res.json({
                success: false,
                message: "Invalid JSON response",
                raw: text
            });
        }

        res.json({
            success: true,
            url,
            data
        });

    } catch (err) {
        res.json({
            success: false,
            message: "Sportbex proxy failed",
            error: err.toString()
        });
    }
});

// ===================================================================
// ====================== ODDS ENDPOINT ===============================
// ===================================================================
// Example: /odds?sportId=4&competitionId=1

app.get("/odds", async (req, res) => {
    try {
        const sportId = req.query.sportId;
        const competitionId = req.query.competitionId;

        if (!sportId || !competitionId) {
            return res.json({
                success: false,
                message: "Please provide sportId and competitionId"
            });
        }

        const url = `${SPORTBEX_BASE}/api/betfair/markets/${sportId}/${competitionId}`;
        console.log("Fetching:", url);

        const response = await fetch(url, { headers: sportbexHeaders });
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
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