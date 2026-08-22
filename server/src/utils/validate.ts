import { ApiError } from '../middleware/errorHandler';

/** Rejects values that are too long (after trim) — storage abuse guard. */
export function assertMaxLength(label: string, code: string, max: number, ...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value !== undefined && value !== null && value.trim().length > max) {
      throw new ApiError(400, `${label} is too long (maximum ${max} characters)`, code);
    }
  }
}
