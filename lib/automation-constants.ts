// User preference tag (not an automation state)
const NO_DELEGATE_TAG = "no-delegate";

// Helper to check if task has no-delegate preference
export const hasNoDelegateTag = (tags: string[] | null | undefined): boolean =>
  Array.isArray(tags) && tags.includes(NO_DELEGATE_TAG);
