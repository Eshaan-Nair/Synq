/**
 * Validates session and job IDs.
 * Supports both MongoDB ObjectIds (24-char hex) and SQLite UUIDs.
 */
export function isValidObjectId(id: string): boolean {
  if (!id) return false;
  // MongoDB check
  if (/^[0-9a-fA-F]{24}$/.test(id)) return true;
  // UUID check
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) return true;
  return false;
}
