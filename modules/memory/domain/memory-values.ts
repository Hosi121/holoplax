export type MemoryScope = "USER" | "WORKSPACE";
export type MemoryValueType =
  | "STRING"
  | "NUMBER"
  | "BOOL"
  | "JSON"
  | "RATIO"
  | "DURATION_MS"
  | "HISTOGRAM_24x7"
  | "RATIO_BY_TYPE";

export const defaultMemoryDefinitions = [
  ["life_rhythm", "USER", "HISTOGRAM_24x7", null, "weekly", 56, "活動時間帯の分布"],
  ["deadline_strictness", "USER", "RATIO", null, "daily", 30, "期限遵守の厳しさ (0-1)"],
  ["execution_pattern", "USER", "STRING", null, "daily", 30, "実行パターンや習慣"],
  ["sprint_length", "WORKSPACE", "NUMBER", "days", "static", null, "スプリント長 (日)"],
  ["team_dod", "WORKSPACE", "STRING", null, "static", null, "完了の条件"],
  ["team_workflow_schema", "WORKSPACE", "JSON", null, "static", null, "ステータス/遷移のスキーマ"],
] as const;

export const isMemoryScope = (value: unknown): value is MemoryScope =>
  value === "USER" || value === "WORKSPACE";

export const isMemoryValueType = (value: unknown): value is MemoryValueType =>
  [
    "STRING",
    "NUMBER",
    "BOOL",
    "JSON",
    "RATIO",
    "DURATION_MS",
    "HISTOGRAM_24x7",
    "RATIO_BY_TYPE",
  ].includes(String(value));

export const parseMemoryValue = (value: unknown, valueType: MemoryValueType) => {
  if (value === null || value === undefined || value === "") {
    return { ok: false as const, reason: "value is required" };
  }
  if (valueType === "STRING") return { ok: true as const, data: { valueStr: String(value) } };
  if (valueType === "NUMBER" || valueType === "DURATION_MS") {
    const valueNum = Number(value);
    return Number.isNaN(valueNum)
      ? { ok: false as const, reason: "invalid number" }
      : { ok: true as const, data: { valueNum } };
  }
  if (valueType === "RATIO") {
    const valueNum = Number(value);
    return Number.isNaN(valueNum) || valueNum < 0 || valueNum > 1
      ? { ok: false as const, reason: "ratio must be 0..1" }
      : { ok: true as const, data: { valueNum } };
  }
  if (valueType === "BOOL") {
    if (typeof value === "boolean") return { ok: true as const, data: { valueBool: value } };
    if (value === "true" || value === "false") {
      return { ok: true as const, data: { valueBool: value === "true" } };
    }
    return { ok: false as const, reason: "invalid boolean" };
  }
  if (["JSON", "HISTOGRAM_24x7", "RATIO_BY_TYPE"].includes(valueType)) {
    if (typeof value === "string") {
      try {
        return { ok: true as const, data: { valueJson: JSON.parse(value) as unknown } };
      } catch {
        return { ok: false as const, reason: "invalid json" };
      }
    }
    return { ok: true as const, data: { valueJson: value } };
  }
  return { ok: false as const, reason: "unsupported value type" };
};
