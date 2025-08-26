// src/features/payment/controllers/webhook.controller.js
import Stripe from "stripe";
import crypto from "crypto";
import logger from "../../../core/logger.js";
import eventDispatcher from "../../../core/events/eventDispatcher.js";
import { PAYMENT_EVENTS } from "../events/eventTypes.js";
import Transaction from "../models/transaction.model.js";
import User from "../../user/user.model.js";
import Subscription from "../models/subscription.model.js";

// Load secrets from env
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Stripe Webhook handler
 */
export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    logger.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle relevant events
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      const { transactionId, userId, metadata } = paymentIntent.metadata;

      // Dispatch our internal event
      eventDispatcher.dispatch(PAYMENT_EVENTS.PAYMENT_SUCCEEDED, {
        transactionId,
        userId,
        metadata: JSON.parse(metadata),
      });
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object;
      const { transactionId } = paymentIntent.metadata;
      eventDispatcher.dispatch(PAYMENT_EVENTS.PAYMENT_FAILED, { transactionId });
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const { transactionId } = charge.metadata || {};
      if (transactionId) {
        eventDispatcher.dispatch(PAYMENT_EVENTS.REFUND_ISSUED, { transactionId });
      }
      break;
    }

    default:
      logger.info(`Unhandled Stripe event type: ${event.type}`);
  }

  res.json({ received: true });
};

/**
 * Razorpay Webhook handler
 */
export const razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const body = JSON.stringify(req.body);
  const signature = req.headers["x-razorpay-signature"];

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  if (signature !== expectedSignature) {
    logger.error("Razorpay webhook signature mismatch");
    return res.status(400).send("Invalid signature");
  }

  const event = req.body.event;

  switch (event) {
    case "payment.captured": {
      const { id: transactionId, notes } = req.body.payload.payment.entity;
      const userId = notes.userId;
      const metadata = JSON.parse(notes.metadata || "{}");

      eventDispatcher.dispatch(PAYMENT_EVENTS.PAYMENT_SUCCEEDED, {
        transactionId,
        userId,
        metadata,
      });
      break;
    }

    case "payment.failed": {
      const { id: transactionId, notes } = req.body.payload.payment.entity;
      eventDispatcher.dispatch(PAYMENT_EVENTS.PAYMENT_FAILED, { transactionId });
      break;
    }

    case "refund.processed": {
      const { id: transactionId } = req.body.payload.refund.entity;
      eventDispatcher.dispatch(PAYMENT_EVENTS.REFUND_ISSUED, { transactionId });
      break;
    }

    default:
      logger.info(`Unhandled Razorpay event type: ${event}`);
  }

  res.json({ status: "ok" });
};
