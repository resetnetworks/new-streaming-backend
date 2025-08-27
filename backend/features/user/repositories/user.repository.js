// src/features/user/repositories/user.repository.js
import {User} from "../models/user.model.js";

export const addPurchase = async (userId, metadata, fallbackItemId, historyEntry, session) => {
  const addToSet = {};

  if (metadata.type === "song") {
    addToSet.purchasedSongs = metadata.itemId || fallbackItemId;
  } else if (metadata.type === "album") {
    addToSet.purchasedAlbums = metadata.itemId || fallbackItemId;
  }

  const updateObj = { $push: { purchaseHistory: historyEntry } };
  if (Object.keys(addToSet).length > 0) {
    updateObj.$addToSet = addToSet;
  }

  return User.findByIdAndUpdate(userId, updateObj, { session });
};
