import { Router, type IRouter } from "express";
import { getSystemReadiness } from "../config.js";

const router: IRouter = Router();

/**
 * GET /api/healthz — simple liveness probe
 */
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

/**
 * GET /api/readiness — comprehensive integration readiness status.
 * Public — no auth required. Safe: no secrets exposed.
 * Used by mobile app, admin panel, and monitoring tools.
 */
router.get("/readiness", (_req, res) => {
  const readiness = getSystemReadiness();
  res.json(readiness);
});

export default router;
