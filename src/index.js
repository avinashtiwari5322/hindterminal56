const express = require("express");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const multer = require('multer'); 
const cors = require("cors");
const permitAdditionalDataRoutes = require("./interfaces/adminRoutes");

// Import database connection
const { poolPromise } = require("./config/db");

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3000", "https://hindfrontend.vercel.app"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Test database connection route
app.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    res.json({
      message: "✅ API is running and DB is connected",
      database: "Connected successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "❌ Database connection failed",
      error: error.message,
    });
  }
});

// Test database query route
app.get("/test-db", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT 1 as test");
    res.json({
      message: "✅ Database query successful",
      result: result.recordset,
    });
  } catch (error) {
    res.status(500).json({
      message: "❌ Database query failed",
      error: error.message,
    });
  }
});

const permitRoutes = require("./interfaces/routes");

app.use("/api", permitRoutes);

app.use(express.json());
app.use("/api/permit-additional-data", permitAdditionalDataRoutes);

const PORT = process.env.PORT || 3000;

// Start server only after database connection is established
poolPromise
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ Database connected and ready`);
    });
  })
  .catch((err) => {
    console.error(
      "❌ Failed to start server due to database connection error:",
      err
    );
    process.exit(1);
  });
