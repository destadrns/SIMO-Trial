function emit(level, message, fields = {}) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'simo-backend',
    environment: process.env.NODE_ENV || 'development',
    ...fields,
  };
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

export const logger = {
  info: (message, fields) => emit('info', message, fields),
  error: (message, fields) => emit('error', message, fields),
};
