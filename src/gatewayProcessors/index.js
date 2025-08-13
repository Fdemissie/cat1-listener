const path = require('path');
const fs = require('fs');

const processors = {};

// Auto-load all processor modules
fs.readdirSync(__dirname).forEach(file => {
    if (file !== 'index.js' && file.endsWith('.js')) {
        const processor = require(path.join(__dirname, file));
        processors[processor.gatewayType] = processor;
    }
});

module.exports = {
    getProcessor: (data) => {
        // Detection logic for different gateway formats
        if (data.includes('GW_ID') && data.includes('TYPE:')) {
            return processors['gatewayTypeA'];
        }
        // Add more detection rules for other gateway types
        return processors['default'];
    }
};