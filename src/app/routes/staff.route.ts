import { Router } from "express";
import { staffController } from "../controller/staff.controller";


const router = Router();

router.post("/", staffController.createStaff);
router.get('/', staffController.getStaff);
router.delete('/:id', staffController.deleteStaff);
// router.get("/me", userController.validateUser);

export const staffRoutes = router;