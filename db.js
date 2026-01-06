const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("cricket.db", (err) => {
    if (err) {
        console.log("Database error:", err);
    } else {
        console.log("Connected to database");
    }
});

// Create tables
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            password TEXT,
            balance REAL DEFAULT 10000
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            match TEXT,
            team TEXT,
            stake REAL,
            odds REAL,
            profit REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

module.exports = db;