// src/features/payment/services/paymentEventService.js
import mongoose from "mongoose";
import logger from "../../../core/logger.js";

import { Transaction } from "../../../models/Transaction.js";
import { User } from "../../../models/User.js";
import { Subscription } from "../../../models/Subscription.js";
import { WebhookEventLog } from "../../../models/WebhookEventLog.js";

/**
 * Production-ready Payment Event Service
 *
 * Handler functions are designed to be:
 *  - idempotent (via WebhookEventLog)
 *  - atomic (using mongoose sessions / transactions)
 *  - safe for retries (throw to allow worker/queue to retry)
 *
 * Expected normalized payload shape for most handlers:
 * {
 *   eventId: "provider-event-id",       // optional but recommended
 *   transactionId: "<mongoId>",        // preferred
 *   userId: "<mongoId>",               // optional if stored on transaction
 *   metadata: { type, itemId, artistId, ... }, // vendor-agnostic metadata
 *   provider: "stripe" | "razorpay",
 *   raw: {...}                         // original provider payload (optional)
 * }
 */

// Local status constants (align with your app)
const STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

// ---------------------------
// Helper: idempotency claim
// ---------------------------
async function claimEvent(eventId, type, raw = {}) {
  if (!eventId) return true; // no idempotency if not provided
  try {
    await WebhookEventLog.create({ eventId, type, raw });
    return true; // newly claimed
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key -> already processed
      logger.warn({ eventId, type }, "Event already processed (idempotency).");
      return false;
    }
    // Unexpected DB error
    logger.error({ err, eventId, type }, "Error claiming eventId in WebhookEventLog");
    throw err;
  }
}

// ---------------------------
// Handler: payment succeeded
// ---------------------------
export async function handlePaymentSucceeded(payload = {}) {
  const { eventId, transactionId, userId, metadata = {}, provider, raw } = payload;

  // Try to claim idempotency lock
  const claimed = await claimEvent(eventId, "payment.succeeded", raw);
  if (!claimed) return { alreadyProcessed: true };

  if (!transactionId) {
    // Prefer transactionId; fall back could be implemented (lookups by providerId)
    throw new Error("handlePaymentSucceeded: transactionId is required");
  }

  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      // Atomically mark transaction paid if not already
      const tx = await Transaction.findOneAndUpdate(
        { _id: transactionId, status: { $ne: STATUS.PAID } },
        { $set: { status: STATUS.PAID, paidAt: new Date(), provider, providerPayload: raw } },
        { new: true, session }
      );

      if (!tx) {
        logger.warn({ transactionId }, "Transaction not found or already marked paid");
        result = { alreadyProcessed: true };
        return;
      }

      // Determine the userId either from payload or transaction
      const finalUserId = userId || tx.userId;
      if (!finalUserId) {
        logger.warn({ transactionId }, "No userId available on transaction or payload");
      }

      // Build purchase history entry
      const historyEntry = {
        itemType: metadata.type || tx.itemType,
        itemId: metadata.itemId || tx.itemId,
        price: tx.amount,
        paymentReference: tx._id,
        provider,
        createdAt: new Date()
      };

      // Prepare atomic user update
      const addToSet = {};
      if ((metadata.type === "song") || tx.itemType === "song") {
        addToSet.purchasedSongs = metadata.itemId || tx.itemId;
      } else if ((metadata.type === "album") || tx.itemType === "album") {
        addToSet.purchasedAlbums = metadata.itemId || tx.itemId;
      }

      const updateOps = {};
      if (Object.keys(addToSet).length > 0) updateOps.$addToSet = addToSet;
      updateOps.$push = { purchaseHistory: historyEntry };

      if (finalUserId) {
        await User.findByIdAndUpdate(finalUserId, updateOps, { new: true, session });
      }

      // If subscription purchase, upsert Subscription
      const isSubscription = (metadata.type === "artist-subscription") || tx.itemType === "artist-subscription";
      if (isSubscription) {
        const artistId = metadata.artistId || tx.artistId || metadata.itemId || tx.itemId;
        if (!artistId) {
          logger.warn({ transactionId }, "Subscription payment but missing artistId");
        } else {
          // Default optimistic period of 30 days; try to use provider info if present
          let validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          try {
            if (provider === "stripe" && raw?.current_period_end) {
              validUntil = new Date(Number(raw.current_period_end) * 1000);
            } else if (provider === "razorpay" && raw?.payload?.subscription?.entity?.current_end) {
              validUntil = new Date(Number(raw.payload.subscription.entity.current_end) * 1000);
            }
          } catch (err) {
            logger.debug({ err, transactionId }, "Failed to extract subscription period from provider payload");
          }

          await Subscription.findOneAndUpdate(
            { userId: tx.userId, artistId },
            {
              $set: {
                status: "active",
                validUntil,
                gateway: provider,
                externalSubscriptionId: metadata.externalSubscriptionId || tx.stripeSubscriptionId || tx.razorpaySubscriptionId || null,
                transactionId: tx._id
              },
              $setOnInsert: { createdAt: new Date() }
            },
            { upsert: true, new: true, session }
          );
        }
      }

      result = { ok: true, transaction: tx };
    }); // withTransaction

    return result;
  } catch (err) {
    logger.error({ err, payload }, "handlePaymentSucceeded: transaction failed");
    throw err; // let caller decide retry/dlq
  } finally {
    session.endSession();
  }
}

