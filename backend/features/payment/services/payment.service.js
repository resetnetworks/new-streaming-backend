// src/features/payment/services/paymentService.js
import mongoose from "mongoose";
import logger from "../../../core/logger.js";

import Transaction from "../models/transaction.model.js"; // adapt path if needed
import User from "../../user/user.model.js";
import Subscription from "../models/subscription.model.js";
import WebhookEventLog from "../models/WebhookEventLog.js"; // used for idempotency (you used earlier)

// Constants for statuses used across your app:
const TX_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

/**
 * PaymentService
 *
 * Responsibilities:
 * - Ensure idempotent processing of incoming payment events.
 * - Atomically mark a Transaction as paid/failed and update User / Subscription state.
 * - Keep handlers small and deterministic so they can be retried safely by the worker.
 */
export const PaymentService = {
  /**
   * Handle successful payment events.
   * Expected payload (object):
   * {
   *   eventId: "provider-event-id" (optional, used for idempotency),
   *   transactionId: "<mongoId>" (preferred) OR external reference fields,
   *   userId: "<mongoId>",
   *   metadata: { type: "song"|"album"|"artist-subscription", itemId, artistId, ... },
   *   provider: "stripe"|"razorpay",
   *   raw: {...} // optional raw provider payload
   * }
   */
  async handlePaymentSuccess(payload = {}) {
    const { eventId, transactionId, userId, metadata = {}, provider, raw } = payload;

    // 1) Idempotency: ensure we only process this event once if eventId is provided.
    if (eventId) {
      try {
        // If this insert fails due to duplicate key, we treat event as already processed.
        await WebhookEventLog.create({ eventId, type: "payment_succeeded", raw });
      } catch (err) {
        if (err.code === 11000) {
          logger.warn({ eventId }, "Payment event already processed (idempotency)");
          return { alreadyProcessed: true };
        } else {
          // unexpected DB error
          logger.error({ err, eventId }, "Failed to create WebhookEventLog for idempotency");
          throw err;
        }
      }
    }

    const session = await mongoose.startSession();
    try {
      let result = null;

      await session.withTransaction(async () => {
        // 2) Mark transaction as paid atomically if it's not already paid
        // Preferred: transactionId is provided (created when intent was made).
        // Fallbacks (not implemented here) could lookup by provider-specific ids.
        if (!transactionId) {
          throw new Error("Missing transactionId in payment success payload");
        }

        const tx = await Transaction.findOneAndUpdate(
          { _id: transactionId, status: { $ne: TX_STATUS.PAID } },
          { $set: { status: TX_STATUS.PAID, paidAt: new Date(), provider, providerPayload: raw } },
          { new: true, session }
        );

        if (!tx) {
          // Either not found or already paid
          logger.warn({ transactionId }, "Transaction not found or already marked as paid");
          result = { alreadyProcessed: true };
          return;
        }

        // 3) Update user records atomically based on metadata
        // Use atomic updates ($addToSet, $push) to avoid race conditions
        const userUpdates = { $push: {} };
        const addToSet = {};

        // Always add to purchase history
        const historyEntry = {
          itemType: metadata.type,
          itemId: metadata.itemId || tx.itemId,
          price: tx.amount,
          paymentReference: tx._id,
          provider,
          createdAt: new Date(),
        };

        userUpdates.$push.purchaseHistory = historyEntry;

        if (metadata.type === "song" || tx.itemType === "song") {
          addToSet.purchasedSongs = metadata.itemId || tx.itemId;
        } else if (metadata.type === "album" || tx.itemType === "album") {
          addToSet.purchasedAlbums = metadata.itemId || tx.itemId;
        }

        // Apply $addToSet only if keys exist
        const updateObj = {};
        if (Object.keys(addToSet).length > 0) {
          updateObj.$addToSet = addToSet;
        }
        // Merge push
        updateObj.$push = { purchaseHistory: historyEntry };

        await User.findByIdAndUpdate(tx.userId, updateObj, { session });

        // 4) If it's a subscription purchase, upsert subscription record
        if ((metadata.type === "artist-subscription") || tx.itemType === "artist-subscription") {
          const artistId = metadata.artistId || tx.artistId || metadata.itemId || tx.itemId;
          if (!artistId) {
            logger.warn({ transactionId }, "Subscription payment missing artistId");
          } else {
            // default validUntil - optimistic (will be corrected by periodic sync or provider metadata)
            let validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            // If provider gives a period in raw, try to set accurately (best-effort)
            try {
              // Example: for Stripe, raw may include current_period_end in seconds
              if (provider === "stripe" && raw?.current_period_end) {
                validUntil = new Date(raw.current_period_end * 1000);
              } else if (provider === "razorpay" && raw?.payload?.subscription?.entity?.current_end) {
                // placeholder — adapt as per actual Razorpay payload
                validUntil = new Date(raw.payload.subscription.entity.current_end * 1000);
              }
            } catch (err) {
              logger.debug({ err, transactionId }, "Could not extract period from provider payload");
            }

            await Subscription.findOneAndUpdate(
              { userId: tx.userId, artistId },
              {
                $set: {
                  status: "active",
                  validUntil,
                  gateway: provider,
                  externalSubscriptionId: metadata.externalSubscriptionId || tx.stripeSubscriptionId || tx.razorpaySubscriptionId || null,
                  transactionId: tx._id,
                },
                $setOnInsert: { createdAt: new Date() },
              },
              { upsert: true, new: true, session }
            );
          }
        }

        result = { ok: true, transaction: tx };
      }); // end transaction

      return result;
    } catch (err) {
      logger.error({ err, payload }, "handlePaymentSuccess failed");
      throw err; // allow caller (worker) to decide retry / DLQ
    } finally {
      session.endSession();
    }
  },

  /**
   * Handle failed payments.
   * payload: { eventId, transactionId, userId, reason, provider, raw }
   */
  async handlePaymentFailed(payload = {}) {
    const { eventId, transactionId, reason, provider, raw } = payload;

    // Optional idempotency: record the failure event
    if (eventId) {
      try {
        await WebhookEventLog.create({ eventId, type: "payment_failed", raw });
      } catch (err) {
        if (err.code === 11000) {
          logger.warn({ eventId }, "Payment failed event already processed (idempotency)");
          return { alreadyProcessed: true };
        }
        logger.error({ err, eventId }, "Failed to write WebhookEventLog");
      }
    }

    // Mark transaction as failed (no need for transaction session)
    try {
      if (!transactionId) {
        logger.warn("handlePaymentFailed called without transactionId");
        return { ok: false, reason: "missing_transactionId" };
      }

      const updated = await Transaction.findOneAndUpdate(
        { _id: transactionId, status: { $ne: TX_STATUS.FAILED } },
        { $set: { status: TX_STATUS.FAILED, failedAt: new Date(), failureReason: reason, provider } },
        { new: true }
      );

      if (!updated) {
        logger.warn({ transactionId }, "Transaction not found or already failed");
        return { alreadyProcessed: true };
      }

      // Optionally: notify user, schedule retry, etc.
      return { ok: true, transaction: updated };
    } catch (err) {
      logger.error({ err, payload }, "Error in handlePaymentFailed");
      throw err;
    }
  },
};

export default PaymentService;
