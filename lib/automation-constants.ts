export const DELEGATE_TAG = "auto-delegate";
export const NO_DELEGATE_TAG = "no-delegate";
export const SPLIT_PARENT_TAG = "auto-split-parent";
export const SPLIT_CHILD_TAG = "auto-split-child";
export const PENDING_APPROVAL_TAG = "automation-needs-approval";

export const withTag = (tags: string[] = [], tag: string) => {
  const set = new Set(tags);
  set.add(tag);
  return Array.from(set);
};

export const withoutTags = (tags: string[] = [], remove: string[]) => {
  const removeSet = new Set(remove);
  return tags.filter((tag) => !removeSet.has(tag));
};
