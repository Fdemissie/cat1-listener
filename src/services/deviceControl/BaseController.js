const logger = require('../../utils/logger');

class BaseController {
  constructor() {
    this.commandRegistry = new Map();
  }

  async execute(command) {
    const handler = this.commandRegistry.get(command.type);
    if (!handler) {
      throw new Error(`Unsupported command type: ${command.type}`);
    }

    try {
      logger.info(`Executing ${command.type} for device ${command.deviceId}`);
      const result = await handler(command);
      await this.logCommand(command, 'completed');
      return result;
    } catch (error) {
      await this.logCommand(command, 'failed', error.message);
      throw error;
    }
  }

  async logCommand(command, status, error = null) {
    // Implement database logging
  }

  validateCommand(command, requiredFields) {
    for (const field of requiredFields) {
      if (!(field in command)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }
}

module.exports = BaseController;