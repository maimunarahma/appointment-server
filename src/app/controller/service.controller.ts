import { Service } from "../models/service.model"
import { Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { User } from "../models/user.model";

const createService = async( req: Request, res: Response)=>{
      try {
           const token= req?.cookies?.refreshToken;
                if(!token){
                    return res.status(401).json({ message: "Unauthorized, no token provided" });
                }
                const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
                const userId = (decoded as any).userId;
                const user = await User.findById(userId);
                if (!user) {
                    return res.status(404).json({ message: "User not found , can not create staff" });
                }

            const { name , duration } = req.body
            const service = await Service.create({
                adminId: user._id,
                    name,
                    duration
                })
            return res.status(201).json({ message: "Service created successfully", service });

        
      } catch (error) {
        return res.status(500).json({ message: "Internal server error", error });
      }
    }


export const serviceController= {createService}