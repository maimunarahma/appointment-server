import { Router } from "express";
import { userRoutes } from "./user.route";
import { AuthRoutes } from "./auth.route";
import { staffRoutes } from "./staff.route";
import { serviceRoutes } from "./service.route";
import { appointmentRoutes } from "./appointment.route";



export const router=Router()
const moduleROutes= [
     {
        path:"/user",
        route: userRoutes
     },
     {
          path: "/auth",
          route: AuthRoutes
     },
     {
        path:"/staff",
        route: staffRoutes
     },
   
     {
        path:"/appointment",
        route: appointmentRoutes
     },
     {
        path:"/service",
        route: serviceRoutes
     }
]

moduleROutes.forEach((route)=>{
     router.use(route.path, route.route)
})
export default router;