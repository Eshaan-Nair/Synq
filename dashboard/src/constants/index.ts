export const STATIC_TYPE_COLORS: Record<string, string> = {
  Person: "#F472B6", Pet: "#FB923C", Goal: "#34D399", Problem: "#F87171",
  Preference: "#818CF8", Habit: "#FCD34D", Location: "#2DD4BF",
  Organization: "#6366F1", Education: "#A78BFA", Project: "#94A3B8",
  Technology: "#8B5CF6", Feature: "#EC4899", Bug: "#EF4444",
  Decision: "#F59E0B", Auth: "#10B981", Database: "#06B6D4",
  Library: "#3B82F6", API: "#6366F1", Concept: "#D946EF",
  Framework: "#7C3AED", Architecture: "#EAB308", Tool: "#4ADE80",
  Pattern: "#2DD4BF", Algorithm: "#14B8A6", default: "#475569",
};

export function getDynamicColor(type: string): string {
  if (!type) return STATIC_TYPE_COLORS.default;
  if (STATIC_TYPE_COLORS[type]) return STATIC_TYPE_COLORS[type];
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
}

export const TYPE_COLORS = new Proxy(STATIC_TYPE_COLORS, {
  get: (target, prop) => (typeof prop !== "string" ? target["default"] : (target[prop] || getDynamicColor(prop)))
});

export const PAGE_SIZE = 50;
