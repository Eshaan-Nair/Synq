// Consistent, prefixed logging across all backend services

const timestamp = () => new Date().toISOString().slice(11, 23);

export const logger = {
  info:    (msg: string, ...args: any[]) => console.log(`[${timestamp()}] ℹ️  ${msg}`, ...args),
  success: (msg: string, ...args: any[]) => console.log(`[${timestamp()}] ✅ ${msg}`, ...args),
  warn:    (msg: string, ...args: any[]) => console.warn(`[${timestamp()}] ⚠️  ${msg}`, ...args),
  error:   (msg: string, ...args: any[]) => console.error(`[${timestamp()}] ❌ ${msg}`, ...args),
  debug:   (msg: string, ...args: any[]) => {
    if (process.env.DEBUG === "true") {
      console.log(`[${timestamp()}] 🔍 ${msg}`, ...args);
    }
  },
};