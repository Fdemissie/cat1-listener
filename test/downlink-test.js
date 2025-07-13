const { DownlinkService } = require('../src/services/downlinkService');
const SimulationOrchestrator = require('./simulators/SimulationOrchestrator');

async function testDownlinkFlow() {
  const orchestrator = new SimulationOrchestrator();
  orchestrator.loadScenario('./test/scenarios/basic-flow.json').startAll();

  // Queue a downlink message
  await DownlinkService.queueMessage('water-meter-001', {
    type: 'valve_control',
    command: 'open',
    duration: 30
  });

  // Verify the device receives it
  const device = orchestrator.getDevice('water-meter-001');
  device.on('downlink-received', (message) => {
    console.log('Downlink verification:', message);
    process.exit(0);
  });

  // Timeout if message not received
  setTimeout(() => {
    console.error('Downlink test failed - message not received');
    process.exit(1);
  }, 5000);
}

testDownlinkFlow();