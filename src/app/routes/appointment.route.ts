import { Router } from "express";
import { appointmentController } from "../controller/appointment.controller";

const router = Router();

// Appointment CRUD
router.post("/", appointmentController.createAppointment);
router.get("/", appointmentController.getAppointments);
router.put("/:id", appointmentController.updateAppointment);
router.delete("/:id", appointmentController.deleteAppointment);

// // Queue Management
router.get("/queue", appointmentController.getWaitingQueue);
// router.post("/queue/assign", appointmentController.assignFromQueue);

// // Staff Availability
// router.get("/available-staff", appointmentController.getAvailableStaff);

export const appointmentRoutes = router;
