import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import availabilityRouter from "./availability";
import testimonialsRouter from "./testimonials";
import adminRouter from "./admin";
import patientRouter from "./patient";
import subscribersRouter from "./subscribers";
import doctorRouter from "./doctor";
import onlineSlotsRouter from "./online-slots";
import onlineAppointmentsRouter from "./online-appointments";
import storageRouter from "./storage";
import pharmacyRouter from "./pharmacy";
import medicineOrdersRouter from "./medicine-orders";
import livekitRouter from "./livekit";
import guestRouter from "./guest";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/livekit", livekitRouter);
router.use("/appointments", appointmentsRouter);
router.use("/availability", availabilityRouter);
router.use("/testimonials", testimonialsRouter);
router.use("/admin", adminRouter);
router.use("/patient", patientRouter);
router.use("/subscribers", subscribersRouter);
router.use("/doctor", doctorRouter);
router.use("/online-slots", onlineSlotsRouter);
router.use("/online-appointments", onlineAppointmentsRouter);
router.use("/pharmacy", pharmacyRouter);
router.use("/medicine-orders", medicineOrdersRouter);
router.use("/guest", guestRouter);
router.use(storageRouter);

export default router;
