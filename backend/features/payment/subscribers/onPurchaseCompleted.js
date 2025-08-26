// src/features/payment/subscribers/onPurchaseCompleted.js
import { updatePurchaseHistory } from "../handlers/purchaseHandler.js";
import logger from "../../../core/logger.js";

export async function onPurchaseCompleted({ userId, itemId, itemType }) {
  try {
    await updatePurchaseHistory(userId, itemId, itemType);
    logger.info(`Purchase completed for user ${userId}, item ${itemId}`);
  } catch (err) {
    logger.error(`Error in onPurchaseCompleted: ${err.message}`);
  }
}
