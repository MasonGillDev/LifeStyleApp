// server.js
const express = require("express");
const mysql = require("mysql2");
require("dotenv").config();

const app = express();
app.use(express.json()); // parse JSON bodies automatically

console.log("Environment variables loaded:", {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
  PORT: process.env.PORT,
});

// 1. Create a connection pool (recommended over single connection)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// 2. Test the DB connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL database!");
  connection.release(); // release the connection back to the pool
});

function toMySQLDateTime(dateObj) {
  const year = dateObj.getFullYear();
  // Note: getMonth() is zero-based
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const hours = String(dateObj.getHours()).padStart(2, "0");
  const minutes = String(dateObj.getMinutes()).padStart(2, "0");
  const seconds = String(dateObj.getSeconds()).padStart(2, "0");
  // Format: YYYY-MM-DD HH:MM:SS
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// --------------------------------------------------------
// 3. Routes
// --------------------------------------------------------

// POST /tasks
// Body example:
// {
//   "type": "homework",
//   "startTime": "2025-03-21T10:00:00Z",
//   "endTime": "2025-03-21T10:30:00Z",
//   "duration": 1800
// }
app.post("/tasks", (req, res) => {
  const { type, startTime, endTime, duration } = req.body;
  if (!type || !startTime || !endTime || duration == null) {
    return res.status(400).json({ error: "Missing fields in request body." });
  }

  // 1) Convert the incoming startTime/endTime strings into Date objects.
  const startDateObj = new Date(startTime);
  const endDateObj = new Date(endTime);

  // Check for invalid date
  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return res.status(400).json({ error: "Invalid date format." });
  }

  // 2) Format them for MySQL
  const startMySQL = toMySQLDateTime(startDateObj);
  const endMySQL = toMySQLDateTime(endDateObj);

  const sql = `
      INSERT INTO tasks (type, start_time, end_time, duration)
      VALUES (?, ?, ?, ?)
    `;
  const values = [type, startMySQL, endMySQL, duration];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting task:", err);
      return res.status(500).json({ error: "Database error." });
    }
    console.log("task post hit");
    return res
      .status(201)
      .json({ message: "Task created.", taskId: result.insertId });
  });
});

// POST /water-intake
// Body example:
// {
//   "date": "2025-03-21",
//   "count": 5
// }
app.post("/water-intake", (req, res) => {
  const { date, count } = req.body;

  if (!date || count == null) {
    return res.status(400).json({ error: "Missing date or count." });
  }

  // We'll try to insert a new row. If date already exists, we update it.
  const sql = `
    INSERT INTO water_intake (date, count)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE count = ?
  `;
  // The 'ON DUPLICATE KEY UPDATE' clause updates the row if `date` is already in the table (thanks to UNIQUE constraint).
  const values = [date, count, count];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error inserting/updating water intake:", err);
      return res.status(500).json({ error: "Database error." });
    }
    console.log("water-intake psot hit...");
    return res
      .status(200)
      .json({ message: "Water intake updated/inserted successfully." });
  });
});

// (Optional) GET /tasks => to verify data is saved
app.get("/tasks", (req, res) => {
  console.log("Getting logs...");
  db.query("SELECT * FROM tasks ORDER BY id DESC", (err, rows) => {
    if (err) {
      console.error("Error fetching tasks:", err);
      return res.status(500).json({ error: "Database error." });
    }
    res.json(rows);
  });
});

// GET /water-intake/:date
// e.g., GET /water-intake/2025-03-21
app.get("/water-intake/:date", (req, res) => {
  const { date } = req.params; // Expected format: "YYYY-MM-DD"
  const sql =
    "SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, count FROM water_intake WHERE date = ?";

  db.query(sql, [date], (err, rows) => {
    if (err) {
      console.error("Error fetching water intake:", err);
      return res.status(500).json({ error: "Database error." });
    }

    if (rows.length > 0) {
      return res.json(rows[0]); // Returns { id: 1, date: "2025-03-21", count: 1 }
      console.log("water-intake get hit...");
    } else {
      return res.json({
        id: null,
        date: date,
        count: 0,
      });
    }
  });
});

// (Optional) GET /water-intake => to verify water data
app.get("/water-intake", (req, res) => {
  db.query("SELECT * FROM water_intake ORDER BY id DESC", (err, rows) => {
    if (err) {
      console.error("Error fetching water intake:", err);
      return res.status(500).json({ error: "Database error." });
    }
    res.json(rows);
  });
});

// --------------------------------------------------------
// 4. Start the Server
// --------------------------------------------------------
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
