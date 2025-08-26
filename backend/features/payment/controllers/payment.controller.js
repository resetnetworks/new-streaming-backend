// src/features/payment/controllers/payment.controller.js
import Stripe from "stripe";
import Razorpay from "razorpay";
import { PAYMENT_EVENTS } from "../events/eventTypes.js";
import eventDispatcher from "../../../core/events/eventDispatcher.js";
import Transaction from "../models/transaction.model.js";
import User from "../../user/user.model.js";
import logger from "../../../core/logger.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Stripe Payment Intent for purchase or subscription
 */
export const createStripePayment = async (req, res) => {
  try {
    const { userId, amount, currency, itemId, itemType } = req.body;

    const transaction = await Transaction.create({
      user: userId,
      itemId,
      itemType,
      provider: "stripe",
      amount,
      currency,
      status: "pending",
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata: {
        transactionId: transaction._id.toString(),
        userId,
        metadata: JSON.stringify({ itemId, type: itemType }),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction._id,
    });
  } catch (err) {
    logger.error("Error creating Stripe payment:", err.message);
    res.status(500).json({ error: "Failed to create Stripe payment" });
  }
};

/**
 * Create Razorpay Order
 */
export const createRazorpayPayment = async (req, res) => {
  try {
    const { userId, amount, currency, itemId, itemType } = req.body;

    const transaction = await Transaction.create({
      user: userId,
      itemId,
      itemType,
      provider: "razorpay",
      amount,
      currency,
      status: "pending",
    });

    const order = await razorpayInstance.orders.create({
      amount,
      currency,
      receipt: transaction._id.toString(),
      notes: {
        transactionId: transaction._id.toString(),
        userId,
        metadata: JSON.stringify({ itemId, type: itemType }),
      },
    });

    res.json({ orderId: order.id, transactionId: transaction._id });
  } catch (err) {
    logger.error("Error creating Razorpay order:", err.message);
    res.status(500).json({ error: "Failed to create Razorpay payment" });
  }
};

/**
 * Confirm subscription (internal use after webhook success)
 * Triggers SUBSCRIPTION_CREATED event
 */
export const confirmSubscription = async (req, res) => {
  try {
    const { userId, artistId } = req.body;

    // Emit subscription created event
    eventDispatcher.dispatch(PAYMENT_EVENTS.SUBSCRIPTION_CREATED, { userId, artistId });

    res.json({ success: true, message: "Subscription confirmed" });
  } catch (err) {
    logger.error("Error confirming subscription:", err.message);
    res.status(500).json({ error: "Failed to confirm subscription" });
  }
};

/**
 * Refund a transaction (admin action)
 */
export const refundTransaction = async (req, res) => {
  try {
    const { transactionId } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });

    if (transaction.provider === "stripe") {
      await stripe.refunds.create({ payment_intent: transaction.providerPaymentId });
    } else if (transaction.provider === "razorpay") {
      await razorpayInstance.payments.refund(transaction.providerPaymentId);
    }

    eventDispatcher.dispatch(PAYMENT_EVENTS.REFUND_ISSUED, { transactionId });
    res.json({ success: true, message: "Refund initiated" });
  } catch (err) {
    logger.error("Error issuing refund:", err.message);
    res.status(500).json({ error: "Failed to issue refund" });
  }
};
