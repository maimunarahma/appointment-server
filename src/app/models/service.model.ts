import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  duration: { type: Number, enum: [15, 30, 60], required: true }, // in minutes
});

export const Service = mongoose.model("Service", serviceSchema);