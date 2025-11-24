// server.js - Main Caly Server (Updated for Multi-tenancy)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { createServer } = require('http');
const WebSocket = require('ws');
const resolve = require('./utils/moduleResolver');
const logger = require(resolve('utils/logger'));
const db = require(resolve('db/postgres'));
const sessionManager = require(resolve('sessions/CallSessionManager'));

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server, path: '/audio' });

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.raw({ type: 'audio/wav', limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'caly-voice-agent',
    version: '1.0.0',
    agents: {
      total: 14,
      registered: Object.keys(require('./agents/orchestrator').agentRegistry || {}).length
    }
  });
});

// Exotel webhooks
const exotelRoutes = require(resolve('routes/exotel'));
app.post('/webhooks/exotel/call-start', exotelRoutes.handleCallStart);
app.post('/webhooks/exotel/call-end', exotelRoutes.handleCallEnd);
app.post('/webhooks/exotel/recording', exotelRoutes.handleRecording);

// Dashboard API routes
app.use('/api/calls', require(resolve('routes/calls')));
app.use('/api/actions', require(resolve('routes/actions')));
app.use('/api/analytics', require(resolve('routes/analytics')));
app.use('/api/clients', require(resolve('routes/clients'))); // NEW: Multi-tenancy

// WebSocket connection for audio streaming
wss.on('connection', async (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const callId = urlParams.get('callId');
  
  if (!callId) {
    logger.error('WebSocket connection rejected - no callId');
    ws.close();
    return;
  }

  logger.info('WebSocket connection established', { callId });

  try {
    // Get call data
    const call = await db.calls.getById(callId);
    
    if (!call) {
      logger.error('Call not found', { callId });
      ws.close();
      return;
    }

    // Create audio session
    await sessionManager.createSession(callId, call);

    // Handle incoming audio chunks from Exotel
    ws.on('message', async (data) => {
      try {
        const audioChunk = Buffer.from(data);
        sessionManager.processIncomingAudio(callId, audioChunk);
      } catch (error) {
        logger.error('Error processing audio chunk', { 
          callId, 
          error: error.message 
        });
      }
    });

    // Handle session audio output (TTS to send back to Exotel)
    sessionManager.on('audio_output', (data) => {
      if (data.callId === callId && ws.readyState === WebSocket.OPEN) {
        ws.send(data.audioData);
      }
    });

    ws.on('close', async () => {
      logger.info('WebSocket connection closed', { callId });
      await sessionManager.endSession(callId);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { callId, error: error.message });
    });

  } catch (error) {
    logger.error('Error setting up audio session', {
      callId,
      error: error.message
    });
    ws.close();
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  await db.close();
  logger.info('Database connections closed');
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, async () => {
  logger.info(`🚀 Caly server running on ${HOST}:${PORT}`);
  logger.info(`📞 Exotel webhooks ready`);
  logger.info(`🎧 WebSocket audio server on ws://${HOST}:${PORT}/audio`);
  logger.info(`👥 Multi-tenancy enabled - /api/clients`);
  logger.info(`🤖 14 agents registered and ready`);
  
  // Test database connection
  try {
    await db.testConnection();
    logger.info('✅ Database connection successful');
    
    // Log active clients
    const clients = await db.clients.getActive();
    logger.info(`✅ Active clients: ${clients.length}`);
  } catch (error) {
    logger.error('❌ Database connection failed', { error: error.message });
  }
});

module.exports = { app, server, wss };