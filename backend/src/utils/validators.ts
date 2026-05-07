import mongoose from "mongoose";

/**
 * Consistent MongoDB ObjectId validation across backend routes.
 */
export function isValidObjectId(id: string): boolean {
  if (!id) return false;
  // Support both 24-char Mongo hex and standard UUID (for SQLite)
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
  const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[4][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/i.test(id);
  return isMongoId || isUUID;
}
