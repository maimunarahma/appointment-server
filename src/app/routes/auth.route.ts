import { Router } from "express";
import { authController } from "../controller/auth.controller";


const router = Router();


router.post("/", authController.credentialLogin);
router.get('/me', authController.getUser);
router.post('/logout', authController.logout)

export const AuthRoutes = router;