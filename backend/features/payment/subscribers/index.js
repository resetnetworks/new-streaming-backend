import eventDispatcher from "../../../core/events/eventDispatcher.js";
import { PAYMENT_EVENTS } from "../events/eventTypes.js";

import { onSubscriptionCreated } from "./onSubscriptionCreated.js";
import { onSubscriptionCancelled } from "./onSubscriptionCancelled.js";
import { onPurchaseCompleted } from "./onPurchaseCompleted.js";
import { onPurchaseRefunded } from "./onPurchaseRefunded.js";
import { onPaymentSucceeded } from "./onPaymentSucceeded.js";
import { onPaymentFailed } from "./onPaymentFailed.js";
import { onRefundIssued } from "./onRefundIssued.js";

/**
 * Register all payment-related event listeners
 */
export function registerPaymentSubscribers() {
  eventDispatcher.subscribe(PAYMENT_EVENTS.SUBSCRIPTION_CREATED, onSubscriptionCreated);
  eventDispatcher.subscribe(PAYMENT_EVENTS.SUBSCRIPTION_CANCELLED, onSubscriptionCancelled);

  eventDispatcher.subscribe(PAYMENT_EVENTS.PURCHASE_COMPLETED, onPurchaseCompleted);
  eventDispatcher.subscribe(PAYMENT_EVENTS.PURCHASE_REFUNDED, onPurchaseRefunded);

  eventDispatcher.subscribe(PAYMENT_EVENTS.PAYMENT_SUCCESS, onPaymentSucceeded);
  eventDispatcher.subscribe(PAYMENT_EVENTS.PAYMENT_FAILED, onPaymentFailed);
  eventDispatcher.subscribe(PAYMENT_EVENTS.REFUND_ISSUED, onRefundIssued);
}
