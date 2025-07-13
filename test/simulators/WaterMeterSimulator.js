const VirtualDevice = require('./VirtualDevice');
const { randomInt } = require('crypto');

class WaterMeterSimulator extends VirtualDevice {
  constructor(deviceId) {
    super(deviceId, 'water');
    this.state = {
      ...this.state,
      flowRate: 0,          // gallons per minute
      totalVolume: 0,       // total gallons
      pressure: 50,         // psi
      leakDetected: false
    };
    this.usagePatterns = [
      { duration: 30000, flowRate: 2 },  // Normal usage
      { duration: 5000, flowRate: 12 },  // Shower
      { duration: 10000, flowRate: 5 }   // Dishwasher
    ];
    this.currentPattern = 0;
  }

  startSimulation() {
    // Simulate water usage patterns
    this.usageInterval = setInterval(() => {
      this.simulateUsage();
      this.currentPattern = 
        (this.currentPattern + 1) % this.usagePatterns.length;
    }, 40000);

    // Random leak detection
    setInterval(() => {
      if (Math.random() < 0.01) { // 1% chance of leak
        this.state.leakDetected = true;
        this.sendAlert('leak_detected');
      }
    }, 60000);

    return this;
  }

  simulateUsage() {
    const pattern = this.usagePatterns[this.currentPattern];
    this.state.flowRate = pattern.flowRate;
    
    // Gradually increase total volume
    const volumeInterval = setInterval(() => {
      this.state.totalVolume += this.state.flowRate / 60; // per second
    }, 1000);

    setTimeout(() => {
      clearInterval(volumeInterval);
      this.state.flowRate = 0;
    }, pattern.duration);
  }

  sendAlert(type) {
    this.sendUplink({
      type: 'alert',
      alertType: type,
      severity: 'high',
      ...this.state
    });
  }

  async handleDownlink(data) {
    await super.handleDownlink(data);
    
    // Water-meter specific commands
    const message = await cbor.decodeFirst(data);
    if (message.command === 'calibrate') {
      this.simulateCalibration(message);
    }
  }

  simulateCalibration(message) {
    this.sendUplink({
      type: 'calibration_start',
      parameters: message.parameters
    });

    setTimeout(() => {
      this.sendUplink({
        type: 'calibration_complete',
        success: true,
        newCalibration: {
          factor: 0.98 + Math.random() * 0.04,
          offset: -0.1 + Math.random() * 0.2
        }
      });
    }, 3000);
  }
}

module.exports = WaterMeterSimulator;