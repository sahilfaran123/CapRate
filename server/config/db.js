import mongoose from 'mongoose';
import logger   from '../utils/logger.js';

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');

  await mongoose.connect(uri);

  logger.info('MongoDB connected', {
    host: mongoose.connection.host,
    db:   mongoose.connection.name,
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
};
