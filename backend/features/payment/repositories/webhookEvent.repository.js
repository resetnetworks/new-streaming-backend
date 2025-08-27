// features/payment/repositories/webhookEvent.repository.js
import {WebhookEventLog} from "../models/webhookEvent.model.js";

export const saveWebhookEvent = async (eventData) => {
  return await WebhookEvent.create(eventData);
};

export const findWebhookEventById = async (eventId) => {
  return await WebhookEvent.findOne({ eventId }).lean();
};
