import mongoose from "mongoose";
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 1000 },
});
export const Counter = mongoose.model("Counter", counterSchema);