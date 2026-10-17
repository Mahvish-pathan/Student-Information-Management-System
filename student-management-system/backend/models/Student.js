const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: [true, "Student ID is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    department: {
      type: String,
      required: [true, "Department is required"],
      trim: true,
    },
    year: {
      type: Number,
      required: [true, "Year is required"],
      min: [1, "Year must be between 1 and 6"],
      max: [6, "Year must be between 1 and 6"],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-\s]{7,15}$/, "Please enter a valid phone number"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);
