import { Router, type IRouter } from "express";
import healthRouter from "./health";
import githubRouter from "./github";
import billingRouter from "./billing";
import shipRouter from "./ship";
import askRouter from "./ask";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(githubRouter);
router.use(billingRouter);
router.use(shipRouter);
router.use(askRouter);
router.use(feedbackRouter);

export default router;
