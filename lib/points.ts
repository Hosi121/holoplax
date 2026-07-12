export const STORY_POINTS = [1, 2, 3, 5, 8, 13, 21, 34] as const;
export type StoryPoint = (typeof STORY_POINTS)[number];

export const isStoryPoint = (value: unknown): value is StoryPoint =>
  typeof value === "number" && STORY_POINTS.includes(value as StoryPoint);
