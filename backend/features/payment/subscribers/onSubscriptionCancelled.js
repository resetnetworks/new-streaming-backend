// src/features/payment/subscribers/onSubscriptionCancelled.js
import logger from "../../../core/logger.js";

export async function onSubscriptionCancelled({ userId, subscriptionId }) {
  try {
    logger.info(`Subscription ${subscriptionId} cancelled for user ${userId}`);
    // TODO: remove access or notify user
  } catch (err) {
    logger.error(`Error in onSubscriptionCancelled: ${err.message}`);
  }
}
