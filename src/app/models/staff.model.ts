import mongoose from "mongoose";


const staffSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  serviceType: { type: String, required: true }, // e.g., "Doctor"
  dailyCapacity: { type: Number, default: 5 },
  status: { type: String, enum: ['Available', 'On Leave'], default: 'Available' }
});

export const Staff = mongoose.model("Staff", staffSchema);