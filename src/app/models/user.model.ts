import mongoose from "mongoose";


const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Store hashed password!
  // name: { type: String, required: true },
  // role: { type: String, enum: ["student", "instructor", "admin"], default: "student" },
}, { timestamps: true });

export const User = mongoose.model("User", userSchema);