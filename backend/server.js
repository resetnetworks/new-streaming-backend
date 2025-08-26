// File: server.js
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDb from './database/db.js';
import app from './app.js';
import gracefulShutdown from './middleware/gracefulShutdown.js';

const port = process.env.PORT || 4000;
let server;

const start = async () => {
  try {
    if (!process.env.MONGO_URL || !process.env.PORT) {
      console.error('❌ Missing required environment variables');
      process.exit(1);
    }

    await connectDb();
    server = app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Server running at http://localhosttt:${port}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
gracefulShutdown(server, mongoose);