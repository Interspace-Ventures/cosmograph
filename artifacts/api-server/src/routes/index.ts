import { Router, type IRouter } from "express";
import healthRouter from "./health";
import githubRouter from "./github";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(githubRouter);
router.use(feedbackRouter);

export default router;
