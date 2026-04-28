import { claude } from "./claude";
import { chatgpt } from "./chatgpt";
import { gemini } from "./gemini";
const platforms = [claude, chatgpt, gemini];
export function detectPlatform() {
    const host = window.location.hostname;
    const match = platforms.find(p => host.includes(p.hostname));
    return match?.name || "unknown";
}
export function getPlatformConfig(platform) {
    return platforms.find(p => p.name === platform) || null;
}
export function queryAll(selectors) {
    for (const sel of selectors) {
        try {
            const results = document.querySelectorAll(sel);
            if (results.length > 0)
                return Array.from(results);
        }
        catch { /* invalid selector */ }
    }
    return [];
}
export function queryOne(selectors) {
    for (const sel of selectors) {
        try {
            const result = document.querySelector(sel);
            if (result)
                return result;
        }
        catch { /* invalid selector */ }
    }
    return null;
}
