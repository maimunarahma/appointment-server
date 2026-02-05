import express, { Router } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./app/routes";



const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  "http://localhost:8080",
].filter(Boolean) as string[];

console.log("ENV:", process.env.NODE_ENV, "ALLOWED_ORIGINS:", allowedOrigins);

// CORS must be first to handle preflight requests
app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors({
  origin: process.env.NODE_ENV === "production" ? process.env.FRONTEND_URL : "http://localhost:3000",
  credentials: true,
}));

// Middlewares (after CORS)
app.use(cookieParser());
app.use(express.json());



// Routes
app.use("/", router);

// Base route
app.get("/", (_req: express.Request, res: express.Response) => {
  res.status(200).json({ message: "Welcome to CourseMaster System" });
});

export default app;
