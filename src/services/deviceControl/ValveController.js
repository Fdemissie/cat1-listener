const BaseController = require('./BaseController');
const db = require('../../config/db');

class ValveController extends BaseController {
  constructor() {
    super();
    this.commandRegistry.set('valve_open', this.openValve.bind(this));
    this.commandRegistry.set('valve_close', this.closeValve.bind(this));
    this.commandRegistry.set('valve_set', this.setValve.bind(this));
  }

  async openValve(command) {
    this.validateCommand(command, ['deviceId']);
    // 1. Send command to physical device
    await this.sendToDevice(command.deviceId, { valve: 'open' });
    
    // 2. Update database state
    await db.execute(
      `UPDATE devices 
       SET valve_state = 'open', last_command_at = NOW()
       WHERE device_id = ?`,
      [command.deviceId]
    );
    
    return { success: true };
  }

  async closeValve(command) {
    this.validateCommand(command, ['deviceId']);
    await this.sendToDevice(command.deviceId, { valve: 'close' });
    
    await db.execute(
      `UPDATE devices 
       SET valve_state = 'closed', last_command_at = NOW()
       WHERE device_id = ?`,
      [command.deviceId]
    );
    
    return { success: true };
  }

  async setValve(command) {
    this.validateCommand(command, ['deviceId', 'position']);
    const position = Math.max(0, Math.min(100, command.position));
    
    await this.sendToDevice(command.deviceId, { 
      valve: 'set',
      position: position
    });
    
    await db.execute(
      `UPDATE devices 
       SET valve_position = ?, last_command_at = NOW()
       WHERE device_id = ?`,
      [position, command.deviceId]
    );
    
    return { success: true, position };
  }

  async sendToDevice(deviceId, payload) {
    // Implementation depends on your communication protocol:
    // 1. For direct TCP connections:
    const server = require('../../server').getInstance();
    const success = await server.sendCommand(deviceId, payload);
    
    if (!success) {
      throw new Error('Device not connected');
    }
    
    // 2. For queued commands (MQTT/LoRaWAN/etc):
    // await DownlinkService.queueMessage(deviceId, payload);
  }
}

module.exports = ValveController;