import Transaction from "../models/transaction.model.js";
import logger from "../../../core/logger.js";

/**
 * Handles payment failure events.
 * Marks the transaction as failed in the database.
 * @param {Object} payload
 * @param {string} payload.transactionId - ID of the failed transaction
 */
export async function handlePaymentFailed({ transactionId }) {
  try {
    logger.warn(`Processing PAYMENT_FAILED for transaction: ${transactionId}`);

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      logger.warn(`Transaction ${transactionId} not found`);
      return;
    }

    // Update transaction status to failed
    transaction.status = "failed";
    await transaction.save();

    logger.info(`Transaction ${transactionId} marked as failed`);
  } catch (err) {
    logger.error(`Error in handlePaymentFailed: ${err.message}`);
  }
}
