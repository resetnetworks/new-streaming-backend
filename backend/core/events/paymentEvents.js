// src/features/payment/events/paymentEvents.js
import eventDispatcher from "../../../core/events/eventDispatcher.js";
import { PAYMENT_EVENTS } from "./eventTypes.js";
import { sendSubscriptionEmail } from "../handlers/subscriptionHandler.js";
import { updatePurchaseHistory } from "../handlers/purchaseHandler.js";
import Transaction from "../models/transaction.model.js";
import User from "../../user/user.model.js";
import Subscription from "../models/subscription.model.js";
import logger from "../../../core/logger.js";

/**
 * Register all payment-related event listeners
 */
export function registerPaymentEvents() {
  // SUBSCRIPTION_CREATED
  eventDispatcher.subscribe(PAYMENT_EVENTS.SUBSCRIPTION_CREATED, async ({ userId, artistId }) => {
    try {
      await sendSubscriptionEmail(userId, artistId);
    } catch (err) {
      logger.error(`Error handling SUBSCRIPTION_CREATED: ${err.message}`);
    }
  });

  // SUBSCRIPTION_CANCELLED
  eventDispatcher.subscribe(PAYMENT_EVENTS.SUBSCRIPTION_CANCELLED, async ({ userId, subscriptionId }) => {
    try {
      logger.info(`Subscription ${subscriptionId} cancelled for user ${userId}`);
      // TODO: remove access or notify user
    } catch (err) {
      logger.error(`Error handling SUBSCRIPTION_CANCELLED: ${err.message}`);
    }
  });

  // PURCHASE_COMPLETED
  eventDispatcher.subscribe(PAYMENT_EVENTS.PURCHASE_COMPLETED, async ({ userId, itemId, itemType }) => {
    try {
      await updatePurchaseHistory(userId, itemId, itemType);
    } catch (err) {
      logger.error(`Error handling PURCHASE_COMPLETED: ${err.message}`);
    }
  });

  // PURCHASE_REFUNDED
  eventDispatcher.subscribe(PAYMENT_EVENTS.PURCHASE_REFUNDED, async ({ userId, transactionId }) => {
    try {
      logger.info(`Purchase refunded for user ${userId}, tx ${transactionId}`);
      // TODO: reverse access (remove song/album/sub)
    } catch (err) {
      logger.error(`Error handling PURCHASE_REFUNDED: ${err.message}`);
    }
  });

  // PAYMENT_SUCCEEDED
  eventDispatcher.subscribe(PAYMENT_EVENTS.PAYMENT_SUCCEEDED, async ({ transactionId, userId, metadata }) => {
    try {
      logger.info(`Processing PAYMENT_SUCCEEDED for transaction: ${transactionId}`);

      const transaction = await Transaction.findById(transactionId);
      if (!transaction || transaction.status === "success") {
        logger.warn(`Transaction ${transactionId} already processed or not found`);
        return;
      }

      transaction.status = "success";
      await transaction.save();

      const user = await User.findById(userId);
      if (!user) {
        logger.error(`User not found for transaction ${transactionId}`);
        return;
      }

      if (metadata.type === "song") {
        user.purchasedSongs = user.purchasedSongs || [];
        user.purchasedSongs.push(metadata.itemId);
      } else if (metadata.type === "album") {
        user.purchasedAlbums = user.purchasedAlbums || [];
        user.purchasedAlbums.push(metadata.itemId);
      } else if (metadata.type === "artist-subscription") {
        const sub = new Subscription({
          user: user._id,
          artist: metadata.itemId,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        await sub.save();
      }

      await user.save();
      logger.info(`User ${userId} updated after transaction ${transactionId}`);
    } catch (err) {
      logger.error(`Error in PAYMENT_SUCCEEDED handler: ${err.message}`);
    }
  });

  // PAYMENT_FAILED
  eventDispatcher.subscribe(PAYMENT_EVENTS.PAYMENT_FAILED, async ({ transactionId }) => {
    try {
      logger.warn(`Marking transaction ${transactionId} as failed`);
      await Transaction.findByIdAndUpdate(transactionId, { status: "failed" });
    } catch (err) {
      logger.error(`Error in PAYMENT_FAILED handler: ${err.message}`);
    }
  });

  // REFUND_ISSUED
  eventDispatcher.subscribe(PAYMENT_EVENTS.REFUND_ISSUED, async ({ transactionId }) => {
    try {
      logger.info(`Processing REFUND_ISSUED for transaction ${transactionId}`);
      await Transaction.findByIdAndUpdate(transactionId, { status: "refunded" });
    } catch (err) {
      logger.error(`Error in REFUND_ISSUED handler: ${err.message}`);
    }
  });
}
