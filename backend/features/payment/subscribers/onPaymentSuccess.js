import Transaction from "../models/transaction.model.js";
import User from "../../user/user.model.js";
import Subscription from "../models/subscription.model.js";
import logger from "../../../core/logger.js";

/**
 * Handles payment success events.
 * Updates transaction status, user purchases, and subscriptions.
 * @param {Object} payload
 * @param {string} payload.transactionId - ID of the transaction
 * @param {string} payload.userId - ID of the user who made the payment
 * @param {Object} payload.metadata - Metadata about purchase type/item
 */
export async function handlePaymentSuccess({ transactionId, userId, metadata }) {
  try {
    logger.info(`Processing PAYMENT_SUCCEEDED for transaction: ${transactionId}`);

    // ✅ Fetch transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      logger.warn(`Transaction ${transactionId} not found`);
      return;
    }
    if (transaction.status === "success") {
      logger.warn(`Transaction ${transactionId} already processed`);
      return;
    }

    // ✅ Mark transaction as success
    transaction.status = "success";
    await transaction.save();

    // ✅ Fetch user
    const user = await User.findById(userId);
    if (!user) {
      logger.error(`User not found for transaction ${transactionId}`);
      return;
    }

    // ✅ Update user purchases/subscriptions
    switch (metadata.type) {
      case "song":
        user.purchasedSongs = user.purchasedSongs || [];
        if (!user.purchasedSongs.includes(metadata.itemId)) {
          user.purchasedSongs.push(metadata.itemId);
        }
        break;

      case "album":
        user.purchasedAlbums = user.purchasedAlbums || [];
        if (!user.purchasedAlbums.includes(metadata.itemId)) {
          user.purchasedAlbums.push(metadata.itemId);
        }
        break;

      case "artist-subscription":
        const sub = new Subscription({
          user: user._id,
          artist: metadata.itemId,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        });
        await sub.save();
        break;

      default:
        logger.warn(`Unknown metadata type: ${metadata.type}`);
    }

    // ✅ Save user updates
    await user.save();
    logger.info(`User ${userId} updated successfully after transaction ${transactionId}`);
  } catch (err) {
    logger.error(`Error in handlePaymentSuccess: ${err.message}`);
  }
}
