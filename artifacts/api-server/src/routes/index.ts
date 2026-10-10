import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trackingRouter from "./tracking";
import qualityActionsRouter from "./quality-actions";
import packagingRouter from "./packaging";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trackingRouter);
router.use(qualityActionsRouter);
router.use(packagingRouter);

export default router;
