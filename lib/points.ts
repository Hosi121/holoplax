const storyPoints = [1, 2, 3, 5, 8, 13, 21, 34];

export const isStoryPoint = (value: number) => storyPoints.includes(Number(value));
export const badPoints = (value: number) => !isStoryPoint(Number(value));
export const storyPointOptions = storyPoints;
