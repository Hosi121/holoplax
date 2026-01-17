export function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[\s\W]+/g, "")
    .trim();
}

const bigrams = (text: string) => {
  const grams: string[] = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    grams.push(text.slice(i, i + 2));
  }
  return grams;
};

export function diceCoefficient(a: string, b: string) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) {
    return left[0] === right[0] ? 0.5 : 0;
  }
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const rightCount = new Map<string, number>();
  rightBigrams.forEach((gram) => {
    rightCount.set(gram, (rightCount.get(gram) ?? 0) + 1);
  });
  let overlap = 0;
  leftBigrams.forEach((gram) => {
    const count = rightCount.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCount.set(gram, count - 1);
    }
  });
  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}
