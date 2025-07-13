const VirtualDevice = require('./VirtualDevice');
const { randomInt } = require('crypto');

class GasMeterSimulator extends VirtualDevice {
  constructor(deviceId) {
    super(deviceId, 'gas');
    this.state = {
      ...this.state,
      flowRate: 0,           // cubic feet per hour
      totalVolume: 0,        // total cubic feet
      temperature: 70,       // °F
      pressure: 0.25,        // psi
      tamperAlert: false
    };
    this.usagePatterns = [
      { duration: 180000, flowRate: 5 },   // Pilot light
      { duration: 30000, flowRate: 25 },   // Stove use
      { duration: 120000, flowRate: 50 }   // Furnace
    ];
    this.currentPattern = 0;
  }

  startSimulation() {
    // Simulate gas usage patterns
    this.usageInterval = setInterval(() => {
      this.simulateUsage();
      this.currentPattern = 
        (this.currentPattern + 1) % this.usagePatterns.length;
    }, 240000);

    // Random tamper detection
    setInterval(() => {
      if (Math.random() < 0.005) { // 0.5% chance of tamper
        this.state.tamperAlert = true;
        this.sendAlert('tamper_detected');
      }
    }, 120000);

    return this;
  }

  simulateUsage() {
    const pattern = this.usagePatterns[this.currentPattern];
    this.state.flowRate = pattern.flowRate;
    
    // Gradually increase total volume
    const volumeInterval = setInterval(() => {
      this.state.totalVolume += this.state.flowRate / 3600; // per second
    }, 1000);

    setTimeout(() => {
      clearInterval(volumeInterval);
      this.state.flowRate = 5; // Return to pilot light flow
    }, pattern.duration);
  }

  sendAlert(type) {
    this.sendUplink({
      type: 'alert',
      alertType: type,
      severity: 'critical',
      ...this.state
    });
  }

  async handleDownlink(data) {
    await super.handleDownlink(data);
    
    // Gas-meter specific commands
    const message = await cbor.decodeFirst(data);
    if (message.command === 'emergency_shutoff') {
      this.simulateShutoff();
    }
  }

  simulateShutoff() {
    this.state.flowRate = 0;
    this.state.valveOpen = false;
    
    this.sendUplink({
      type: 'shutoff_confirmation',
      status: 'complete',
      flowRate: 0,
      valveStatus: 'closed'
    });
  }
}

module.exports = GasMeterSimulator;