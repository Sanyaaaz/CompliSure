const log = (level, moduleName, message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] [${moduleName}] ${message}`, Object.keys(data).length ? JSON.stringify(data) : '');
};

module.exports = {
  info: (moduleName, message, data) => log('info', moduleName, message, data),
  warn: (moduleName, message, data) => log('warn', moduleName, message, data),
  error: (moduleName, message, data) => log('error', moduleName, message, data),
  debug: (moduleName, message, data) => log('debug', moduleName, message, data),
};
