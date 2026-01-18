import { storyPointOptions } from "./points";

export type PriorityLevel = "低" | "中" | "高";
const PRIORITY_LEVELS: PriorityLevel[] = ["低", "中", "高"];

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};

export const normalizeStoryPoint = (value: unknown, fallback = 3) => {
  const target = toNumber(value);
  if (!Number.isFinite(target)) return fallback;
  let nearest = storyPointOptions[0];
  let minDiff = Infinity;
  for (const option of storyPointOptions) {
    const diff = Math.abs(option - target);
    if (diff < minDiff) {
      nearest = option;
      minDiff = diff;
    }
  }
  return nearest;
};

const toStringValue = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
};

export const normalizePriorityLevel = (value: unknown, fallback: PriorityLevel = "中") => {
  const candidate = toStringValue(value);
  if (PRIORITY_LEVELS.includes(candidate as PriorityLevel)) {
    return candidate as PriorityLevel;
  }
  return fallback;
};

export const sanitizeSplitSuggestion = (item: {
  title: string;
  points: unknown;
  urgency?: unknown;
  risk?: unknown;
  detail?: string | null;
}) => ({
  title: toStringValue(item.title),
  points: normalizeStoryPoint(item.points),
  urgency: normalizePriorityLevel(item.urgency),
  risk: normalizePriorityLevel(item.risk),
  detail: toStringValue(item.detail),
});
