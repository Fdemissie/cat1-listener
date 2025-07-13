const assert = require('assert');
const SimulationOrchestrator = require('./simulators/SimulationOrchestrator');
const db = require('../src/config/db');

describe('End-to-End Simulation', () => {
  let orchestrator;
  
  before(() => {
    orchestrator = new SimulationOrchestrator();
    orchestrator.loadScenario('./test/scenarios/basic-flow.json').startAll();
  });
  
  after(() => {
    orchestrator.stopAll();
  });
  
  it('should process uplink messages', (done) => {
    const device = orchestrator.getDevice('water-meter-001');
    device.on('uplink-sent', (message) => {
      if (message.type === 'initial_reading') {
        assert.ok(message.meterValue >= 0);
        done();
      }
    });
    device.sendUplink({ type: 'initial_reading', meterValue: 250 });
  });
  
  it('should handle downlink commands', async () => {
    const device = orchestrator.getDevice('water-meter-001');
    await new Promise((resolve) => {
      device.on('downlink-received', resolve);
      device.connection.write(cbor.encode({
        command: 'valve_control',
        action: 'open'
      }));
    });
    assert.equal(device.state.valveOpen, true);
  });
});