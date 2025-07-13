const { parsePayload } = require('../utils/payloadParser');
const { saveRawData } = require('../services/dataService');
const logger = require('../utils/logger');

async function processMeterData(rawData, metadata = {}) {
  try {
    // Step 1: Save raw payload
    const rawRecord = await saveRawData(rawData, metadata);
    
    // Step 2: Parse payload (now implemented)
    const parsed = await parsePayload(rawData);
    
    // Step 3: Determine meter type
    const meterType = determineMeterType(parsed);
    const decoder = getDecoderForType(meterType);
    
    // Step 4: Process with appropriate decoder
    return await decoder.process(parsed, {
      rawRecordId: rawRecord.id,
      ...metadata
    });
  } catch (error) {
    logger.error('Data processing failed:', error);
    throw error;
  }
}

function determineMeterType(parsedData) {
  // Implement your type detection logic here
  // Example: Check for specific fields or structure
  if (parsedData.serial_number) return 'type1';
  if (parsedData.deviceEUI) return 'type2';
  return 'unknown';
}

function getDecoderForType(type) {
  try {
    return require(`./decoders/${type}Decoder`);
  } catch {
    return require('./decoders/baseDecoder');
  }
}

module.exports = { processMeterData };