const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ===================== ODDS API CONFIG =====================
const ODDS_API_KEY = "c34f34e6dfd97cae8a254aa037d959ba"; // <-- PUT YOUR REAL KEY
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

// ===================== TEMP USER DATABASE =====================
const users = [
  { userId: "admin", password: "1234", balance: 10000 },
  { userId: "test", password: "1234", balance: 5000 }
];

// ====================== ROOT ======================
app.get("/", (req, res) => {
  res.send("Betting Backend is running");
});

// ====================== LOGIN ======================
app.post("/login", (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res.json({
      success: false,
      message: "User ID and password required"
    });
  }

  const user = users.find(
    u => u.userId === userId && u.password === password
  );

  if (!user) {
    return res.json({
      success: false,
      message: "Invalid login credentials"
    });
  }

  res.json({
    success: true,
    message: "Login successful",
    user: {
      userId: user.userId,
      balance: user.balance
    }
  });
});

// ====================== GET BALANCE ======================
app.get("/balance/:userId", (req, res) => {
  const userId = req.params.userId;
  const user = users.find(u => u.userId === userId);

  if (!user) {
    return res.json({
      success: false,
      message: "User not found"
    });
  }

  res.json({
    success: true,
    balance: user.balance
  });
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

// ====================== GET ODDS (UPCOMING + LIVE) ======================
// Example:
// /odds?sport=soccer_epl
// /odds?sport=soccer_epl&live=true

app.get("/odds", async (req, res) => {
  try {
    const { sport, live } = req.query;

    if (!sport) {
      return res.json({
        success: false,
        message: "Please provide ?sport= parameter"
      });
    }

    let url = `${ODDS_API_BASE}/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk&markets=h2h&oddsFormat=decimal`;

    // Only add live filter if explicitly requested
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

    // ================= FORMAT FOR FRONTEND =================
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
      message: "Failed to fetch odds",
      error: err.toString()
    });
  }
});

// ====================== PLACE BET ======================
app.post("/bet", (req, res) => {
  const { userId, matchId, team, stake } = req.body;

  const user = users.find(u => u.userId === userId);
  if (!user) {
    return res.json({ success: false, message: "User not found" });
  }

  if (stake > user.balance) {
    return res.json({ success: false, message: "Insufficient balance" });
  }

  // Demo bet logic
  const win = Math.random() > 0.5;
  const profit = win ? stake : -stake;

  user.balance += profit;

  res.json({
    success: true,
    win,
    profit,
    newBalance: user.balance
  });
});
app.post("/change-password", (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;

    if (!userId || !oldPassword || !newPassword) {
        return res.json({ success: false, message: "All fields required" });
    }

    db.get(`SELECT * FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (err || !user) {
            return res.json({ success: false, message: "User not found" });
        }

        const valid = bcrypt.compareSync(oldPassword, user.password);
        if (!valid) {
            return res.json({ success: false, message: "Old password incorrect" });
        }

        const hashed = bcrypt.hashSync(newPassword, 8);
        db.run(`UPDATE users SET password = ? WHERE user_id = ?`, [hashed, userId], (err) => {
            if (err) {
                return res.json({ success: false, message: "Password update failed" });
            }
            res.json({ success: true, message: "Password updated successfully" });
        });
    });
});


// ====================== BET HISTORY ======================
app.get("/history/:userId", (req, res) => {
    const userId = req.params.userId;

    db.all(
        `SELECT match, team, stake, odds, status, profit FROM bets WHERE user_id = ? ORDER BY id DESC`,
        [userId],
        (err, rows) => {
            if (err) {
                return res.json({ success: false, message: "Failed to load history" });
            }
            res.json({ success: true, history: rows });
        }
    );
});

// ====================== START SERVER ======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});