import fetch from "node-fetch";

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY"];

export async function convertCurrencies(baseCurrency, amount) {
  // Example: FreeCurrencyAPI
  const res = await fetch(`https://api.freecurrencyapi.com/v1/latest?apikey=${process.env.FREECURRENCY_KEY}&base_currency=${baseCurrency}`);
  const data = await res.json();

  return SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).map((currency) => ({
    currency,
    amount: Math.round(amount * data.data[currency]), // round at 2 decimals
  }));
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
