// payment/events/paymentEventHandlers.js

import { eventDispatcher } from "./eventDispatcher.js";
import { PAYMENT_EVENTS } from "./eventTypes.js";
import { logger } from "../../utils/logger.js";

// 🛠️ Stubs for actual services (to be implemented later)
import { PaymentService } from "../services/paymentService.js";
import { SubscriptionService } from "../services/subscriptionService.js";
import { PurchaseService } from "../services/purchaseService.js";

// Helper for safe event handling
const handleEvent = async (event, handler) => {
  try {
    logger.info(`[EventHandler] Handling ${event.type}`, { event });

    await handler(event);

    logger.info(`[EventHandler] Successfully handled ${event.type}`, {
      eventId: event.id,
    });
  } catch (error) {
    logger.error(`[EventHandler] Failed to handle ${event.type}`, {
      eventId: event.id,
      error: error.message,
    });
    // In production: maybe retry or send to DLQ
  }
};

// Register all event handlers
export const registerPaymentEventHandlers = () => {
  eventDispatcher.on(PAYMENT_EVENTS.PAYMENT_SUCCESS, (event) =>
    handleEvent(event, PaymentService.handlePaymentSuccess)
  );

  eventDispatcher.on(PAYMENT_EVENTS.PAYMENT_FAILED, (event) =>
    handleEvent(event, PaymentService.handlePaymentFailed)
  );

  eventDispatcher.on(PAYMENT_EVENTS.SUBSCRIPTION_CREATED, (event) =>
    handleEvent(event, SubscriptionService.handleCreated)
  );

  eventDispatcher.on(PAYMENT_EVENTS.SUBSCRIPTION_CANCELLED, (event) =>
    handleEvent(event, SubscriptionService.handleCancelled)
  );

  eventDispatcher.on(PAYMENT_EVENTS.SUBSCRIPTION_EXPIRED, (event) =>
    handleEvent(event, SubscriptionService.handleExpired)
  );

  eventDispatcher.on(PAYMENT_EVENTS.PURCHASE_COMPLETED, (event) =>
    handleEvent(event, PurchaseService.handleCompleted)
  );

  eventDispatcher.on(PAYMENT_EVENTS.PURCHASE_REFUNDED, (event) =>
    handleEvent(event, PurchaseService.handleRefunded)
  );

  logger.info("[EventHandler] Payment event handlers registered");
};
