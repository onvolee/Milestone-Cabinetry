type LogDetails = unknown

const write = (level: 'error' | 'info' | 'warn', message: string, details?: LogDetails) => {
  const output = details === undefined ? message : `${message} ${JSON.stringify(details)}`
  console[level](output)
}

const logger = {
  error: (message: string, details?: LogDetails) => write('error', message, details),
  info: (message: string, details?: LogDetails) => write('info', message, details),
  warn: (message: string, details?: LogDetails) => write('warn', message, details)
}

export default logger
