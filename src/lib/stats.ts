/** Turns `$group` rows ({ _id, count }) into a record with every key present, missing ones as 0. */
export function countsByKey(keys: readonly string[], rows: { _id: string | null; count: number }[]) {
  const counts = new Map(rows.map((row) => [row._id, row.count]));
  return Object.fromEntries(keys.map((key) => [key, counts.get(key) ?? 0])) as Record<string, number>;
}

/** The last `count` months as "YYYY-MM" keys (UTC), oldest first, including the current month. */
export function recentMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Start of the month `count - 1` months ago (UTC): the lower bound for `recentMonths(count)`. */
export function monthsAgoStart(count: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1));
}
