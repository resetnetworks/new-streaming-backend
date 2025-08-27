import express from "express";
import { authenticateUser } from "../../../middleware/authenticate.js";
import * as subscriptionController from "../controllers/subscription.controller.js";
import { artistIdValidator } from "../../../validators/artistValidators.js";
import validate from "../../../middleware/validate.js";

const router = express.Router();

// 🎵 Create subscription (Razorpay)
router.post(
  "/artist/:artistId",
  authenticateUser,
  validate(artistIdValidator),
  subscriptionController.createRazorpaySubscription
);

// 🎵 Create subscription (Stripe SetupIntent)
router.post(
  "/setup-intent",
  authenticateUser,
  subscriptionController.createStripeSetupIntent
);

// 🎵 Cancel subscription
router.delete(
  "/artist/:artistId",
  authenticateUser,
  validate(artistIdValidator),
  subscriptionController.cancelArtistSubscription
);

export default router;
