// src/features/payment/subscribers/onPaymentSucceeded.js
import Transaction from "../models/transaction.model.js";
import User from "../../user/user.model.js";
import Subscription from "../models/subscription.model.js";
import logger from "../../../core/logger.js";

export async function onPaymentSucceeded({ transactionId, userId, metadata }) {
  try {
    logger.info(`Processing PAYMENT_SUCCEEDED for transaction ${transactionId}`);

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
    logger.error(`Error in onPaymentSucceeded: ${err.message}`);
  }
}
