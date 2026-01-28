import { Router } from "express";
import { userController } from "../controller/user.controller";


const router = Router();

router.post("/register", userController.registerUser);

// router.get("/me", userController.validateUser);

export const userRoutes = router;