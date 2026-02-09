import { User } from "../models/user.model";
import { Request, Response } from "express";
import { verifyToken } from "../utils/jwt";
import { Staff } from "../models/staff.model";



const createStaff = async (req: Request, res: Response) => {
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
       const {name, serviceType, dailyCapacity, status} = req.body;
        const staff= await Staff.create({
            adminId: user._id,
          name,
            serviceType,
            dailyCapacity,
            status
        })
        return res.status(201).json({ message: "Staff created successfully", staff });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error", error });
        
    }
}
const getStaff = async (req: Request, res: Response) => {
     try {
        const staffs = await Staff.find();
        return res.status(200).json( staffs );
     } catch (error) {
        return res.status(500).json({ message: "Internal server error", error });
     }
    }

    const deleteStaff= async (req: Request, res: Response) => {
         try {
             const {id} = req.params;
             const staff = await Staff.findByIdAndDelete(id);
             if (!staff) {
                 return res.status(404).json({ message: "Staff not found" });
             }
             return res.status(200).json({ message: "Staff deleted successfully" });
         } catch (error) {
            return res.status(500).json({ message: "Internal server error", error });
         }
        }
export const staffController= {createStaff, getStaff , deleteStaff}