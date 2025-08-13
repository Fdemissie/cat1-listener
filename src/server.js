require('dotenv').config();
const net = require('net');
const logger = require('./utils/logger');

const PORT = process.env.LISTEN_PORT || 5684;

class MeterServer {
    constructor(port = PORT) {
        this.connectedDevices = new Map();
        this.server = net.createServer(this.handleConnection.bind(this));
        this.port = port;
        this.messageDelimiter = '\n'; // Change this to your protocol's delimiter
        this.gatewayProcessors = require('./gatewayProcessors');
        logger.info(`Server initialized to listen on port ${this.port}`);
        
    }

    handleConnection(socket) {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        let buffer = Buffer.alloc(0);
        let isProcessing = false;

        // Store connection
        this.connectedDevices.set(clientId, socket);
        logger.info(`New connection from ${clientId}`);

        // Configure socket
        socket.setTimeout(30000); // 30 seconds timeout
        socket.setKeepAlive(true, 60000); // Enable keep-alive

        // Data handler - processes data immediately
        socket.on('data', async (chunk) => {
            try {
                // Reset timeout timer on data received
                socket.setTimeout(30000);

                // Append new data to buffer
                buffer = Buffer.concat([buffer, chunk]);
                logger.debug(`Received ${chunk.length} bytes from ${clientId}`);

                // Process complete messages (delimited by this.messageDelimiter)
                let delimiterIndex;
                while ((delimiterIndex = buffer.indexOf(this.messageDelimiter)) !== -1) {
                    const message = buffer.slice(0, delimiterIndex);
                    buffer = buffer.slice(delimiterIndex + Buffer.from(this.messageDelimiter).length);

                    if (message.length > 0) {
                        isProcessing = true;
                        try {
                            const rawData = message.toString('utf8').trim();
                            logger.info(`Processing raw data from ${clientId}:`, { rawData });

                            // Process the message
                            await this.processMeterData(rawData, clientId);
                        } finally {
                            isProcessing = false;
                        }
                    }
                }
            } catch (error) {
                logger.error(`Data handling error for ${clientId}:`, {
                    error: error.message,
                    stack: error.stack,
                    bufferDump: buffer.toString('hex')
                });
            }
        });

        // End handler (client disconnects gracefully)
        socket.on('end', () => {
            logger.info(`Client ${clientId} disconnected gracefully`);
            this.cleanupConnection(clientId);
        });

        // Timeout handler
        socket.on('timeout', () => {
            if (!isProcessing) {
                logger.warn(`Connection timeout for ${clientId}`);
                socket.end(); // Graceful disconnect
            }
        });

        // Error handler
        socket.on('error', (error) => {
            logger.error(`Socket error for ${clientId}:`, {
                error: error.message,
                code: error.code,
                stack: error.stack
            });
            this.cleanupConnection(clientId);
        });

        // Close handler
        socket.on('close', () => {
            logger.debug(`Connection closed for ${clientId}`);
            this.cleanupConnection(clientId);
        });
    }

    async processData(rawData, clientId) {
        try {
            logger.debug(`Raw data from ${clientId}: ${rawData}`);
            
            // Get appropriate processor
            const processor = this.gatewayProcessors.getProcessor(rawData);
            
            if (!processor) {
                logger.error(`No processor found for data from ${clientId}`);
                return;
            }

            // Validate and parse
            if (!processor.validate(rawData)) {
                logger.warn(`Invalid data format from ${clientId}`);
                return;
            }

            const parsedData = processor.parse(rawData);
            
            // Standardized data structure
            const processedPacket = {
                gatewayId: parsedData.metadata.gatewayId,
                deviceType: parsedData.metadata.deviceType,
                timestamp: parsedData.metadata.timestamp,
                measurements: parsedData.measurements,
                raw: parsedData.raw,
                clientInfo: {
                    ip: clientId.split(':')[1],
                    port: clientId.split(':')[2]
                }
            };

            logger.info('Processed data:', processedPacket);
            
            // Send to your data pipeline
            await this.sendToPipeline(processedPacket);
            
        } catch (error) {
            logger.error(`Processing failed for ${clientId}:`, {
                error: error.message,
                rawData: rawData
            });
        }
    }

    async sendToPipeline(data) {
        // Implement your actual data pipeline integration here
        // This could be database storage, message queue, etc.
        console.log('Sending to pipeline:', JSON.stringify(data, null, 2));
    }

    cleanupConnection(clientId) {
        const socket = this.connectedDevices.get(clientId);
        if (socket) {
            try {
                if (!socket.destroyed) {
                    socket.destroy();
                }
            } catch (error) {
                logger.error(`Error cleaning up connection ${clientId}:`, error);
            }
            this.connectedDevices.delete(clientId);
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);

            this.server.listen(this.port, () => {
                this.server.removeListener('error', reject);
                logger.info(`Server listening on port ${this.port}`);
                resolve(this.port);
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            // Clean up all connections
            this.connectedDevices.forEach((socket, clientId) => {
                this.cleanupConnection(clientId);
            });

            this.server.close(() => {
                logger.info('Server stopped');
                resolve();
            });
        });
    }
	async sendDownlinkIfAvailable(socket, deviceId) {
        try {
            const downlinkMessage = await DownlinkService.checkForMessages(deviceId);
            if (downlinkMessage) {
                const encoded = cbor.encode(downlinkMessage);
                socket.write(encoded);
                logger.info(`Sent downlink to ${deviceId}`);
            }
        } catch (error) {
            logger.error(`Downlink failed for ${deviceId}:`, error);
        }
    }

    // New method to send immediate commands
    async sendCommand(deviceId, command) {
        const deviceSocket = this.findDeviceSocket(deviceId);
        if (deviceSocket) {
            const message = {
                timestamp: new Date().toISOString(),
                command,
                ackRequired: true
            };
            deviceSocket.write(cbor.encode(message));
            return true;
        }
        return false;
    }
}

module.exports = MeterServer;
