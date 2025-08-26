// src/features/payment/subscribers/onSubscriptionCreated.js
import { sendSubscriptionEmail } from "../handlers/subscriptionHandler.js";
import logger from "../../../core/logger.js";

export async function onSubscriptionCreated({ userId, artistId }) {
  try {
    await sendSubscriptionEmail(userId, artistId);
    logger.info(`Subscription email sent to user ${userId} for artist ${artistId}`);
  } catch (err) {
    logger.error(`Error in onSubscriptionCreated: ${err.message}`);
  }
}
