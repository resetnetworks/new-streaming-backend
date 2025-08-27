// src/features/payment/services/payment.service.js

// Section: Imports
import mongoose from "mongoose";
import Stripe from "stripe";
import Razorpay from "razorpay";
import logger from "../../../core/logger.js";
0
import * as TransactionRepo from "../repositories/transaction.repository.js";
import * as UserRepo from "../../user/repositories/user.repository.js"; 
import * as SubscriptionRepo from "../../subscription/repositories/subscription.repository.js";
import * as WebhookRepo from "../repositories/webhookEvent.repository.js";

import { PAYMENT_EVENTS } from "../../../core/events/eventTypes.js";
import eventDispatcher from "../../../core/events/eventDispatcher.js";

// Providers
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ---------------- INITIATION ----------------
export async function createStripePayment({ userId, amount, currency, itemId, itemType }) {
  const transaction = await TransactionRepo.create({
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

  eventDispatcher.dispatch(PAYMENT_EVENTS.PAYMENT_INITIATED, { provider: "stripe", transaction });

  return { clientSecret: paymentIntent.client_secret, transactionId: transaction._id };
}

export async function createRazorpayPayment({ userId, amount, currency, itemId, itemType }) {
  const transaction = await TransactionRepo.create({
    user: userId,
    itemId,
    itemType,
    provider: "razorpay",
    amount,
    currency,
    status: "pending",
  });

  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt: transaction._id.toString(),
    notes: {
      transactionId: transaction._id.toString(),
      userId,
      metadata: JSON.stringify({ itemId, type: itemType }),
    },
  });

  eventDispatcher.dispatch(PAYMENT_EVENTS.PAYMENT_INITIATED, { provider: "razorpay", transaction });

  return { orderId: order.id, transactionId: transaction._id };
}

export async function confirmSubscription({ userId, artistId }) {
  eventDispatcher.dispatch(PAYMENT_EVENTS.SUBSCRIPTION_CREATED, { userId, artistId });
  return { success: true, message: "Subscription confirmed" };
}

export async function refundTransaction({ transactionId }) {
  const transaction = await TransactionRepo.findById(transactionId);
  if (!transaction) return { success: false, error: "Transaction not found" };

  if (transaction.provider === "stripe") {
    await stripe.refunds.create({ payment_intent: transaction.providerPaymentId });
  } else if (transaction.provider === "razorpay") {
    await razorpay.payments.refund(transaction.providerPaymentId);
  }

  eventDispatcher.dispatch(PAYMENT_EVENTS.REFUND_ISSUED, { transactionId });
  return { success: true, message: "Refund initiated" };
}

// ---------------- SETTLEMENT (webhook-driven) ----------------
export async function handlePaymentSuccess(payload = {}) {
  const { eventId, transactionId, metadata = {}, provider, raw } = payload;

  if (eventId) {
    const logged = await WebhookRepo.logEvent(eventId, "payment_succeeded", raw);
    if (!logged.ok) return { alreadyProcessed: true };
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      if (!transactionId) throw new Error("Missing transactionId in payment success payload");

      const tx = await TransactionRepo.markAsPaid(transactionId, provider, raw, session);
      if (!tx) {
        logger.warn({ transactionId }, "Transaction not found or already paid");
        result = { alreadyProcessed: true };
        return;
      }

      // User history update
      const historyEntry = {
        itemType: metadata.type,
        itemId: metadata.itemId || tx.itemId,
        price: tx.amount,
        paymentReference: tx._id,
        provider,
        createdAt: new Date(),
      };
      await UserRepo.addPurchase(tx.userId, metadata, tx.itemId, historyEntry, session);

      // Subscription
      if ((metadata.type === "artist-subscription") || tx.itemType === "artist-subscription") {
        const artistId = metadata.artistId || tx.artistId || metadata.itemId || tx.itemId;
        if (artistId) {
          let validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          if (provider === "stripe" && raw?.current_period_end) {
            validUntil = new Date(raw.current_period_end * 1000);
          } else if (provider === "razorpay" && raw?.payload?.subscription?.entity?.current_end) {
            validUntil = new Date(raw.payload.subscription.entity.current_end * 1000);
          }

          await SubscriptionRepo.upsertSubscription(
            tx.userId,
            artistId,
            validUntil,
            provider,
            metadata.externalSubscriptionId ||
              tx.stripeSubscriptionId ||
              tx.razorpaySubscriptionId,
            tx._id,
            session
          );
        }
      }
      result = { ok: true, transaction: tx };
    });

    return result;
  } finally {
    session.endSession();
  }
}

export async function handlePaymentFailed(payload = {}) {
  const { eventId, transactionId, reason, provider, raw } = payload;

  if (eventId) {
    const logged = await WebhookRepo.logEvent(eventId, "payment_failed", raw);
    if (!logged.ok) return { alreadyProcessed: true };
  }

  if (!transactionId) {
    logger.warn("handlePaymentFailed called without transactionId");
    return { ok: false, reason: "missing_transactionId" };
  }

  const tx = await TransactionRepo.markAsFailed(transactionId, reason, provider);
  if (!tx) {
    logger.warn({ transactionId }, "Transaction not found or already failed");
    return { alreadyProcessed: true };
  }

  return { ok: true, transaction: tx };
}


export const paymentService = {
  createStripePayment,
  createRazorpayPayment,
  confirmSubscription,
  refundTransaction,
  handlePaymentSuccess,
  handlePaymentFailed,
};