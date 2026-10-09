import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trackingRouter from "./tracking";
import qualityActionsRouter from "./quality-actions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trackingRouter);
router.use(qualityActionsRouter);

export default router;
