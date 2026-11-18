import { Router } from "express";
import {
  getOrder,
  deliveryDone,
  getOrdersByPartner,
  acceptOrder,
  updateDeliveryStatus,
  verifyOtpAndDeliver,
  updateDriverLocation,
  resendOtp,
  assignOrder,
  getOrderDetails,
  trackOrder,
} from "../controllers/delivery.controllers.js";

const router = Router();

// Legacy routes preserved for existing callers
router.route("/get-delivery-order/:phone").get(getOrder);
router.route("/delivery-done").post(deliveryDone);

// Modern delivery partner workflow routes
router.route("/orders/:phone").get(getOrdersByPartner);
router.route("/accept-order").post(acceptOrder);
router.route("/update-status").post(updateDeliveryStatus);
router.route("/verify-otp-and-deliver").post(verifyOtpAndDeliver);
router.route("/update-location").post(updateDriverLocation);
router.route("/resend-otp").post(resendOtp);
router.route("/assign-order").post(assignOrder);
router.route("/order-details/:orderId").get(getOrderDetails);
router.route("/track/:identifier").get(trackOrder);

export default router;
