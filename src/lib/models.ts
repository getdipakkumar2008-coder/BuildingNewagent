// Allow-list of model IDs, verified against the public models overview (2026-11-06).
export const MODELS = [
  { id: "claude-fable-5-1", label: "Fable 5.1 — deepest reasoning" },
  { id: "claude-opus-5-5", label: "Opus 5.5 — balanced" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 — fast" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 — fastest" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "claude-sonnet-5-5";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && MODELS.some((m) => m.id === value);
}
