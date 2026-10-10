import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trackingRouter from "./tracking";
import qualityActionsRouter from "./quality-actions";
import packagingRouter from "./packaging";
import authRouter from "./auth";
import packagingDocumentsRouter from "./packaging-documents";
import packagingTeamsRouter from "./packaging-teams";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trackingRouter);
router.use(qualityActionsRouter);
router.use(packagingRouter);
router.use(authRouter);
router.use(packagingDocumentsRouter);
router.use(packagingTeamsRouter);

export default router;
