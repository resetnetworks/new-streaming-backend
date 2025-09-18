import mongoose from "mongoose";
import slugify from "slugify";
import { customAlphabet } from "nanoid";

// Unique 6-character slug suffix
const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

const songSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Song title is required"],
      trim: true,
    },
      slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, "Slug must be lowercase and URL-friendly"],
    },
    duration: {
      type: Number,
      required: true
    },
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artist",
      required: true,
    },
    album: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Album",
      default: null,
    },
    genre: [
      {
        type: String,
        required: true,
        trim: true,
      },
    ],
    coverImage: {
      type: String,
      default: "",
      trim: true,
    },
    albumOnly: {
    type: Boolean,
    default: false, 
    },
    accessType: {
      type: String,
      enum: ["free", "subscription", "purchase-only"],
      default: "subscription",
     },
     basePrice: {
      currency: { type: String },
      amount: { type: Number },
    },
  convertedPrices: [
    { 
      _id:false,
      currency: { type: String },
      amount: { type: Number },
    },],
    audioUrl: {
      type: String,
      required: [true, "Audio URL is required"],
      trim: true,
    },
    // Key used for matching in the HLS completion lambda
    audioKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    releaseDate: {
      type: Date,
      default: Date.now,
    },
    hlsUrl: {
      type: String,
      default: "",
      trim: true,
    },
    hlsReady: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false }
);

// 🔁 Auto-generate slug from title + nanoid (just like album)
songSchema.pre("validate", function (next) {
  if (!this.slug && this.title) {
    const baseSlug = slugify(this.title, { lower: true, strict: true });
    this.slug = `${baseSlug}-${nanoid()}`;
  }
  next();
});

// Indexes for performance
songSchema.index({ genre: 1 });
songSchema.index({ title: 1 });
songSchema.index({ slug: 1 });




export const Song = mongoose.models.Song || mongoose.model("Song", songSchema);
