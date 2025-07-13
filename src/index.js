#!/usr/bin/env node
require('dotenv').config();
const MeterServer = require('./server');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5684;

async function startServer() {
  try {
    const server = new MeterServer(PORT);
    await server.start();
    
    logger.info(`CAT1 Server running on port ${PORT}`);
    logger.info('Press CTRL+C to stop the server');
    
    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();