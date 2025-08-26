// /core/events/eventHandlers.js
import { PAYMENT_EVENTS } from "./eventTypes.js";
import { PaymentEvent, SubscriptionEvent, PurchaseEvent } from "./domainEvents.js";
import { EventDispatcher } from "./eventDispatcher.js";

// Import services (to be implemented / already exist in your services layer)
import { TransactionService } from "../payments/transactionService.js";
import { SubscriptionService } from "../subscriptions/subscriptionService.js";
import { PurchaseService } from "../purchases/purchaseService.js";
import { ArtistService } from "../artists/artistService.js";

// Register all event handlers
export function registerEventHandlers() {
  // ✅ Handle successful payment
  EventDispatcher.on(PAYMENT_EVENTS.PAYMENT_SUCCESS, async (event) => {
    if (!(event instanceof PaymentEvent)) return;

    console.log("Handling PAYMENT_SUCCESS:", event.data);

    await TransactionService.markAsSuccess(event.data.transactionId);

    // If it's a subscription purchase → emit SUBSCRIPTION_CREATED
    if (event.data.type === "subscription") {
      EventDispatcher.emit(
        PAYMENT_EVENTS.SUBSCRIPTION_CREATED,
        new SubscriptionEvent({ userId: event.data.userId, artistId: event.data.artistId })
      );
    }

    // If it's a song/album purchase → emit PURCHASE_COMPLETED
    if (event.data.type === "purchase") {
      EventDispatcher.emit(
        PAYMENT_EVENTS.PURCHASE_COMPLETED,
        new PurchaseEvent({ userId: event.data.userId, itemId: event.data.itemId })
      );
    }
  });

  // ✅ Handle failed payment
  EventDispatcher.on(PAYMENT_EVENTS.PAYMENT_FAILED, async (event) => {
    if (!(event instanceof PaymentEvent)) return;

    console.log("Handling PAYMENT_FAILED:", event.data);
    await TransactionService.markAsFailed(event.data.transactionId);
  });

  // ✅ Handle subscription created
  EventDispatcher.on(PAYMENT_EVENTS.SUBSCRIPTION_CREATED, async (event) => {
    if (!(event instanceof SubscriptionEvent)) return;

    console.log("Handling SUBSCRIPTION_CREATED:", event.data);
    await SubscriptionService.create(event.data.userId, event.data.artistId);
  });

  // ✅ Handle subscription cancelled
  EventDispatcher.on(PAYMENT_EVENTS.SUBSCRIPTION_CANCELLED, async (event) => {
    if (!(event instanceof SubscriptionEvent)) return;

    console.log("Handling SUBSCRIPTION_CANCELLED:", event.data);
    await SubscriptionService.cancel(event.data.userId, event.data.artistId);
  });

  // ✅ Handle subscription expired
  EventDispatcher.on(PAYMENT_EVENTS.SUBSCRIPTION_EXPIRED, async (event) => {
    if (!(event instanceof SubscriptionEvent)) return;

    console.log("Handling SUBSCRIPTION_EXPIRED:", event.data);
    await SubscriptionService.expire(event.data.userId, event.data.artistId);
  });

  // ✅ Handle purchase completed
  EventDispatcher.on(PAYMENT_EVENTS.PURCHASE_COMPLETED, async (event) => {
    if (!(event instanceof PurchaseEvent)) return;

    console.log("Handling PURCHASE_COMPLETED:", event.data);
    await PurchaseService.addToUserLibrary(event.data.userId, event.data.itemId);
  });

  // ✅ Handle purchase refunded
  EventDispatcher.on(PAYMENT_EVENTS.PURCHASE_REFUNDED, async (event) => {
    if (!(event instanceof PurchaseEvent)) return;

    console.log("Handling PURCHASE_REFUNDED:", event.data);
    await PurchaseService.removeFromUserLibrary(event.data.userId, event.data.itemId);
  });

  // ✅ Handle artist deleted (cascade cleanup)
  EventDispatcher.on("artist.deleted", async (event) => {
    console.log("Handling ARTIST_DELETED:", event.data);
    await ArtistService.deleteCascade(event.data.artistId);
    await SubscriptionService.removeAllForArtist(event.data.artistId);
  });
}
