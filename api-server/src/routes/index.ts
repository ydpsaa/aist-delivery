import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import courierRouter from "./courier.js";
import adminRouter from "./admin.js";
import customerRouter from "./customer.js";
import pricingRouter, { pricingAdminRouter, pricingCustomerRouter } from "./pricing.js";
import {
  refundsAdminRouter,
  couponsAdminRouter,
  invoicesAdminRouter,
  payoutsAdminRouter,
  couponsCustomerRouter,
  invoicesCustomerRouter,
} from "./finops.js";
import systemRouter from "./system.js";
import placesRouter from "./places.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/courier", courierRouter);

// Customer routes
router.use("/customer", customerRouter);
router.use("/customer", pricingCustomerRouter);
router.use("/customer/coupons", couponsCustomerRouter);
router.use("/customer/invoices", invoicesCustomerRouter);

// Admin routes
router.use("/admin", adminRouter);
router.use("/admin", pricingAdminRouter);
router.use("/admin/refunds", refundsAdminRouter);
router.use("/admin/coupons", couponsAdminRouter);
router.use("/admin/invoices", invoicesAdminRouter);
router.use("/admin/payouts", payoutsAdminRouter);
router.use("/admin/system", systemRouter);

// Public pricing
router.use("/pricing", pricingRouter);

// Google Places proxy (avoids browser CORS; key stays server-side)
router.use("/places", placesRouter);

export default router;
