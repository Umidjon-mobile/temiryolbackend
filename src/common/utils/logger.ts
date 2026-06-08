/**
 * Oddiy logger. Production da Winston yoki Pino ga almashtirish mumkin.
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (...args: unknown[]) => console.log(`${colors.cyan}[INFO]${colors.reset} ${ts()}`, ...args),
  warn: (...args: unknown[]) => console.warn(`${colors.yellow}[WARN]${colors.reset} ${ts()}`, ...args),
  error: (...args: unknown[]) => console.error(`${colors.red}[ERR]${colors.reset}  ${ts()}`, ...args),
  success: (...args: unknown[]) => console.log(`${colors.green}[OK]${colors.reset}   ${ts()}`, ...args),
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${colors.gray}[DBG]${colors.reset}  ${ts()}`, ...args);
    }
  },
};
