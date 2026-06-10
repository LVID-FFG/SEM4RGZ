// server/logger.js
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs.txt');

function logMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        data: data || null
    };
    const logString = JSON.stringify(logEntry) + '\n';
    
    try {
        fs.appendFileSync(LOG_FILE, logString);
    } catch (error) {
        console.error('Ошибка записи в лог-файл:', error);
    }
    
    console.log(`[${level}] ${message}`, data || '');
}

const logger = {
    info: (message, data) => logMessage('INFO', message, data),
    warn: (message, data) => logMessage('WARN', message, data),
    error: (message, data) => logMessage('ERROR', message, data),
    debug: (message, data) => logMessage('DEBUG', message, data)
};

module.exports = logger;