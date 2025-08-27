// features/subscription/controllers/subscription.controller.js
import  {subscriptionService}  from "../services/subscription.service.js";

export const initiateArtistSubscription = async (req, res, next) => {
  try {
    const { artistId } = req.params;
    const userId = req.user._id;

    // delegate to service (which calls payment internally)
    const paymentInfo = await subscriptionService.initiateSubscription(userId, artistId);

    res.status(200).json(paymentInfo);
  } catch (err) {
    next(err);
  }
};
