// features/payments/paymentSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axiosInstance from '../../utills/axiosInstance';

// 🎯 Song/Album Purchase (Stripe)
export const initiateStripeItemPayment = createAsyncThunk(
  'payment/initiateStripeItemPayment',
  async ({ itemType, itemId, amount }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/payments/stripe/create-payment`, {
        itemType,
        itemId,
        amount,
      });
      return response.data; // { clientSecret }
    } catch (error) {
      console.log(error.response?.data?.message || 'Item payment failed');
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 🎯 Song/Album Purchase (Razorpay) - NEW
export const initiateRazorpayItemPayment = createAsyncThunk(
  'payment/initiateRazorpayItemPayment',
  async ({ itemType, itemId, amount }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/payments/razorpay/create-order`, {
        itemType,
        itemId,
        amount,
      });
      return response.data; // { success: true, order: razorpayOrder }
    } catch (error) {
      console.log(error.response?.data?.message || 'Razorpay payment failed');
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 🎯 Artist Subscription Setup Intent (Stripe)
export const initiateStripeSetupIntent = createAsyncThunk(
  'payment/initiateStripeSetupIntent',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/subscriptions/setup-intent`);
      return response.data; // { clientSecret }
    } catch (error) {
      console.log(error.response?.data?.message || 'Setup intent failed');
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 🎯 Artist Subscription Payment with Payment Method (Stripe)
export const confirmArtistStripeSubscription = createAsyncThunk(
  'payment/confirmArtistStripeSubscription',
  async ({ artistId, paymentMethodId, address }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/subscriptions/artist/${artistId}`, {
        gateway: 'stripe',
        paymentMethodId,
        ...address, // line1, city, state, postal_code, country
      });
      return response.data; // { clientSecret (optional), subscriptionId }
    } catch (error) {
      console.log(error.response?.data?.message || 'Artist subscription failed');
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// 🎯 Artist Subscription (Razorpay) - NEW
export const initiateRazorpaySubscription = createAsyncThunk(
  'payment/initiateRazorpaySubscription',
  async (artistId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post(`/subscriptions/artist/${artistId}`, {"cycle":"3m",});
      return response.data; // { success: true, subscriptionId }
    } catch (error) {
      console.log(error.response?.data?.message || 'Razorpay subscription failed');
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// ❌ Cancel Artist Subscription (DELETE)
export const cancelArtistSubscription = createAsyncThunk(
  'payment/cancelArtistSubscription',
  async (artistId, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.delete(`/subscriptions/artist/${artistId}`);
      return response.data; // { success: true, message: "Subscription cancelled." }
    } catch (error) {
      console.log(error.response?.data?.message || 'Cancellation failed');
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

const paymentSlice = createSlice({
  name: 'payment',
  initialState: {
    loading: false,
    error: null,
    gateway: null, // 'stripe' | 'razorpay'
    
    // Stripe specific
    clientSecret: null,
    transactionId: null,
    
    // Razorpay specific
    razorpayOrderId: null,
    razorpayOrder: null,
    razorpaySubscriptionId: null,
    
    // General
    cancelMessage: null,
    paymentSuccess: false,
  },
  reducers: {
    resetPaymentState: (state) => {
      state.loading = false;
      state.error = null;
      state.clientSecret = null;
      state.gateway = null;
      state.razorpayOrderId = null;
      state.razorpayOrder = null;
      state.razorpaySubscriptionId = null;
      state.transactionId = null;
      state.cancelMessage = null;
      state.paymentSuccess = false;
    },
    setPaymentGateway: (state, action) => {
      state.gateway = action.payload; // 'stripe' | 'razorpay'
    },
    setPaymentSuccess: (state, action) => {
      state.paymentSuccess = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // 🎵 Stripe Item Payment
      .addCase(initiateStripeItemPayment.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.clientSecret = null;
        state.gateway = 'stripe';
      })
      .addCase(initiateStripeItemPayment.fulfilled, (state, action) => {
        state.loading = false;
        state.clientSecret = action.payload.clientSecret;
        state.gateway = 'stripe';
      })
      .addCase(initiateStripeItemPayment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.clientSecret = null;
      })

      // 🎵 Razorpay Item Payment - NEW
      .addCase(initiateRazorpayItemPayment.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.razorpayOrder = null;
        state.gateway = 'razorpay';
      })
      .addCase(initiateRazorpayItemPayment.fulfilled, (state, action) => {
        state.loading = false;
        state.razorpayOrder = action.payload.order;
        state.razorpayOrderId = action.payload.order?.id || null;
        state.gateway = 'razorpay';
      })
      .addCase(initiateRazorpayItemPayment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.razorpayOrder = null;
      })

      // 💳 Stripe Setup Intent
      .addCase(initiateStripeSetupIntent.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.clientSecret = null;
      })
      .addCase(initiateStripeSetupIntent.fulfilled, (state, action) => {
        state.loading = false;
        state.clientSecret = action.payload.clientSecret;
        state.gateway = 'stripe';
      })
      .addCase(initiateStripeSetupIntent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.clientSecret = null;
      })

      // ✅ Confirm Stripe Subscription
      .addCase(confirmArtistStripeSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.transactionId = null;
      })
      .addCase(confirmArtistStripeSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.transactionId = action.payload.transactionId || null;
        state.clientSecret = action.payload.clientSecret || null;
        state.gateway = 'stripe';
      })
      .addCase(confirmArtistStripeSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.transactionId = null;
      })

      // ✅ Razorpay Subscription - NEW
      .addCase(initiateRazorpaySubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.razorpaySubscriptionId = null;
      })
      .addCase(initiateRazorpaySubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.razorpaySubscriptionId = action.payload.subscriptionId;
        state.gateway = 'razorpay';
      })
      .addCase(initiateRazorpaySubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.razorpaySubscriptionId = null;
      })

      // ❌ Cancel Subscription
      .addCase(cancelArtistSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.cancelMessage = null;
      })
      .addCase(cancelArtistSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.cancelMessage = action.payload.message || 'Subscription cancelled';
      })
      .addCase(cancelArtistSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.cancelMessage = null;
      });
  },
});

export const { resetPaymentState, setPaymentGateway, setPaymentSuccess } = paymentSlice.actions;
export default paymentSlice.reducer;
