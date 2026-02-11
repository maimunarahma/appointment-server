import { Request, Response } from "express";
import { User } from "../models/user.model";
import { verifyToken } from "../utils/jwt";
import { Appointment } from "../models/appointment.model";
import { Staff } from "../models/staff.model";
import { Service } from "../models/service.model";
import { Log } from "../models/log.model";
import { error } from "console";

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
const checkTimeConflict = async (
  staffName: string,
  date: Date,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string
) => {
  const query: any = {
    staff: staffName,
    status: 'Scheduled',
    $and: [
      { startTime: { $lt: endTime } },  // start < new end
      { endTime: { $gt: startTime } }   // end > new start
    ]
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  console.log("🔍 Conflict query:", JSON.stringify({
    staff: query.staff,
    status: query.status,
    timeRange: `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`
  }));

  const conflict = await Appointment.findOne(query);

  if (conflict) {
    console.log("⚠️ CONFLICT DETECTED:", {
      customerName: conflict.customerName,
      existingTime: `${conflict.startTime.toLocaleTimeString()} - ${conflict.endTime?.toLocaleTimeString()}`
    });
  }

  return conflict;
};

const staffLoad = async (staffId: string, date: Date) => {
  try {


  } catch (error) {

  }
}
const getEligibleStaff = async (service: string, date: Date) => {
  const serviceObj = await Service.findById(service);
  if (!serviceObj) return [];

  const allStaff = await Staff.find({
    name: serviceObj.requiredStaffType,
    status: 'Available'
  });

  const staffWithLoad = await Promise.all(
    allStaff.map(async (staff) => {
      const load = await getStaffLoad(staff._id.toString(), date);
      return {
        _id: staff._id,
        name: staff.name,
        serviceType: staff.serviceType,
        current: load?.current || 0,
        capacity: load?.capacity || 5,
        available: load?.available || false
      };
    })
  );

  return staffWithLoad;
};

// Helper: Create activity log (async but don't await - fire and forget for performance)
const createLog = async (adminId: string, message: string) => {
  try {
    await Log.create({ adminId, message });
  } catch (error) {
    console.error("Failed to create log:", error);
  }
};

// Helper: Input validation
const validateAppointmentInput = (data: any) => {
  const errors: string[] = [];

  if (!data.customerName?.trim()) errors.push("customerName is required");
  if (!data.service?.trim()) errors.push("service is required");
  if (!data.startTime) errors.push("startTime is required");
  if (!data.endTime) errors.push("endTime is required");

  return errors.length > 0 ? errors : null;
};

const timeFormats = async (
  startTime: string,
  endTime: string,
  date: Date
) => {
  let start: Date;
  let end: Date;

  try {
    if (typeof startTime === 'string' && typeof endTime === 'string') {
      if (
        startTime.includes('AM') ||
        startTime.includes('PM') ||
        startTime.includes('am') ||
        startTime.includes('pm')
      ) {
        start = parseTimeString(startTime, date);
        end = parseTimeString(endTime, date);
      }
      else if (
        startTime.match(/^\d{1,2}:\d{2}$/) &&
        endTime.match(/^\d{1,2}:\d{2}$/)
      ) {
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);

        start = new Date(date);
        start.setHours(startHours, startMinutes, 0, 0);

        end = new Date(date);
        end.setHours(endHours, endMinutes, 0, 0);
      }
      else {
        throw new Error("Invalid time format. Use 'HH:MM AM/PM' or 'HH:MM'");
      }
    } else {
      start = new Date(startTime);
      end = new Date(endTime);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Invalid date/time values");
    }

    if (end <= start) {
      throw new Error("End time must be after start time");
    }

    return { start, end };

  } catch (error: any) {
    throw new Error(error.message);
  }
};


