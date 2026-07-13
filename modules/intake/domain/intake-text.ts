const normalizeText = (input: string) =>
  input
    .toLowerCase()
    .replace(/[\s\W]+/g, "")
    .trim();

const bigrams = (text: string) => {
  const grams: string[] = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.push(text.slice(index, index + 2));
  }
  return grams;
};

export function deriveIntakeTitle(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "無題メモ";
  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

export function intakeTitleSimilarity(leftText: string, rightText: string) {
  const left = normalizeText(leftText);
  const right = normalizeText(rightText);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return left[0] === right[0] ? 0.5 : 0;

  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const rightCount = new Map<string, number>();
  for (const gram of rightBigrams) rightCount.set(gram, (rightCount.get(gram) ?? 0) + 1);

  let overlap = 0;
  for (const gram of leftBigrams) {
    const count = rightCount.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCount.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}
