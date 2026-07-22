import mongoose from 'mongoose';
import path from 'node:path';
import { env } from './env.js';

let embeddedMongo;

async function startEmbeddedMongo() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const dbPath = path.resolve(process.cwd(), env.mongoDataPath);
  embeddedMongo = await MongoMemoryServer.create({
    instance: { dbName: 'instructor_evaluations', dbPath, storageEngine: 'wiredTiger' }
  });
  return embeddedMongo.getUri();
}

export async function connectDb(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  if (uri) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
      return mongoose.connection;
    } catch (error) {
      if (!env.mongoMemoryFallback || env.nodeEnv === 'production' || uri !== env.mongoUri) throw error;
      console.warn(`MongoDB at ${uri} is unavailable; starting the local embedded database.`);
    }
  } else if (!env.mongoMemoryFallback || env.nodeEnv === 'production') {
    throw new Error('MONGO_URI is required when the embedded MongoDB fallback is disabled.');
  }

  const embeddedUri = await startEmbeddedMongo();
  await mongoose.connect(embeddedUri);
  console.log(`Embedded MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (embeddedMongo) {
    await embeddedMongo.stop();
    embeddedMongo = undefined;
  }
}

export function databaseStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    database: mongoose.connection.name || null,
    host: mongoose.connection.host || null,
    embedded: Boolean(embeddedMongo)
  };
}
