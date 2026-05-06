import mongoose from "mongoose";

/**
 * Consistent MongoDB ObjectId validation across backend routes.
 */
export function isValidObjectId(id: string): boolean {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
}
