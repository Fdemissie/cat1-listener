const SimulationOrchestrator = require('./simulators/SimulationOrchestrator');
const orchestrator = new SimulationOrchestrator();

// Load and run scenario
orchestrator.loadScenario('./test/scenarios/basic-flow.json')
  .runAutomatedTest();

// For manual testing
process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  const [command, deviceId, ...args] = input.split(' ');
  
  const device = orchestrator.getDevice(deviceId);
  if (!device) return console.log('Device not found');

  switch (command) {
    case 'valve':
      device.connection.write(cbor.encode({
        command: 'valve_control',
        action: args[0] || 'toggle'
      }));
      break;
      
    case 'firmware':
      device.connection.write(cbor.encode({
        command: 'firmware_update',
        version: args[0] || '1.1.0',
        url: 'http://example.com/firmware.bin'
      }));
      break;
      
    case 'reading':
      device.sendUplink({
        type: 'meter_reading',
        value: Math.floor(Math.random() * 1000),
        unit: 'gal'
      });
      break;
  }
});