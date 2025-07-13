const net = require('net');
const cbor = require('cbor');
const EventEmitter = require('events');
const { setTimeout: wait } = require('timers/promises');

class VirtualDevice extends EventEmitter {
  constructor(deviceId, type) {
    super();
    this.deviceId = deviceId;
    this.type = type;
    this.connection = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // ms
    this.isConnected = false;
    this.connectionTimeout = 10000; // 10 seconds
    this.state = {
      valveOpen: false,
      batteryLevel: 100,
      firmwareVersion: '1.0.0'
    };
  }

  async connect(host, port) {
    this.host = host;
    this.port = port;
    await this.attemptConnection();
  }

  async attemptConnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('connection-failed', new Error('Max reconnection attempts reached'));
      return;
    }

    try {
      this.connection = net.createConnection({
        host: this.host,
        port: this.port,
        timeout: this.connectionTimeout
      });

      // Connection established
      this.connection.on('connect', () => {
        this.reconnectAttempts = 0;
        this.isConnected = true;
        this.emit('connected');
        this.startHeartbeat();
      });

      // Handle data
      this.connection.on('data', (data) => this.handleDownlink(data));

      // Handle connection errors
      this.connection.on('error', (err) => {
        this.isConnected = false;
        if (err.code === 'ECONNRESET') {
          this.emit('connection-reset');
        } else {
          this.emit('connection-error', err);
        }
        this.scheduleReconnection();
      });

      // Handle connection close
      this.connection.on('close', () => {
        this.isConnected = false;
        this.emit('disconnected');
        this.scheduleReconnection();
      });

    } catch (err) {
      this.emit('connection-error', err);
      this.scheduleReconnection();
    }
  }

  async scheduleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

      await wait(delay);
      await this.attemptConnection();
    }
  }

  sendUplink(payload) {
    if (!this.isConnected) {
      this.emit('error', new Error('Cannot send uplink - not connected'));
      return false;
    }

    try {
      const message = {
        deviceId: this.deviceId,
        timestamp: new Date().toISOString(),
        ...payload
      };

      const encoded = cbor.encode(message);
      this.connection.write(encoded);
      this.emit('uplink-sent', message);
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendUplink({
        type: 'heartbeat',
        battery: this.state.batteryLevel,
        status: 'online'
      });
    }, 30000);
  }

  sendUplink(payload) {
    const message = {
      deviceId: this.deviceId,
      timestamp: new Date().toISOString(),
      ...payload
    };

    const encoded = cbor.encode(message);
    this.connection.write(encoded);
    this.emit('uplink-sent', message);
  }

  async handleDownlink(data) {
    try {
      const message = await cbor.decodeFirst(data);
      this.emit('downlink-received', message);

      // Process command
      switch (message.command) {
        case 'valve_control':
          this.state.valveOpen = message.action === 'open';
          this.sendUplink({
            type: 'valve_status',
            valveOpen: this.state.valveOpen
          });
          break;

        case 'firmware_update':
          await this.simulateFirmwareUpdate(message);
          break;

        default:
          this.sendUplink({
            type: 'error',
            message: 'Unknown command'
          });
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  async simulateFirmwareUpdate(message) {
    this.emit('firmware-update-started', message.version);

    // Simulate download and install
    await new Promise(resolve => setTimeout(resolve, 2000));
    this.state.firmwareVersion = message.version;

    this.sendUplink({
      type: 'firmware_update_complete',
      version: message.version,
      success: true
    });
  }

  disconnect() {
    clearInterval(this.heartbeatInterval);
    if (this.connection) this.connection.end();
  }
}

module.exports = VirtualDevice;