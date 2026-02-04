import { Request, Response } from "express";
import { User } from "../models/user.model";
import { verifyToken } from "../utils/jwt";
import { Appointment } from "../models/appointment.model";
import { Staff } from "../models/staff.model";
import { Service } from "../models/service.model";
import { Log } from "../models/log.model";

// Helper: Parse time string like "10:00 AM" to Date
const parseTimeString = (timeStr: string, date: Date): Date => {
  const dateObj = new Date(date.getTime()); // Create a new copy, don't mutate
  const timeParts = timeStr.match(/(\d+):(\d+)\s*(AM|PM|am|pm)/i);
  
  if (!timeParts) {
    throw new Error(`Invalid time format: ${timeStr}. Expected format: HH:MM AM/PM`);
  }
  
  let hours = parseInt(timeParts[1], 10);
  const minutes = parseInt(timeParts[2], 10);
  const period = timeParts[3].toUpperCase();
  
  // Validate hours and minutes
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time values in: ${timeStr}`);
  }
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  dateObj.setHours(hours, minutes, 0, 0);
  return dateObj;
};

// Helper: Get staff load for a specific date
const getStaffLoad = async (staffName: string, date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const appointmentsToday = await Appointment.countDocuments({
    staff: staffName,  // Query by name, not ID
    date: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ["Waiting", 'Scheduled', 'Completed'] }
  });

  const staff = await Staff.findOne({ name: staffName });
  if (!staff) return null;

  return {
    current: appointmentsToday,
    capacity: staff.dailyCapacity,
    available: appointmentsToday < staff.dailyCapacity,
    staff
  };
};

// Helper: Check for time conflicts
const checkTimeConflict = async (staffName: string, startTime: Date, endTime: Date, excludeAppointmentId?: string) => {
  const query: any = {
    staff: staffName,  // Query by name
    status: { $in: ['Scheduled', 'Completed'] },
    $or: [
      // New appointment starts during existing appointment
      { startTime: { $lte: startTime }, endTime: { $gt: startTime } },
      // New appointment ends during existing appointment
      { startTime: { $lt: endTime }, endTime: { $gte: endTime } },
      // New appointment completely overlaps existing appointment
      { startTime: { $gte: startTime }, endTime: { $lte: endTime } }
    ]
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(query).populate('service');
  return conflict;
};

// Helper: Get eligible staff for a service
// const getEligibleStaff = async (serviceId: string, date: Date) => {
//   const service = await Service.findById(serviceId);
//   if (!service) return [];

//   const allStaff = await Staff.find({
//     serviceType: service.requiredStaffType,
//     status: 'Available'
//   });

//   const staffWithLoad = await Promise.all(
//     allStaff.map(async (staff) => {
//       const load = await getStaffLoad(staff._id.toString(), date);
//       return {
//         _id: staff._id,
//         name: staff.name,
//         serviceType: staff.serviceType,
//         current: load?.current || 0,
//         capacity: load?.capacity || 5,
//         available: load?.available || false
//       };
//     })
//   );

//   return staffWithLoad;
// };

// Helper: Create activity log
const createLog = async (adminId: string, message: string) => {
  await Log.create({ adminId, message });
};

// CREATE APPOINTMENT
const createAppointment = async (req: Request, res: Response) => {
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

    const { customerName, service, staff, date, startTime, endTime } = req.body;

    let start: Date;
    let end: Date;
    let appointmentDate: Date;
    
    try {
      // Get appointment date (default to today if not provided)
      appointmentDate = date ? new Date(date) : new Date();
      appointmentDate.setHours(0, 0, 0, 0);
      
      if (!startTime || !endTime) {
        return res.status(400).json({ 
          message: "startTime and endTime are required",
          examples: [
            { startTime: "10:00 AM", endTime: "10:30 AM" },
            { startTime: "10:00", endTime: "10:30" }
          ]
        });
      }

      // Handle different time formats
      if (typeof startTime === 'string' && typeof endTime === 'string') {
        // Check if it's 12-hour format (with AM/PM)
        if (startTime.includes('AM') || startTime.includes('PM') || startTime.includes('am') || startTime.includes('pm')) {
          start = parseTimeString(startTime, appointmentDate);
          end = parseTimeString(endTime, appointmentDate);
        } 
        // Handle 24-hour format (HH:MM)
        else if (startTime.match(/^\d{1,2}:\d{2}$/) && endTime.match(/^\d{1,2}:\d{2}$/)) {
          const [startHours, startMinutes] = startTime.split(':').map(Number);
          const [endHours, endMinutes] = endTime.split(':').map(Number);
          
          start = new Date(appointmentDate.getTime());
          start.setHours(startHours, startMinutes, 0, 0);
          
          end = new Date(appointmentDate.getTime());
          end.setHours(endHours, endMinutes, 0, 0);
        } 
        else {
          return res.status(400).json({ 
            message: "Invalid time format",
            received: { startTime, endTime },
            expected: "Format: 'HH:MM AM/PM' or 'HH:MM' (24-hour)"
          });
        }
      } else {
        start = new Date(startTime);
        end = new Date(endTime);
      }

      // Validate parsed dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ 
          message: "Invalid date format",
          received: { startTime, endTime },
          expected: "Format: 'HH:MM AM/PM', 'HH:MM', or ISO date string"
        });
      }

      // Check if end time is after start time
      if (end <= start) {
        return res.status(400).json({ 
          message: "End time must be after start time" 
        });
      }
    } catch (error: any) {
      return res.status(400).json({ 
        message: "Invalid time format",
        error: error.message,
        expected: "Format: 'HH:MM AM/PM' or 'HH:MM' (24-hour)"
      });
    }

    let assignedStaff = null;
    let appointmentStatus = 'Waiting';
    let queuePosition = null;

    // If staff is provided, try to assign
    if (staff) {
      const staffDoc = await Staff.findOne({ name: staff });
      
      if (!staffDoc) {
        return res.status(404).json({ message: `Staff '${staff}' not found` });
      }

      // Check if staff is on leave
      if (staffDoc.status !== 'Available') {
        // Staff on leave - add to waiting queue
        assignedStaff = null;
        appointmentStatus = 'Waiting';
        const queueCount = await Appointment.countDocuments({ status: 'Waiting' });
        queuePosition = queueCount + 1;
        console.log(`Staff on leave. Adding to queue at position ${queuePosition}`);
        // Continue to create appointment below (don't return here)
      } else {
        // Check daily capacity
        const load = await getStaffLoad(staffDoc.name, start);
        console.log("load is", load)
        
        if (!load?.available) {
          // Capacity exceeded - add to waiting queue
          assignedStaff = null;
          appointmentStatus = 'Waiting';
          const queueCount = await Appointment.countDocuments({ status: 'Waiting' });
          queuePosition = queueCount + 1;
          console.log(`Staff at capacity (${load?.current}/${load?.capacity}). Adding to queue at position ${queuePosition}`);
          // Continue to create appointment below (don't return here)
        } else {
          // Check time conflict
          const conflict = await checkTimeConflict(staffDoc.name, start, end);
          if (conflict) {
            return res.status(409).json({ 
              message: `${staffDoc.name} already has an appointment at this time`,
              conflict: {
                customerName: conflict.customerName,
                startTime: conflict.startTime,
                endTime: conflict.endTime
              }
            });
          }

          // All checks passed - assign staff
          assignedStaff = staffDoc.name;
          appointmentStatus = 'Scheduled';
        }
      }
    } else {
      // No staff provided - add to queue
      const queueCount = await Appointment.countDocuments({ status: 'Waiting' });
      queuePosition = queueCount + 1;
    }

    const appointment = await Appointment.create({
      adminId: user._id,
      customerName,
      service,
      staff: assignedStaff,  // Will be staff name if assigned, null if in queue
      date: appointmentDate,
      startTime: start,
      endTime: end,
      status: appointmentStatus,
      queuePosition
    });

    // Don't populate since we're storing names not IDs
    // await appointment.populate(['service', 'staff']);

    // Create activity log
    if (assignedStaff) {
      await createLog(user._id.toString(), 
        `Appointment for "${customerName}" assigned to ${assignedStaff}`
      );
    } else {
      await createLog(user._id.toString(), 
        `Appointment for "${customerName}" added to waiting queue (Position: ${queuePosition})`
      );
    }

    return res.status(201).json({ 
      message: assignedStaff ? "Appointment created successfully" : "Appointment added to waiting queue",
      appointment 
    });

  } catch (error: any) {
    console.error("Create appointment error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


// GET ALL APPOINTMENTS
const getAppointments = async (req: Request, res: Response) => {
  try {
    const token = req?.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
    const userId = (decoded as any).userId;

    const { date, staffId, status } = req.query;
    
    const filter: any = { adminId: userId };
    
    if (date) {
      const queryDate = new Date(date as string);
      const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    
    if (staffId) {
      filter.staff = staffId;
    }
    
    if (status) {
      filter.status = status;
    }

    const appointments = await Appointment.find(filter)
      .populate('service')
      .populate('staff')
      .sort({ startTime: 1 });

    return res.status(200).json({ appointments });

  } catch (error: any) {
    console.error("Get appointments error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// // UPDATE APPOINTMENT
// const updateAppointment = async (req: Request, res: Response) => {
//   try {
//     const token = req?.cookies?.refreshToken;
//     if (!token) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
//     const userId = (decoded as any).userId;
    
//     const { id } = req.params;
//     const { customerName, staffId, startTime, status } = req.body;

//     const appointment = await Appointment.findOne({ _id: id, adminId: userId });
//     if (!appointment) {
//       return res.status(404).json({ message: "Appointment not found" });
//     }

//     // If changing staff or time, check conflicts
//     if (staffId || startTime) {
//       const service = await Service.findById(appointment.service);
//       const newStaffId = staffId || appointment.staff?.toString();
//       const newStartTime = startTime ? new Date(startTime) : appointment.startTime;
//       const newEndTime = new Date(newStartTime.getTime() + (service?.duration || 30) * 60000);

//       if (newStaffId) {
//         const conflict = await checkTimeConflict(newStaffId, newStartTime, newEndTime, id);
//         if (conflict) {
//           const staff = await Staff.findById(newStaffId);
//           return res.status(409).json({ 
//             message: `${staff?.name} already has an appointment at this time`,
//             conflict: {
//               customerName: conflict.customerName,
//               startTime: conflict.startTime,
//               endTime: conflict.endTime
//             }
//           });
//         }

//         // Check capacity
//         const load = await getStaffLoad(newStaffId, appointment.date);
//         if (!load?.available && newStaffId !== appointment.staff?.toString()) {
//           return res.status(400).json({ 
//             message: `Staff already has ${load?.current}/${load?.capacity} appointments today`
//           });
//         }
//       }

//       if (startTime) {
//         appointment.startTime = newStartTime;
//         appointment.endTime = newEndTime;
//       }
      
//       if (staffId) {
//         appointment.staff = staffId;
//         appointment.status = 'Scheduled';
//         appointment.queuePosition = null;
//       }
//     }

//     if (customerName) appointment.customerName = customerName;
//     if (status) appointment.status = status;

//     await appointment.save();
//     await appointment.populate(['service', 'staff']);

//     await createLog(userId, `Appointment for "${appointment.customerName}" updated`);

//     return res.status(200).json({ 
//       message: "Appointment updated successfully", 
//       appointment 
//     });

//   } catch (error: any) {
//     console.error("Update appointment error:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// DELETE APPOINTMENT
// const deleteAppointment = async (req: Request, res: Response) => {
//   try {
//     const token = req?.cookies?.refreshToken;
//     if (!token) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
//     const userId = (decoded as any).userId;
    
//     const { id } = req.params;

//     const appointment = await Appointment.findOneAndDelete({ _id: id, adminId: userId });
//     if (!appointment) {
//       return res.status(404).json({ message: "Appointment not found" });
//     }

//     await createLog(userId, `Appointment for "${appointment.customerName}" deleted`);

//     return res.status(200).json({ message: "Appointment deleted successfully" });

//   } catch (error: any) {
//     console.error("Delete appointment error:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// GET WAITING QUEUE
const getWaitingQueue = async (req: Request, res: Response) => {
  try {
    const token = req?.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
    const userId = (decoded as any).userId;

    const queue = await Appointment.find({ 
      adminId: userId, 
      status: 'Waiting' 
    }).populate('service')
      .sort({ startTime: 1 });

    return res.status(200).json({ queue });

  } catch (error: any) {
    console.error("Get queue error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// // ASSIGN FROM QUEUE
// const assignFromQueue = async (req: Request, res: Response) => {
//   try {
//     const token = req?.cookies?.refreshToken;
//     if (!token) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
//     const userId = (decoded as any).userId;
    
//     const { staffId } = req.body;

//     const staff = await Staff.findById(staffId);
//     if (!staff || staff.status !== 'Available') {
//       return res.status(400).json({ message: "Staff not available" });
//     }

//     // Find earliest eligible appointment in queue
//     const queuedAppointments = await Appointment.find({ 
//       adminId: userId,
//       status: 'Waiting' 
//     })
//       .populate('service')
//       .sort({ startTime: 1 });

//     let assigned = null;

//     for (const appointment of queuedAppointments) {
//       const service = appointment.service as any;
      
//       // Check if staff type matches
//       if (service.requiredStaffType !== staff.serviceType) continue;

//       // Check capacity
//       const load = await getStaffLoad(staffId, appointment.date);
//       if (!load?.available) break;

//       // Check time conflict
//       const conflict = await checkTimeConflict(staffId, appointment.startTime, appointment.endTime);
//       if (conflict) continue;

//       // Assign this appointment
//       appointment.staff = staffId;
//       appointment.status = 'Scheduled';
//       appointment.queuePosition = null;
//       await appointment.save();
//       await appointment.populate('staff');

//       assigned = appointment;
//       break;
//     }

//     if (!assigned) {
//       return res.status(404).json({ 
//         message: "No eligible appointments in queue for this staff member" 
//       });
//     }

//     await createLog(userId, 
//       `Appointment for "${assigned.customerName}" assigned from queue to ${staff.name}`
//     );

//     return res.status(200).json({ 
//       message: "Appointment assigned from queue", 
//       appointment: assigned 
//     });

//   } catch (error: any) {
//     console.error("Assign from queue error:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// GET ELIGIBLE STAFF FOR SERVICE
// const getAvailableStaff = async (req: Request, res: Response) => {
//   try {
//     const token = req?.cookies?.refreshToken;
//     if (!token) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const { serviceId, date } = req.query;

//     if (!serviceId || !date) {
//       return res.status(400).json({ message: "Service ID and date are required" });
//     }

//     const staffList = await getEligibleStaff(serviceId as string, new Date(date as string));

//     return res.status(200).json({ staff: staffList });

//   } catch (error: any) {
//     console.error("Get available staff error:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

export const appointmentController = {
  createAppointment,
  getAppointments,
//   updateAppointment,
//   deleteAppointment,
  getWaitingQueue,
// //   assignFromQueue,
//   getAvailableStaff
};