// src/features/payment/repositories/transaction.repository.js
import {Transaction} from "../models/transaction.model.js";
import { TX_STATUS } from "../constants/transactionStatus.js";

export const markAsPaid = async (transactionId, provider, raw, session) => {
  return Transaction.findOneAndUpdate(
    { _id: transactionId, status: { $ne: TX_STATUS.PAID } },
    {
      $set: {
        status: TX_STATUS.PAID,
        paidAt: new Date(),
        provider,
        providerPayload: raw,
      },
    },
    { new: true, session }
  );
};

export const markAsFailed = async (transactionId, reason, provider) => {
  return Transaction.findOneAndUpdate(
    { _id: transactionId, status: { $ne: TX_STATUS.FAILED } },
    {
      $set: {
        status: TX_STATUS.FAILED,
        failedAt: new Date(),
        failureReason: reason,
        provider,
      },
    },
    { new: true }
  );
};