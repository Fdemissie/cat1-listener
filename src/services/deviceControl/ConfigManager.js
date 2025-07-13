// src/services/deviceControl/ConfigManager.js
const BaseController = require('./BaseController');
const db = require('../../config/db');

class ConfigManager extends BaseController {
  constructor() {
    super();
    this.commandRegistry.set('config_update', this.updateConfig.bind(this));
    this.commandRegistry.set('config_reset', this.resetConfig.bind(this));
  }

  async updateConfig(command) {
    this.validateCommand(command, ['deviceId', 'parameters']);
    
    // 1. Validate parameters
    const validParams = this.validateParameters(command.parameters);
    
    // 2. Send to device
    await this.sendToDevice(command.deviceId, {
      type: 'config_update',
      parameters: validParams
    });
    
    // 3. Update database
    await db.execute(
      `UPDATE device_configs
       SET config = ?, updated_at = NOW()
       WHERE device_id = ?`,
      [JSON.stringify(validParams), command.deviceId]
    );
    
    return { success: true };
  }

  validateParameters(params) {
    const validParams = {};
    
    // Validate reporting interval
    if (params.reporting_interval) {
      validParams.reporting_interval = Math.max(
        60, // Minimum 60 seconds
        Math.min(86400, params.reporting_interval) // Maximum 1 day
      );
    }
    
    // Add validation for other parameters...
    
    return validParams;
  }
}

module.exports = ConfigManager;