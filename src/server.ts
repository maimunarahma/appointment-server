import 'dotenv/config';
import { Server } from "http";
import mongoose from "mongoose";
import app from "./app";
import { connectDB } from './app/lib/db';



let server: Server;

const startServer = async () => {
  try {
    const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!MONGO_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    await connectDB(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const PORT = process.env.PORT || 5000;
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    // process.exit(1);
  }
};

  startServer();
