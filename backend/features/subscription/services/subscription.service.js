// features/subscription/services/subscription.service.js
import { paymentService } from "../../payment/services/payment.service.js";
import {Transaction} from "../../payment/models/transaction.model.js";
import {Artist} from "../../../models/Artist.js";

export const subscriptionService ={
 initiateSubscription : async (userId, artistId) => {
  const artist = await Artist.findById(artistId).lean();
  if (!artist) throw new Error("Artist not found");

  const amount = calculatePlatformFee(artist.subscriptionPrice);

  // 1️⃣ create transaction
  const transaction = await Transaction.create({
    user: userId,
    artist: artistId,
    type: "subscription",
    amount,
    status: "pending",
  });

  // 2️⃣ call payment service
  const paymentInfo = await paymentService.createPaymentOrder({
    userId,
    artistId,
    transactionId: transaction._id,
    amount,
    type: "subscription",
  });

  return paymentInfo; // client gets order/session info
},
}
