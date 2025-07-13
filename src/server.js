const net = require('net');
const cbor = require('cbor');
const { processMeterData } = require('./processors/meterProcessor');
const logger = require('./utils/logger');

class MeterServer {
    constructor(port = 5684) {  // Default port set here
        this.server = net.createServer(this.handleConnection.bind(this));
        this.port = port;
        logger.info(`Server created (not yet listening) on port ${this.port}`);
    }

    handleConnection(socket) {
        let buffer = Buffer.alloc(0);
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        let isProcessing = false;

        logger.info(`New connection from ${clientId}`);

        // Set timeout for slow clients
        socket.setTimeout(30000); // 30 seconds timeout

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
        });

        socket.on('end', async () => {
            if (buffer.length === 0) {
                logger.warn(`Empty payload from ${clientId}`);
                return;
            }

            isProcessing = true;
            try {
                const rawData = buffer.toString('utf8').trim();
                logger.debug(`Processing data from ${clientId} (${buffer.length} bytes)`);

                await processMeterData(rawData, { clientId });
                logger.info(`Completed processing for ${clientId}`);
            } catch (error) {
                logger.error(`Processing failed for ${clientId}:`, {
                    error: error.message,
                    stack: error.stack
                });
            } finally {
                isProcessing = false;
            }
        });

        socket.on('timeout', () => {
            if (!isProcessing) {
                logger.warn(`Connection timeout for ${clientId}`);
                socket.destroy();
            }
        });

        socket.on('error', (error) => {
            // Ignore ECONNRESET errors (common when client disconnects abruptly)
            if (error.code !== 'ECONNRESET') {
                logger.error(`Socket error with ${clientId}:`, {
                    code: error.code,
                    message: error.message
                });
            } else {
                logger.debug(`Client ${clientId} disconnected abruptly`);
            }
        });

        socket.on('close', () => {
            logger.debug(`Connection closed for ${clientId}`);
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);

            this.server.listen(this.port, () => {
                this.server.removeListener('error', reject);
                logger.info(`Meter server now listening on port ${this.port}`);
                resolve(this.port);
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            this.server.close(() => {
                logger.info(`Server stopped`);
                resolve();
            });
        });
    }
}

module.exports = MeterServer;