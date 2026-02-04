import { Request, Response } from "express";
import { User } from "../models/user.model";
import { generateToken, verifyToken } from "../utils/jwt";
import bcrypt from "bcryptjs";



interface LoginPayload {
  userId: string;
  email: string;
  role: string;
}

const credentialLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create JWT payload
    const payload = {
      userId: user._id,
      email: user.email
    };

    const accessToken = generateToken(payload, process.env.JWT_SECRET || "secret", "1d");
    const refreshToken = generateToken(payload, process.env.JWT_REFRESH_SECRET || "secretrefresh", "30d");

    // Cookie configuration that works in both dev and production
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" as const : "lax" as const,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    };

    res.cookie("refreshToken", refreshToken, cookieOptions);

    return res.status(200).json({
      message: "Login successful",
      user: {
        email: user.email,
        accessToken,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};
const getUser= async(req: Request, res: Response) => {
   try {
      const token = req?.cookies?.refreshToken;
         if (!token) {
           return res.status(401).json({ message: "Unauthorized, no token provided" });
         }
     
         const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
         const userId = (decoded as any).userId;
         const user = await User.findById(userId);
         
         if (!user) {
           return res.status(404).json({ message: "User not found" });
         }
         return res.status(200).json({
            email: user.email,
          });

     
    
   } catch (error) {
    
      console.log(error);
      return res.status(500).json({ message: "Internal server error", error });
   }
  }

const logout = async (req: Request, res: Response) => {
  try {
    // Match the same cookie configuration as login
    const isProduction = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" as const : "lax" as const,
      path: "/",
    };

    res.clearCookie("refreshToken", cookieOptions);

    return res.status(200).json({ 
      message: "Logged out successfully", 
      success: true 
    });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const authController = { credentialLogin, getUser, logout };