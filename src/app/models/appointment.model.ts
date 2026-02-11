import mongoose from "mongoose";



const appointmentSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String, required: true },
  service: { type: String,  required: true },
  staff: { type: String, default: null }, 
  date: { type: Date, required: true, default: () => new Date() },
  startTime: { type: Date, required: true },
  endTime: { type: Date }, // We'll calculate this automatically based on service duration
  status: { 
    type: String, 
    enum: ['Scheduled', 'Completed', 'Cancelled', 'No-Show', 'Waiting'], 
    default: 'Waiting' // Default to Waiting, becomes Scheduled when staff is assigned
  },
  queuePosition: { type: Number , default: 0 } // For waiting queue ordering
}, { timestamps: true });


// const waitingQueueSchema = new mongoose.Schema({

export const Appointment = mongoose.model("Appointment", appointmentSchema);