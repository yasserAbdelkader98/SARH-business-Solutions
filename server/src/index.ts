import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDatabase } from './db.js';

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'unavailable',
    database: connected ? 'connected' : 'disconnected',
  });
});

try {
  await connectDatabase();
  const server = app.listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT}`);
  });
  server.on('error', async (error) => {
    console.error('Server failed:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => { void mongoose.disconnect(); });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error('Startup failed:', error instanceof Error ? error.message : 'Unknown error');
  await mongoose.disconnect();
  process.exitCode = 1;
}
