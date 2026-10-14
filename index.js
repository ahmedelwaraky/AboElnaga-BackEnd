const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─────────────────────────────────────────────
// DB connection (pool + promises = no callback hell)
// ─────────────────────────────────────────────
const db = mysql.createPool({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "abo-elnaga-clinics",
  waitForConnections: true,
  connectionLimit: 10,
})

// MariaDB (XAMPP) returns JSON columns as strings, MySQL returns objects → handle both
const parseJSON = (val, fallback = []) => {
  if (val == null) return fallback;
  if (typeof val !== "string") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

// DB row → same shape your React frontend uses
const formatDoctor = (row) => ({
  id: row.id,
  nameAr: row.name_ar,
  nameEn: row.name_en,
  roleAr: row.role_ar,
  specialtyAr: row.specialty_ar,
  img: row.img,
  bio: row.bio,
  schedule: parseJSON(row.schedule, null),
  stats: parseJSON(row.stats),
  achievements: parseJSON(row.achievements),
  specializations: parseJSON(row.specializations),
  cases: parseJSON(row.cases),
  avgRating: row.avg_rating !== undefined && row.avg_rating !== null ? Number(row.avg_rating) : null,
  reviewsCount: row.reviews_count !== undefined ? Number(row.reviews_count) : 0,
  createdAt: row.created_at,
});

// Wrap async routes so errors go to the error handler instead of crashing
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ═════════════════════════════════════════════
// 1) DOCTORS
// ═════════════════════════════════════════════

// Add doctor
app.post(
  "/doctors",
  wrap(async (req, res) => {
    const {
      nameAr,
      nameEn,
      roleAr,
      specialtyAr,
      img,
      bio,
      schedule = null,
      stats = [],
      achievements = [],
      specializations = [],
      cases = [],
    } = req.body;

    if (!nameAr || !nameEn) {
      return res.status(400).json({ message: "nameAr and nameEn are required" });
    }

    const [result] = await db.execute(
      `INSERT INTO doctors
        (name_ar, name_en, role_ar, specialty_ar, img, bio, schedule, stats, achievements, specializations, cases)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nameAr,
        nameEn,
        roleAr ?? null,
        specialtyAr ?? null,
        img ?? null,
        bio ?? null,
        JSON.stringify(schedule),
        JSON.stringify(stats),
        JSON.stringify(achievements),
        JSON.stringify(specializations),
        JSON.stringify(cases),
      ]
    );

    res.status(201).json({ message: "Doctor added successfully", id: result.insertId });
  })
);

// Get all doctors (with live avg rating + reviews count)
app.get(
  "/doctors",
  wrap(async (req, res) => {
    const [rows] = await db.execute(`
      SELECT d.*,
             ROUND(AVG(r.rating), 1) AS avg_rating,
             COUNT(r.id)             AS reviews_count
      FROM doctors d
      LEFT JOIN reviews r ON r.doctor_id = d.id
      GROUP BY d.id
      ORDER BY d.id
    `);
    res.json(rows.map(formatDoctor));
  })
);

// Doctors list for the <select> in the review form (lightweight)
app.get(
  "/doctors/options",
  wrap(async (req, res) => {
    const [rows] = await db.execute(
      "SELECT id, name_ar AS nameAr, name_en AS nameEn FROM doctors ORDER BY id"
    );
    res.json(rows);
  })
);

// Get one doctor
app.get(
  "/doctors/:id",
  wrap(async (req, res) => {
    const [rows] = await db.execute(
      `SELECT d.*,
              ROUND(AVG(r.rating), 1) AS avg_rating,
              COUNT(r.id)             AS reviews_count
       FROM doctors d
       LEFT JOIN reviews r ON r.doctor_id = d.id
       WHERE d.id = ?
       GROUP BY d.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Doctor not found" });
    res.json(formatDoctor(rows[0]));
  })
);

// ═════════════════════════════════════════════
// 2) REVIEWS  (name, doctor select, rating, message)
// ═════════════════════════════════════════════

// Add review
app.post(
  "/reviews",
  wrap(async (req, res) => {
    const { name, doctorId, rating, message } = req.body;
    const rate = Number(rating);

    if (!name || !doctorId || !message) {
      return res.status(400).json({ message: "name, doctorId and message are required" });
    }
    if (!Number.isInteger(rate) || rate < 1 || rate > 5) {
      return res.status(400).json({ message: "rating must be an integer from 1 to 5" });
    }

    const [doc] = await db.execute("SELECT id FROM doctors WHERE id = ?", [doctorId]);
    if (!doc.length) return res.status(404).json({ message: "Doctor not found" });

    const [result] = await db.execute(
      "INSERT INTO reviews (name, doctor_id, rating, message) VALUES (?, ?, ?, ?)",
      [name.trim(), doctorId, rate, message.trim()]
    );

    res.status(201).json({ message: "Review added successfully", id: result.insertId });
  })
);

// Get reviews  →  /reviews  or  /reviews?doctorId=2
app.get(
  "/reviews",
  wrap(async (req, res) => {
    const { doctorId } = req.query;
    let sql = `
      SELECT r.id, r.name, r.rating, r.message, r.created_at AS createdAt,
             d.id AS doctorId, d.name_ar AS doctorNameAr, d.name_en AS doctorNameEn
      FROM reviews r
      JOIN doctors d ON d.id = r.doctor_id`;
    const params = [];
    if (doctorId) {
      sql += " WHERE r.doctor_id = ?";
      params.push(doctorId);
    }
    sql += " ORDER BY r.created_at DESC";

    const [rows] = await db.execute(sql, params);
    res.json(rows);
  })
);

// ═════════════════════════════════════════════
// USERS (your existing routes — now SQL-injection safe)
// ═════════════════════════════════════════════

app.get(
  "/users",
  wrap(async (req, res) => {
    const [rows] = await db.execute("SELECT * FROM users");
    res.json(rows);
  })
);

app.post(
  "/addUser",
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    await db.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [
      name,
      email,
      password,
    ]);
    res.json({ message: "User added successfully" });
  })
);

app.put(
  "/updateUser",
  wrap(async (req, res) => {
    const { name, email, id } = req.body;
    const [result] = await db.execute("UPDATE users SET name = ?, email = ? WHERE id = ?", [
      name,
      email,
      id,
    ]);
    if (!result.affectedRows) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User updated successfully" });
  })
);

app.delete(
  "/deleteUser",
  wrap(async (req, res) => {
    const { id } = req.body;
    const [result] = await db.execute("DELETE FROM users WHERE id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
  })
);

app.get("/about", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// ─────────────────────────────────────────────
// Error handler
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error", error: err.message });
});

app.listen(3000, () => {
  console.log("server is running on port 3000");
});