// CREATE APPOINTMENT
// check if staff is available , if avai,check his logs ,,
const createAppointment = async (req: Request, res: Response) => {
  try {
    // 1. Authentication
    const token = req?.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized, no token provided" });
    }

    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
    const userId = (decoded as any).userId;

    // 2. Input Validation
    const { customerName, service, staff, date, startTime, endTime } = req.body;
   console.log(" req from frontend is" , req.body)
    const validationErrors = validateAppointmentInput(req.body);
    if (validationErrors) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // 3. Parse and Validate Times
    const appointmentDate = date ? new Date(date) : new Date();
    appointmentDate.setHours(0, 0, 0, 0);

    const { start, end } = await timeFormats(startTime, endTime, appointmentDate);

    // 4. Database Operations - Use Promise.all for parallel queries
    const [user, allStaff] = await Promise.all([
      User.findById(userId).lean(), // .lean() for better performance
      Staff.find({ status: 'Available' }).lean()
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    let assignedStaff: string = staff;
    let appointmentStatus: 'Scheduled' | 'Waiting' = 'Waiting';
    let queuePosition: number  = 0;

    const ifSaffAvailable = staff ? allStaff.some(s => s.name === staff && s.status === 'Available' && (s?.current ?? 0) < s.dailyCapacity) : true;
   console.log("is staff available" , ifSaffAvailable)
    console.log("🔍 Checking conflicts for", staff, "between", start.toLocaleTimeString(), "-", end.toLocaleTimeString());
    const conflict = await checkTimeConflict(staff, date, start, end);
    console.log("⚠️ Conflict found:", conflict ? "YES" : "NO", conflict);

    if (conflict) {
      
      return res.status(409).json({
        message: `${staff} already has an appointment at this time. choose another time or staff.`,
        conflict: {
          customerName: conflict.customerName,
          time: `${conflict.startTime.toLocaleTimeString()} - ${conflict.endTime ? conflict.endTime.toLocaleTimeString() : 'N/A'}`
        }
      });

    }

    // All checks passed - assign staff


    if (staff && !ifSaffAvailable && !conflict) {

      const eligibleStaff = allStaff.filter(s => s.serviceType === service && s.status === 'Available' && (s?.current ?? 0) < s.dailyCapacity);
      if (eligibleStaff.length === 0) {
        const queueCount = await Appointment.countDocuments({
          adminId: userId,
          status: 'Waiting'
        });
        queuePosition = queueCount + 1;
        const appointment = await Appointment.create({
          adminId: user._id,
          customerName: customerName.trim(),
          service: service.trim(),
          staff: null,
          date: appointmentDate,
          startTime: start,
          endTime: end,
          status: 'Waiting',
          queuePosition
        })
        return res.status(404).json({ message: `Requested staff '${staff}' not found and no eligible staff available for service '${service}'. And added to the waiting list.`, data: appointment });
      }
      const appointment = await Appointment.create({
        adminId: user._id,
        customerName: customerName.trim(),
        service: service.trim(),
        staff: eligibleStaff[0].name,
        date: appointmentDate,
        startTime: start,
        endTime: end,
        status: 'Scheduled',
        queuePosition: null

      })
      return res.status(404).json({ message: `Requested staff not found or unavailable instead appointment assigned to ${eligibleStaff[0].name}`, data: appointment });
    }
    const appointment = await Appointment.create({
      adminId: user._id,
      customerName: customerName.trim(),
      service: service.trim(),
      staff: assignedStaff,
      date: appointmentDate,
      startTime: start,
      endTime: end,
      status: "Scheduled",
      queuePosition: 0
    });

    return res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      appointment
    });


  }
  catch (error: any) {
    console.error("Create appointment error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}
// GET ALL APPOINTMENTS
const getAppointments = async (req: Request, res: Response) => {
  try {
    const token = req?.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
    const userId = (decoded as any).userId;

    const { date, status } = req.query;

    if (!date || !status || (!status && !date)) {
      const appoinments = await Appointment.find()

      return res.status(201).json({ message: "all appoinments", appoinments });

    }
    const filter: any = { adminId: userId };

    if (date) {
      const queryDate = new Date(date as string);
      const startOfDay = new Date(queryDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(queryDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    const allowedStatus = ["Scheduled", "Completed", "Cancelled", "No-Show", "Queued"];

    if (status && allowedStatus.includes(status as string)) {
      filter.status = status;
    }
    const appointments = await Appointment.find(filter)
      .populate('service')
      .populate('staff')
      .sort({ startTime: 1 });

    return res.status(200).json(appointments);

  } catch (error: any) {
    console.error("Get appointments error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// // UPDATE APPOINTMENT
const updateAppointment = async (req: Request, res: Response) => {
  try {
   console.log(req.body)
    const { id } = req.params;
    const { customerName, staff, startTime, status } = req.body;

    const appointment = await Appointment.findOne({ _id: id });
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
   if(status && !customerName && !staff && !startTime){
    // save status
    appointment.status = status;
    await appointment.save();
    if(status === 'Completed' || status === 'Cancelled' ){
      if(appointment.status === 'Completed'){
         await Staff.findOneAndUpdate({ name: appointment.staff }, { $inc: { current: 1 } });

      }
      if(appointment.queuePosition !== 0 && appointment.status === 'Cancelled'){
        appointment.queuePosition = 0;
        await appointment.save();
          await Appointment.updateMany(
            { service: appointment.service, status: 'Waiting', queuePosition: { $gt: appointment.queuePosition } },
            { $inc: { queuePosition: -1 } }
          );
          
      }
      //  find next in queue and update
      
      const nextAppointment = await Appointment.findOneAndUpdate(
        { service: appointment.service, status: 'Waiting', queuePosition: { $gt: 1 } },
        {
          $inc: { queuePosition: 0 },
          status: 'Scheduled',
          staff: appointment.staff
        },
        { new: true }
      );
      
      if (nextAppointment) {
        await createLog(appointment.adminId.toString(), `Appointment for "${nextAppointment.customerName}" moved from queue to scheduled`);
        return res.status(200).json({ message: "Appointment status updated and next in queue automatically scheduled successfully", appointment });
    }
   }
 
  }
    // If changing staff or time, check conflicts
    if (staff || startTime) {
      const service = await Service.findOne({ name: appointment.service });
      const newStaff = staff || appointment.staff?.toString();
      const newStartTime = startTime ? new Date(startTime) : appointment.startTime;
      const newEndTime = new Date(newStartTime.getTime() + (service?.duration || 30) * 60000);

      if (newStaff) {
        const conflict = await checkTimeConflict(newStaff, newStartTime, newEndTime, id);
        if (conflict) {
          const staff = await Staff.findById(newStaff);
          return res.status(409).json({
            message: `${staff?.name} already has an appointment at this time`,
            conflict: {
              customerName: conflict.customerName,
              startTime: conflict.startTime,
              endTime: conflict.endTime
            }
          });
        }

        // Check capacity
        const load = await getStaffLoad(newStaff, appointment.date);

        if (!load?.available && newStaff !== appointment.staff?.toString()) {
          return res.status(400).json({

            message: `Staff already has ${load?.current}/${load?.capacity} appointments today`
          });
        }
        const staff = await Staff.findByIdAndUpdate(newStaff, { $inc: { current: load?.current } }, { new: true });
      }

      if (startTime) {
        appointment.startTime = newStartTime;
        appointment.endTime = newEndTime;
      }

      if (Staff) {
        appointment.staff = Staff;
        appointment.status = 'Scheduled';
        appointment.queuePosition = 0;
      }
    }

    if (customerName) appointment.customerName = customerName;
    if (status) appointment.status = status;
    if (status === 'Completed') {
      const nextAppointment = await Appointment.findOneAndUpdate(
        { service: appointment.service, status: 'Waiting', queuePosition: { $gt: 1 } },
        {
          $inc: { queuePosition: 0 },
          status: 'Scheduled'
        },
        { new: true }
      );
      if (nextAppointment) {
        return res.status(200).json({ message: "Appointment updated and next in queue scheduled successfully" });
      }

    }
    await appointment.populate(['service', 'staff']);

    await createLog(User, `Appointment for "${appointment.customerName}" updated`);

    return res.status(200).json({
      message: "Appointment updated successfully",
      appointment
    });

  }
  catch (error: any) {
    console.error("Update appointment error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DELETE Appointment
const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const token = req?.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET || "secretrefresh");
    const userId = (decoded as any).userId;

    const { id } = req.params;

    const appointment = await Appointment.findOneAndDelete({ _id: id });
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.queuePosition !== 0) {
      const findNext = await Appointment.findOneAndUpdate(
        { service: appointment.service, status: 'Waiting', queuePosition: { $gt: appointment.queuePosition } },
        { $inc: { queuePosition: -1 } },
        { new: true }
      );
      if (findNext) {
        return res.status(200).json({ message: "Appointment deleted and queue updated successfully" });
      }

      await createLog(userId, `Appointment for "${appointment.customerName}" deleted`);

      return res.status(200).json({ message: "Appointment deleted successfully" });

    }
  } catch (error: any) {
    console.error("Delete appointment error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

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

export const appointmentController = {
  createAppointment,
  getAppointments,
  updateAppointment,
  deleteAppointment,
  getWaitingQueue,
  // //   assignFromQueue,
  //   getAvailableStaff
};