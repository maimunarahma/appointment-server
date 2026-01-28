import { Router } from "express";
import { staffController } from "../controller/staff.controller";
import { serviceController } from "../controller/service.controller";


const router = Router();

router.post("/", serviceController.createService);

// router.get("/me", userController.validateUser);

export const serviceRoutes = router;