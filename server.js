const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// ROOT
app.get("/", (req, res) => {
    res.send("Sportbex Betting API is running");
});

// SPORTBEX TEST ROUTE
app.get("/sportbex-test", (req, res) => {
    res.json({
        success: true,
        message: "sportbex-test route is working"
    });
});

// START
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
