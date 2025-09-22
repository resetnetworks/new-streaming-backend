import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { Subscription } from "../models/Subscription.js";

const subscriptionDuration = {
  "1m": 30,   // 30 days
  "3m": 90,   // 90 days
  "6m": 180   // 180 days
};
// ✅ Mark transaction as paid
export const markTransactionPaid = async ({
  gateway,
  paymentId,
  razorpayOrderId,
  paymentIntentId,
  stripeSubscriptionId,
  subscriptionId,
}) => {
  let query = {};
  console.log("🔍 Marking transaction as paid:")
console.log({ gateway, paymentId, razorpayOrderId, paymentIntentId, stripeSubscriptionId, subscriptionId });
console.log("Searching with query:", query);
  if (!gateway) {
    console.warn("⚠️ No payment gateway provided. Cannot mark transaction as paid.");
    return null;
  }
  if (gateway === "stripe") {
    if (stripeSubscriptionId) {
      query = { stripeSubscriptionId };
    } else {
      query = { paymentIntentId };
    }
  } else if(gateway === "razorpay") {
    if (subscriptionId) {
      query = { "metadata.razorpaySubscriptionId": subscriptionId };
    } else if (razorpayOrderId) {
      query = { razorpayOrderId };
    } else if (paymentId) {
      query = { paymentId }; 
    }
  }
  else if (gateway === "paypal") {
    if (subscriptionId) {
      query = { "metadata.paypalSubscriptionId": subscriptionId };
    } else if (paymentId) {
      query = { paypalOrderId:paymentId };
    }
  }
console.log("Final query for transaction:", query);

  const transaction = await Transaction.findOne(query);
  console.log("Found transaction:", transaction);
  if (!transaction || transaction.status === "paid") {
    console.warn("⚠️ Transaction not found or already marked as paid");
    
    
    return null;
  }

  transaction.status = "paid";
  await transaction.save();
  return transaction;
};


// ✅ Update user after payment
export const updateUserAfterPurchase = async (transaction, paymentId) => {
  const user = await User.findById(transaction.userId);
  if (!user) {
    console.warn("❌ User not found for transaction:", transaction._id);
    return;
  }

  const alreadyInHistory = user.purchaseHistory.some(
    (p) =>
      p.itemType === transaction.itemType &&
      p.itemId.toString() === transaction.itemId.toString()
  );
   console.log("transaction:", transaction);
  if (!alreadyInHistory) {
    user.purchaseHistory.push({
      itemType: transaction.itemType,
      itemId: transaction.itemId,
      price: transaction.amount,
      amount: transaction.amount,
      currency: transaction.currency,
      paymentId,
    });
  }
  console.log("Updating user purchase history for user:", user);

  switch (transaction.itemType) {
    case "song":
      user.purchasedSongs = user.purchasedSongs || [];
      if (!user.purchasedSongs.includes(transaction.itemId)) {
        user.purchasedSongs.push(transaction.itemId);
      }
      break;

    case "album":
      user.purchasedAlbums = user.purchasedAlbums || [];
      if (!user.purchasedAlbums.includes(transaction.itemId)) {
        user.purchasedAlbums.push(transaction.itemId);
      }
      break;

    case "artist-subscription": {
      const daysToAdd = subscriptionDuration[transaction.metadata?.cycle] || 30;
      let validUntil = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000); // default: +30 days
   const fallbackExternalId =
  transaction.metadata?.externalSubscriptionId || // top priority
  transaction.metadata?.razorpaySubscriptionId || // fallback if above not present
  transaction.metadata?.paypalSubscriptionId 
  transaction.stripeSubscriptionId ||
  transaction.paymentIntentId ||
  transaction.razorpayOrderId ||
  "unknown";


      // 🧠 Try getting real billing period from Stripe
      if (transaction.stripeSubscriptionId) {
        try {
          const stripe = new (await import("stripe")).default(process.env.STRIPE_SECRET_KEY);
          const stripeSub = await stripe.subscriptions.retrieve(transaction.stripeSubscriptionId);
          if (stripeSub?.current_period_end) {
            validUntil = new Date(stripeSub.current_period_end * 1000);
          }
        } catch (err) {
          console.warn("⚠️ Failed to fetch Stripe period:", err.message);
        }
      }
     console.log("Valid until date:", transaction);
      // ✅ Upsert subscription (avoid duplicate key error)
      await Subscription.findOneAndUpdate(
        { userId: transaction.userId, artistId: transaction.artistId },
        {
          status: "active",
          validUntil,
          gateway: transaction.gateway,
          externalSubscriptionId: fallbackExternalId,
          transactionId: transaction._id,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      console.log("✅ Subscription created or updated for artist:", transaction.artistId);
      break;
    }

    default:
      console.warn("⚠️ Unknown itemType:", transaction.itemType);
  }

  await user.save();
  console.log("✅ User updated:", user._id);
  return true;
};
