import fetch from "node-fetch";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY"];

import { getCached, setCached } from "../utils/cache.js";
// import { SUPPORTED_CURRENCIES } from "../constants/currencies.js";

export async function convertCurrencies(baseCurrency, amount) {
  const cacheKey = `currencyRates:${baseCurrency}`;

  try {
    // 1. First try fresh API call
    const res = await fetch(
      `https://api.freecurrencyapi.com/v1/latest?apikey=${process.env.FREECURRENCY_KEY}&base_currency=${baseCurrency}`
    );

    if (!res.ok) {
      throw new Error(`Currency API failed: ${res.status}`);
    }

    const data = await res.json();
    const rates = data.data;

    // 2. Save rates to cache (1h TTL)
    await setCached(cacheKey, rates, 3600);

    // 3. Return computed conversions
    return SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).map((currency) => ({
      currency,
      amount: Math.round(amount * rates[currency]),
    }));
  } catch (err) {
    console.error("❌ Currency API failed, falling back to cache:", err.message);

    // 4. Fallback → old cached rates (even if expired)
    const cachedRates = await getCached(cacheKey);
    if (cachedRates) {
      return SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).map((currency) => ({
        currency,
        amount: Math.round(amount * cachedRates[currency]),
      }));
    }

    // 5. If no cache available → fail gracefully
    return SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).map((currency) => ({
      currency,
      amount: null, // or amount unchanged
    }));
  }
}

// utils/currencyConverter.js

// Hardcoded conversion rates (relative to USD)
// const RATES = {
//   EUR: 0.9,    // 1 USD = 0.9 EUR
//   INR: 88.3,   // 1 USD = 88.3 INR
//   GBP: 0.78,   // 1 USD = 0.78 GBP
//   JPY: 146.5,  // 1 USD = 146.5 JPY
//   USD: 1,      // base
// };

// /**
//  * Convert an amount in USD to multiple currencies
//  * @param {number} amountUSD - amount in USD
//  * @param {string[]} targetCurrencies - array of target currency codes
//  * @returns {Array<{ currency: string, amount: number }>}
//  */
// export function convertFromUSD(amountUSD, targetCurrencies = ["EUR", "INR", "GBP", "JPY"]) {
//   return targetCurrencies.map(currency => ({
//     currency,
//     amount: Math.round(amountUSD * RATES[currency]),
//   }));
// }
