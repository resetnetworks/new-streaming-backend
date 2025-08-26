import Transaction from "../models/transaction.model.js";
import logger from "../../../core/logger.js";

/**
 * Handles refund issued events.
 * Marks the transaction as refunded in the database.
 * Optionally, you can remove access from user here in future.
 * @param {Object} payload
 * @param {string} payload.transactionId - ID of the refunded transaction
 */
export async function handleRefundIssued({ transactionId }) {
  try {
    logger.info(`Processing REFUND_ISSUED for transaction: ${transactionId}`);

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      logger.warn(`Transaction ${transactionId} not found`);
      return;
    }

    transaction.status = "refunded";
    await transaction.save();

    // TODO: Optionally remove song/album access or expire subscription early

    logger.info(`Transaction ${transactionId} marked as refunded`);
  } catch (err) {
    logger.error(`Error in handleRefundIssued: ${err.message}`);
  }
}
