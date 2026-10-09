import { describe, expect, test } from "vitest";
import { alphaForDecay, computeFlowState, computeMetrics } from "../domain/metrics";
import oracle from "./python-oracle.json";

describe("parity with Python 3.12.3 metrics", () => {
  for (const fixture of oracle.cases)
    test(fixture.name, () => {
      expect(computeMetrics(fixture.tasks, fixture.window, oracle.now)).toEqual(fixture.expected);
    });
  for (const fixture of oracle.flows)
    test(`flow ${fixture.args}`, () => {
      expect(computeFlowState(fixture.args[0], fixture.args[1]!, fixture.args[2]!)).toEqual(
        fixture.expected,
      );
    });
  for (const fixture of oracle.decay)
    test(`decay ${fixture.days}`, () => {
      expect(alphaForDecay(fixture.days)).toBeCloseTo(fixture.expected, 14);
    });
});
