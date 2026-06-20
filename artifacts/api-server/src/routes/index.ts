import { Router, type IRouter } from "express";
import healthRouter from "./health";
import githubRouter from "./github";

const router: IRouter = Router();

router.use(healthRouter);
router.use(githubRouter);

export default router;
