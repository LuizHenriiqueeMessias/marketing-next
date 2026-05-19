export const DEFAULT_RECENT_DAYS = 15;

export const RECENT_DAY_OPTIONS = [
  { value: "7", label: "Ultimos 7 dias" },
  { value: "15", label: "Ultimos 15 dias" },
  { value: "30", label: "Ultimos 30 dias" },
  { value: "60", label: "Ultimos 60 dias" },
] as const;

export function coerceRecentDays(value: string | number | null | undefined, fallback = DEFAULT_RECENT_DAYS) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(365, Math.max(1, Math.floor(parsed)));
}

export function buildOnlyPostsNewerThan(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - coerceRecentDays(days));
  return since.toISOString();
}

export function cleanHashtag(value: string) {
  return value
    .trim()
    .replace(/^#/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\/explore\/tags\//i, "")
    .split(/[/?#\s]/)[0]
    .trim()
    .toLowerCase();
}

export function parseHashtags(input: string) {
  const seen = new Set<string>();
  return input
    .split(/[\n,]+/)
    .map(cleanHashtag)
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}
