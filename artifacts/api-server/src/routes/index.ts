import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appointmentsRouter from "./appointments";
import availabilityRouter from "./availability";
import testimonialsRouter from "./testimonials";
import adminRouter from "./admin";
import patientRouter from "./patient";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/appointments", appointmentsRouter);
router.use("/availability", availabilityRouter);
router.use("/testimonials", testimonialsRouter);
router.use("/admin", adminRouter);
router.use("/patient", patientRouter);

export default router;
