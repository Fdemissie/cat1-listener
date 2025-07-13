const ValveController = require('./ValveController');
const FirmwareUpdater = require('./FirmwareUpdater');
const ConfigManager = require('./ConfigManager');

const controllers = {
  valve: new ValveController(),
  firmware: new FirmwareUpdater(),
  config: new ConfigManager()
};

async function handleDownlinkCommand(command) {
  try {
    // Determine controller type based on command
    let controller;
    if (command.type.includes('valve')) {
      controller = controllers.valve;
    } else if (command.type.includes('firmware')) {
      controller = controllers.firmware;
    } else if (command.type.includes('config')) {
      controller = controllers.config;
    } else {
      throw new Error(`Unknown command type: ${command.type}`);
    }

    return await controller.execute(command);
  } catch (error) {
    console.error(`Command execution failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  handleDownlinkCommand,
  ...controllers
};