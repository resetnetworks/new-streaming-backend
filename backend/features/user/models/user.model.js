import mongoose from "mongoose";
import validator from "validator";

const schema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    minlength: [2, "Name must be at least 2 characters long"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    validate: {
      validator: validator.isEmail,
      message: "Please enter a valid email",
    },
  },
  password: {
    type: String,
    minlength: [8, "Password must be at least 8 characters long"],
    select: false,
    required: function () {
      return !this.googleId; // agar Google login hai to password required nahi
    },
  },
  googleId: {
    type: String, // store Google profile id if you want
  },
  facebookId: {
    type: String,
  },
  appleId: {
    type: String,
  },
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpire: {
    type: Date,
  },
  dob: {
    type: Date,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  profileImage: {
    type: String,
    default: "",
  },
  playlist: [
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, "Title cannot exceed 50 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [100, "Description cannot exceed 100 characters"],
    },
     songs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Song",
      }
    ],
  },
],
 likedsong: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Song",
  },
],
  preferredGenres: [
    {
      type: String,
      trim: true,
    },
  ],
  stripeCustomerId: { type: String },

  purchasedSongs: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
    },
  ],
  purchasedAlbums: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Album",
    },
  ],
  purchaseHistory: [
    {
      itemType: {
        type: String,
        enum: ["song", "album","artist-subscription"],
        required: true,
      },
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "purchaseHistory.itemType",
      },
      price: {
        type: Number,
        required: true,
      },
      paymentId: {
        type: String,
        required: true,
      },
      purchasedAt: {
        type: Date,
        default: Date.now,
      },
    },
    
  ],
}, { timestamps: true });



export const User = mongoose.model("User", schema);
