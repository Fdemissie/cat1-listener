const BaseDecoder = require('./baseDecoder');
const logger = require('../../utils/logger');

class Type1Decoder extends BaseDecoder {
  static async process(data, context = {}) {
    try {
      // Ensure all required fields have proper values
      const normalized = {
        serial_number: data.serial_number || null,
        meter_reading: typeof data.meter_reading === 'number' ? data.meter_reading : null,
        battery_level: typeof data.battery_level === 'number' ? data.battery_level : null,
        valve_status: typeof data.valve_status === 'number' ? data.valve_status : null,
        rawData: data
      };

      logger.debug(`Normalized type1 data: ${JSON.stringify(normalized)}`);
      
      const result = await super.process(normalized, context);
      return result;
    } catch (error) {
      logger.error(`Type1 decoder failed: ${error.message}`);
      throw error;
    }
  }

  static get type() {
    return 'type1';
  }
}

module.exports = Type1Decoder;