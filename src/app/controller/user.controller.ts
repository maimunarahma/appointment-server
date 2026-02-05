import { User } from "../models/user.model";
import { generateToken } from "../utils/jwt";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";

const registerUser = async (req: Request, res: Response) => {
  try {
    console.log("hi");
    const {  email, password } = req.body;
    console.log(email, password)
    if ( !email || !password ) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const isUserExist = await User.findOne({ email });
    if (isUserExist) {
      return res.status(409).json({ message: "User already exists" });
    }

    const newUser = await User.create({
      email,
      password: hashedPassword
    });
    await newUser.save();
    
    const JwtPayload = {
      userId: newUser._id,
      email: newUser.email
    };
    
    const accessToken = generateToken(JwtPayload, process.env.JWT_SECRET || "secret", "1d");
    const refreshToken = generateToken(JwtPayload, process.env.JWT_REFRESH_SECRET || "secretrefresh", "30d");

    // Set refresh token cookie for cross-origin requests
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser._id,
        email: newUser.email,
        accessToken,
     refreshToken
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Internal server error", error });
  }
};


export const userController = { registerUser }