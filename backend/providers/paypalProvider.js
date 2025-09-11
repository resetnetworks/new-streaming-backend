import { createPayPalProduct, createPayPalPlan } from "../utils/getPaypalAccessToken.js";

const SUPPORTED_CURRENCIES = process.env.PAYPAL_SUPPORTED_CURRENCIES?.split(",") || ["USD", "EUR"];

export const paypalProvider = {
  async createPlans(artistName, price, interval_unit, interval_count) {
    const productId = await createPayPalProduct(artistName);
    const plans = await Promise.all(
      SUPPORTED_CURRENCIES.map(async (currency) => {
        const planId = await createPayPalPlan({
          productId,
          price,
          intervalUnit: interval_unit,
          intervalCount: interval_count,
          currency,
        });
        return { currency, paypalPlanId: planId };
      })
    );
    return plans;
  }
};
