import Stripe from "stripe";
import crypto from "crypto";
import { Transaction } from "../models/Transaction.js";
import { Subscription } from "../models/Subscription.js";
import {markTransactionPaid, updateUserAfterPurchase,} from "../services/paymentService.js";
import { WebhookEventLog } from "../models/WebhookEventLog.js";
import Razorpay from "razorpay";
import { log } from "console";
import { User } from "../models/User.js";
import { sendInvoiceEmail } from "../utils/email.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebhook = async (req, res) => {
  console.log("📡 Stripe webhook called");

  const signature = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, endpointSecret);
  } catch (err) {
    console.error("❌ Stripe signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventType = event.type;
  const data = event.data.object;

  // 🧠 Check if this event has already been processed
const existingLog = await WebhookEventLog.findOne({ eventId: event.id });
if (existingLog) {
  console.warn(`⚠️ Duplicate event ${event.id} ignored`);
  return res.status(200).json({ received: true, duplicate: true });
}

// ✅ First time we're seeing this event → save it
await WebhookEventLog.create({
  eventId: event.id,
  type: event.type,
});


  console.log(`📥 Stripe event received: ${eventType}`);

  try {
    switch (eventType) {
      // ✅ One-time payments: songs or albums
      case "payment_intent.succeeded": {
        const metadata = data.metadata || {};
        const transactionId = metadata.transactionId;

        // 🛑 Skip if this is a subscription invoice
        if (data.invoice) {
          console.log("ℹ️ Skipping payment_intent for subscription invoice:", data.id);
          break;
        }

        if (!transactionId) {
          console.warn("⚠️ Missing transactionId in metadata. Skipping.");
          break;
        }

        const transaction = await markTransactionPaid({
          gateway: "stripe",
          paymentIntentId: data.id,
        });

        if (transaction) {
          await updateUserAfterPurchase(transaction, data.id);
          console.log("✅ One-time payment processed:", data.id);
        } else {
          console.warn("⚠️ Transaction not found or already processed:", transactionId);
        }
        break;
      }

      // ✅ Subscription payment succeeded
      case "invoice.payment_succeeded": {
        const subscriptionId = data.subscription;
        const transaction = await markTransactionPaid({
          gateway: "stripe",
          stripeSubscriptionId: subscriptionId,
        });

        if (transaction) {
          await updateUserAfterPurchase(transaction, subscriptionId);
          console.log("✅ Subscription payment succeeded:", subscriptionId);
        } else {
          console.warn("⚠️ No matching transaction for subscription invoice:", subscriptionId);
        }
        break;
      }

      // ❌ Subscription payment failed
      case "invoice.payment_failed": {
        const subscriptionId = data.subscription;
        await Subscription.findOneAndUpdate(
          { externalSubscriptionId: subscriptionId },
          { status: "failed" }
        );
        console.warn("❌ Subscription payment failed:", subscriptionId);
        break;
      }

      // 🚫 Subscription cancelled (manually or due to end of billing)
      case "customer.subscription.deleted": {
        const subscriptionId = data.id;
        await Subscription.findOneAndUpdate(
          { externalSubscriptionId: subscriptionId },
          { status: "cancelled" }
        );
        console.warn("❌ Subscription cancelled by user or Stripe:", subscriptionId);
        break;
      }

      // ❌ One-time payment failed
      case "payment_intent.payment_failed": {
        const paymentIntentId = data.id;

        console.warn("❌ Stripe: Payment failed for PaymentIntent ID:", paymentIntentId);

        const updated = await Transaction.findOneAndUpdate(
          { paymentIntentId },
          { status: "failed" },
          { new: true }
        );

        if (updated) {
          console.log("🟥 Transaction marked as failed:", updated._id);
        } else {
          console.warn("⚠️ Failed transaction not found in DB:", paymentIntentId);
        }
        break;
      }

      default:
        console.log("ℹ️ Unhandled Stripe event:", eventType);
    }
  } catch (err) {
    console.error("❌ Error processing Stripe webhook:", err.message);
  }

  // ✅ Always respond 200 so Stripe doesn’t retry
  res.status(200).json({ received: true });
};


// ---------------------------
// ✅ RAZORPAY WEBHOOK HANDLER
// ---------------------------


export const razorpayWebhook = async (req, res) => {
  console.log("📡 Razorpay webhook called");
  
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer due to express.raw()

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
   

    if (signature !== expectedSignature) {
      console.error("❌ Invalid Razorpay signature");
      return res.status(400).json({ message: "Invalid signature" });
    }

    const eventData = JSON.parse(rawBody.toString());
    const event = eventData.event;
    console.log(`📥 Razorpay event received: ${eventData}`);
    

    if (event === "payment.captured") {
      const paymentEntity = eventData.payload.payment.entity;
      const paymentId = paymentEntity.id;
      const razorpayOrderId = paymentEntity.order_id;
     
      

      // const fullPayment = await razorpay.payments.fetch(paymentId);
      // const paymentEntity = eventData.payload.payment.entity;
      const fullPayment = paymentEntity; 
      let subscriptionId = null;
     
      

      if (fullPayment.invoice_id) {
        const invoice = await razorpay.invoices.fetch(fullPayment.invoice_id);
        subscriptionId = invoice.subscription_id;
      }

      // 🔁 Subscription flow
      if (subscriptionId) {
        const transaction = await markTransactionPaid({
          gateway: "razorpay",
          paymentId,
          subscriptionId,
          razorpayOrderId,
        });

        if (transaction) {
          await updateUserAfterPurchase(transaction, subscriptionId);
          console.log("✅ Subscription activated/renewed");
            if (fullPayment.invoice_id) {
      const invoice = await razorpay.invoices.fetch(fullPayment.invoice_id);

      // send invoice email
      const user = await User.findById(transaction.userId);
      if (user?.email) {
        await sendInvoiceEmail("bilalforwin@gmail.com", invoice);
        console.log("📧 Invoice email sent");
      }
    }
        }

        return res.status(200).json({ status: "subscription processed" });
      }

      // 💳 One-time payment flow
      const { itemType: type, itemId, userId } = fullPayment.notes || {};

      if (!type || !itemId || !userId) {
        console.warn("⚠️ Missing metadata for one-time payment.");
        return res.status(200).send("OK");
      }

      const transaction = await markTransactionPaid({
        gateway: "razorpay",
        paymentId,
        userId,
        itemId,
        type,
        razorpayOrderId,
      });

      if (transaction) {
        await updateUserAfterPurchase(transaction, paymentId);
      
        console.log("✅ One-time purchase completed:", type, itemId);
      }

      return res.status(200).json({ status: "purchase processed" });
    }

    // 🔄 Recurring subscription charge (not used for logic, just logging)
    if (event === "subscription.charged") {
      console.log("🔄 Subscription charged:", eventData.payload.subscription.entity.id);
    }

    // ❌ Subscription ended
    if (event === "subscription.halted" || event === "subscription.completed") {
      await Subscription.findOneAndUpdate(
        { externalSubscriptionId: eventData.payload.subscription.entity.id },
        { status: "cancelled" }
      );
      console.log("❌ Subscription cancelled or completed.");
    }

    return res.status(200).json({ status: "ok" });

  } catch (err) {
    console.error("❌ Webhook processing failed:", err);
    return res.status(500).json({ message: "Something went wrong, please try again later" });
  }
};

