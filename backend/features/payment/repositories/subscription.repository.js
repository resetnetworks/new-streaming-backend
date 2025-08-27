// src/features/subscription/repositories/subscription.repository.js
import Subscription from "../models/subscription.model.js";

export const createSubscription = async (data) => {
  return Subscription.create(data);
};

export const findActiveSubscription = async (userId, artistId) => {
  return Subscription.findOne({
    user: userId,
    artist: artistId,
    validUntil: { $gte: new Date() }
  }).lean();
};


export const upsertSubscription = async (
  userId,
  artistId,
  validUntil,
  provider,
  externalSubscriptionId,
  transactionId,
  session
) => {
  return Subscription.findOneAndUpdate(
    { userId, artistId },
    {
      $set: {
        status: "active",
        validUntil,
        gateway: provider,
        externalSubscriptionId,
        transactionId,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true, session }
  );
};
