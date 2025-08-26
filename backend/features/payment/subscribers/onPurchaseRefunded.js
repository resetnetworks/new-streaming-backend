// src/features/payment/subscribers/onPurchaseRefunded.js
import logger from "../../../core/logger.js";

export async function onPurchaseRefunded({ userId, transactionId }) {
  try {
    logger.info(`Purchase refunded for user ${userId}, transaction ${transactionId}`);
    // TODO: reverse access (remove song/album/subscription)
  } catch (err) {
    logger.error(`Error in onPurchaseRefunded: ${err.message}`);
  }
}

