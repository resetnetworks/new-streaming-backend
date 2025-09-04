import { Song } from "../models/Song.js";
import { Album } from "../models/Album.js";

export const shapeArtistResponse = async (artist) => {
  const [songCount, albumCount] = await Promise.all([
    Song.countDocuments({ artist: artist._id }),
    Album.countDocuments({ artist: artist._id }),
  ]);

  // Normalize subscriptionPlans to only the fields the frontend needs
  const plans = Array.isArray(artist.subscriptionPlans)
    ? artist.subscriptionPlans.map((p) => ({
        cycle: p.cycle,                 // "1m" | "3m" | "6m" | "12m"
        price: p.price,                 // number
        razorpayPlanId: p.razorpayPlanId, // "plan_..."
        stripePriceId: p.stripePriceId,   // "price_..."
      }))
    : [];

  return {
    _id: artist._id,
    name: artist.name,
    slug: artist.slug,
    image: artist.image,
    location: artist.location,
    bio: artist.bio,
    subscriptionPrice: artist.subscriptionPrice,
    subscriptionPlans: plans, // expose cycles + plan IDs
    songCount,
    albumCount,
    createdAt: artist.createdAt,
    updatedAt: artist.updatedAt,
  };
};

