import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import albumRoutes from "./routes";

dotenv.config();
const app = express();

app.use(express.json());

// Routes
app.use("/api/albums", albumRoutes);

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
