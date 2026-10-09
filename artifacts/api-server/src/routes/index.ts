import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trackingRouter from "./tracking";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trackingRouter);

export default router;
