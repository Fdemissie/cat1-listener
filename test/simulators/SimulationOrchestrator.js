const VirtualDevice = require('./VirtualDevice');
const WaterMeterSimulator = require('./WaterMeterSimulator');
const GasMeterSimulator = require('./GasMeterSimulator');
const net = require('net');
const cbor = require('cbor');
const fs = require('fs');

class SimulationOrchestrator {
  constructor() {
    this.devices = new Map();
    this.serverHost = 'localhost';
    this.serverPort = 5684;
    this.maxConnectionAttempts = 3;
  }

  async startAll() {
    const connectionPromises = [];
    this.devices.forEach(device => {
      connectionPromises.push(this.connectWithRetry(device));
    });

    await Promise.all(connectionPromises);
  }

  async connectWithRetry(device, attempt = 1) {
    try {
      await device.connect(this.serverHost, this.serverPort);
    } catch (err) {
      if (attempt <= this.maxConnectionAttempts) {
        const delay = Math.min(1000 * attempt, 5000);
        console.log(`Retrying connection to ${device.deviceId} in ${delay}ms (attempt ${attempt})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connectWithRetry(device, attempt + 1);
      }
      throw err;
    }
  }

  loadScenario(filePath) {
    const scenario = JSON.parse(fs.readFileSync(filePath));
    scenario.devices.forEach(deviceConfig => {
      this.addDevice(deviceConfig);
    });
    return this;
  }

  addDevice(config) {
    let device;

    switch (config.type) {
      case 'water':
        device = new WaterMeterSimulator(config.deviceId);
        break;
      case 'gas':
        device = new GasMeterSimulator(config.deviceId);
        break;
      default:
        device = new VirtualDevice(config.deviceId, config.type);
    }

    Object.assign(device.state, config.initialState || {});

    device.on('connected', () => {
      console.log(`[${config.type.toUpperCase()}] ${config.deviceId} connected`);
      if (config.autoStart) {
        device.startSimulation();
      }
    });

    device.on('uplink-sent', (message) => {
      console.log(`[${config.deviceId}] Uplink:`, message.type);
    });

    device.on('downlink-received', (message) => {
      console.log(`[${config.deviceId}] Downlink:`, message.command);
    });

    this.devices.set(config.deviceId, device);
    return device;
  }

  startAll() {
    this.devices.forEach(device => {
      device.connect(this.serverHost, this.serverPort);
    });
  }

  stopAll() {
    this.devices.forEach(device => device.disconnect());
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  async runAutomatedTest() {
    this.startAll();

    // Send initial readings
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.devices.forEach(device => {
      device.sendUplink({
        type: 'initial_reading',
        meterValue: Math.floor(Math.random() * 1000)
      });
    });

    // Simulate valve command after 3 seconds
    setTimeout(() => {
      const firstDevice = this.devices.values().next().value;
      if (firstDevice) {
        firstDevice.connection.write(cbor.encode({
          command: 'valve_control',
          action: 'open',
          duration: 60
        }));
      }
    }, 3000);
  }
}

module.exports = SimulationOrchestrator;