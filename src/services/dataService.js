const db = require('../config/db');
const logger = require('../utils/logger');

class DataService {
  static async saveRawData(rawPayload, metadata = {}) {
    try {
      const [result] = await db.execute(
        `INSERT INTO raw_meter_data 
         (payload, client_address, received_at)
         VALUES (?, ?, NOW())`,
        [
          rawPayload || null,
          metadata.clientId || null
        ]
      );
      
      return { id: result.insertId };
    } catch (error) {
      logger.error('Raw data save failed:', error);
      throw error;
    }
  }

  static async saveNormalizedData(normalized, context = {}) {
    try {
      const [result] = await db.execute(
        `INSERT INTO meter_readings 
         (raw_data_id, device_id, meter_reading, battery_level, 
          valve_status, additional_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          context.rawRecordId || null,
          normalized.deviceId || null,
          normalized.meterReading !== undefined ? normalized.meterReading : null,
          normalized.batteryLevel !== undefined ? normalized.batteryLevel : null,
          normalized.valveStatus !== undefined ? normalized.valveStatus : null,
          JSON.stringify(normalized.rawData || {})
        ]
      );
      
      return { id: result.insertId };
    } catch (error) {
      logger.error('Normalized data save failed:', {
        error: error.message,
        sqlState: error.sqlState,
        query: error.sql
      });
      throw error;
    }
  }
}

module.exports = DataService;