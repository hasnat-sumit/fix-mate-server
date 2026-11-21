import { z } from "zod";

export const pageQuery = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

/** Clamps the requested page to the last page and returns the skip offset. */
export function paginate(total: number, page: number, limit: number) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(page, pageCount);
  return { page: current, pageCount, skip: (current - 1) * limit };
}
