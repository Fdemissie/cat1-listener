describe('Connection Resilience', () => {
  let simulator;
  
  before(() => {
    simulator = new WaterMeterSimulator('test-meter-001');
  });
  
  it('should handle ECONNRESET errors', async () => {
    const errorPromise = new Promise(resolve => {
      simulator.once('connection-reset', resolve);
    });
    
    // Simulate server disconnection
    simulator.connection.emit('error', new Error('ECONNRESET'));
    
    await errorPromise;
    assert.ok(true); // Test passes if event is handled
  });
  
  it('should attempt reconnection', async () => {
    const reconnectPromise = new Promise(resolve => {
      simulator.once('reconnecting', resolve);
    });
    
    simulator.connection.emit('close');
    const { attempt } = await reconnectPromise;
    assert.equal(attempt, 1);
  });
});