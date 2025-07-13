const { saveNormalizedData } = require('../../services/dataService');
const logger = require('../../utils/logger');

class BaseDecoder {
  static async process(data, context = {}) {
    try {
      // Ensure all values are properly converted to null if undefined
      const processedData = {
        deviceId: data.serial_number || null,
        meterReading: data.meter_reading !== undefined ? data.meter_reading : null,
        batteryLevel: data.battery_level !== undefined ? data.battery_level : null,
        valveStatus: data.valve_status !== undefined ? data.valve_status : null,
        rawData: data.rawData || data
      };

      const result = await saveNormalizedData(processedData, context);
      
      logger.info(`Processed data (${this.type}):`, {
        recordId: result.id,
        clientId: context.clientId
      });
      
      return result;
    } catch (error) {
      logger.error(`Decoder ${this.type} failed:`, error);
      throw error;
    }
  }
}

module.exports = BaseDecoder;