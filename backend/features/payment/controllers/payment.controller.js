// src/features/payment/controllers/payment.controller.js
import * as paymentService from "../services/payment.service.js";
import logger from "../../../core/logger.js";

/**
 * Create a Stripe Payment Intent for purchase or subscription
 */
export const createStripePayment = async (req, res, next) => {
  try {
    const result = await paymentService.createStripePayment(req.body);
    res.json(result);
  } catch (err) {
    logger.error("Error creating Stripe payment:", err.message);
    next(err);
  }
};

/**
 * Create Razorpay Order
 */
export const createRazorpayPayment = async (req, res, next) => {
  try {
    const result = await paymentService.createRazorpayPayment(req.body);
    res.json(result);
  } catch (err) {
    logger.error("Error creating Razorpay payment:", err.message);
    next(err);
  }
};

/**
 * Confirm subscription (internal use after webhook success)
 */
export const confirmSubscription = async (req, res, next) => {
  try {
    const result = await paymentService.confirmSubscription(req.body);
    res.json(result);
  } catch (err) {
    logger.error("Error confirming subscription:", err.message);
    next(err);
  }
};

/**
 * Refund a transaction (admin action)
 */
export const refundTransaction = async (req, res, next) => {
  try {
    const result = await paymentService.refundTransaction(req.body);
    res.json(result);
  } catch (err) {
    logger.error("Error issuing refund:", err.message);
    next(err);
  }
};