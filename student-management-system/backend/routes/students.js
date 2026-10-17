const express = require("express");
const mongoose = require("mongoose");
const Student = require("../models/Student");

const router = express.Router();

const ALLOWED_FIELDS = ["studentId", "name", "email", "department", "year", "phone"];

// keep only known fields from the request body (prevents mass-assignment)
function pick(body) {
  const data = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

// turn Mongoose / Mongo errors into clean HTTP responses
function handleError(err, res) {
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(", "), errors: messages });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: "A student with this Student ID already exists" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid ID" });
  }
  console.error(err);
  return res.status(500).json({ message: "Server error" });
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/students?search=term  -> all students (optionally filtered)
router.get("/", async (req, res) => {
  try {
    const filter = {};
    const search = (req.query.search || "").trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: rx }, { studentId: rx }, { email: rx }, { department: rx }];
    }
    const students = await Student.find(filter).sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/students/:id -> one student (by Mongo _id)
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/students -> create
router.post("/", async (req, res) => {
  try {
    const student = await Student.create(pick(req.body));
    res.status(201).json(student);
  } catch (err) {
    handleError(err, res);
  }
});

// PUT /api/students/:id -> update
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const student = await Student.findByIdAndUpdate(req.params.id, pick(req.body), {
      new: true,
      runValidators: true,
    });
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /api/students/:id -> delete
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json({ message: "Student deleted successfully", id: student._id });
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = router;
