module.exports = {
    gatewayType: 'gatewayTypeA',
    
    parse: (rawData) => {
        const result = {};
        const pairs = rawData.split(',');
        
        pairs.forEach(pair => {
            const [key, value] = pair.split(':');
            if (key && value) {
                result[key.trim()] = value.trim();
            }
        });

        // Special processing
        if (result.T) {
            result.temperature = parseFloat(result.T.replace('°C', ''));
        }
        if (result.H) {
            result.humidity = parseFloat(result.H.replace('%', ''));
        }
        
        return {
            metadata: {
                gatewayId: result.GW_ID,
                deviceType: result.TYPE,
                timestamp: result.Time || new Date().toISOString()
            },
            measurements: {
                temperature: result.temperature,
                humidity: result.humidity,
                voltage: parseFloat(result.V?.replace('v', '')),
                rssi: parseInt(result.RSSI?.replace('dBm', '')),
                location: {
                    lat: parseFloat(result.N),
                    lng: parseFloat(result.E)
                }
            },
            raw: rawData // Keep original for reference
        };
    },
    
    validate: (rawData) => {
        return rawData.includes('GW_ID') && 
               rawData.includes('TYPE:') && 
               rawData.includes('STAT:');
    }
};