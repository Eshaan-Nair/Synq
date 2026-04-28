"use strict";
// Consistent, prefixed logging across all backend services
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const timestamp = () => new Date().toISOString().slice(11, 23);
exports.logger = {
    info: (msg, ...args) => console.log(`[${timestamp()}] ℹ️  ${msg}`, ...args),
    success: (msg, ...args) => console.log(`[${timestamp()}] ✅ ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[${timestamp()}] ⚠️  ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[${timestamp()}] ❌ ${msg}`, ...args),
    debug: (msg, ...args) => {
        if (process.env.DEBUG === "true") {
            console.log(`[${timestamp()}] 🔍 ${msg}`, ...args);
        }
    },
};
