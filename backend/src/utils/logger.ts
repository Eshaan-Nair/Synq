import pino from "pino";

/**
 * v1.4.1+: Structured logging with pino
 * Supports JSON output in production and pretty-printing in development.
 */
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production" 
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

export const logger = {
  info:    (msg: string, ...args: any[]) => pinoLogger.info(msg, ...args),
  warn:    (msg: string, ...args: any[]) => pinoLogger.warn(msg, ...args),
  error:   (msg: string, ...args: any[]) => pinoLogger.error(msg, ...args),
  debug:   (msg: string, ...args: any[]) => pinoLogger.debug(msg, ...args),
  // success is mapped to info in pino
  success: (msg: string, ...args: any[]) => pinoLogger.info({ success: true }, msg, ...args),
};