// ---------------------------
// Handler: payment failed
// ---------------------------
export async function handlePaymentFailed(payload = {}) {
  const { eventId, transactionId, reason, provider, raw } = payload;

  const claimed = await claimEvent(eventId, "payment.failed", raw);
  if (!claimed) return { alreadyProcessed: true };

  if (!transactionId) {
    logger.warn("handlePaymentFailed: transactionId missing");
    return { ok: false, reason: "missing_transactionId" };
  }

  try {
    const updated = await Transaction.findOneAndUpdate(
      { _id: transactionId, status: { $ne: STATUS.FAILED } },
      { $set: { status: STATUS.FAILED, failedAt: new Date(), failureReason: reason, provider } },
      { new: true }
    );

    if (!updated) {
      logger.warn({ transactionId }, "Transaction not found or already failed");
      return { alreadyProcessed: true };
    }

    // Optionally notify user / enqueue retry workflows here

    return { ok: true, transaction: updated };
  } catch (err) {
    logger.error({ err, payload }, "handlePaymentFailed error");
    throw err;
  }
}

// ---------------------------
// Handler: purchase refunded (business-level)
 // payload: { eventId, transactionId, userId, itemId, itemType, provider, raw }
// ---------------------------
export async function handlePurchaseRefunded(payload = {}) {
  const { eventId, transactionId, userId, itemId, itemType, provider, raw } = payload;

  const claimed = await claimEvent(eventId, "purchase.refunded", raw);
  if (!claimed) return { alreadyProcessed: true };

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Mark transaction refunded
      if (transactionId) {
        await Transaction.findOneAndUpdate(
          { _id: transactionId, status: { $ne: STATUS.REFUNDED } },
          { $set: { status: STATUS.REFUNDED, refundedAt: new Date(), provider } },
          { new: true, session }
        );
      }

      // Remove access: remove item from purchased arrays
      const uid = userId;
      if (uid) {
        const update = {};
        if (itemType === "song") {
          update.$pull = { purchasedSongs: itemId };
        } else if (itemType === "album") {
          update.$pull = { purchasedAlbums: itemId };
        }
        // Also add a purchaseHistory refund entry
        const refundEntry = {
          itemType,
          itemId,
          price: 0,
          refundForTransaction: transactionId,
          provider,
          createdAt: new Date(),
        };
        update.$push = { purchaseHistory: refundEntry };

        await User.findByIdAndUpdate(uid, update, { session });
      }
    });

    return { ok: true };
  } catch (err) {
    logger.error({ err, payload }, "handlePurchaseRefunded failed");
    throw err;
  } finally {
    session.endSession();
  }
}

// ---------------------------
// Handler: subscription cancelled (business-level)
// payload: { eventId, userId, artistId, externalSubscriptionId, provider, raw }
// ---------------------------
export async function handleSubscriptionCancelled(payload = {}) {
  const { eventId, userId, artistId, externalSubscriptionId, provider, raw } = payload;

  const claimed = await claimEvent(eventId, "subscription.cancelled", raw);
  if (!claimed) return { alreadyProcessed: true };

  try {
    // Mark subscription as cancelled (soft cancel)
    const filter = externalSubscriptionId ? { externalSubscriptionId } : { userId, artistId };
    const update = { $set: { status: "cancelled", cancelledAt: new Date() } };

    const updated = await Subscription.findOneAndUpdate(filter, update, { new: true });
    if (!updated) {
      logger.warn({ filter }, "Subscription to cancel not found");
    }

    // Optionally: adjust user access (we keep access until validUntil)
    return { ok: true, subscription: updated };
  } catch (err) {
    logger.error({ err, payload }, "handleSubscriptionCancelled failed");
    throw err;
  }
}

// ---------------------------
// Export default grouped service
// ---------------------------
const PaymentEventService = {
  handlePaymentSucceeded,
  handlePaymentFailed,
  handlePurchaseRefunded,
  handleSubscriptionCancelled,
};

export default PaymentEventService;
