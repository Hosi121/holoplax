import { describe, expect, it } from "vitest";
import { planDelegationRequest } from "./delegation-policy";

describe("delegation safety policy", () => {
  it("automatically runs a reversible research deliverable", () => {
    expect(planDelegationRequest("競合製品の違いを調べて、比較表にまとめて")).toMatchObject({
      kind: "RESEARCH",
      risk: "LOW",
      decision: { outcome: "AUTO" },
    });
  });

  it("requires review before an external side effect", () => {
    expect(planDelegationRequest("この内容をメールで送って")).toMatchObject({
      risk: "REVIEW",
      decision: { outcome: "REVIEW", safeFallback: "PREPARE" },
    });
  });

  it("never auto-runs destructive work", () => {
    expect(planDelegationRequest("古い本番データを削除して")).toMatchObject({
      risk: "RESTRICTED",
      decision: { outcome: "REVIEW", safeFallback: "PREPARE" },
    });
  });

  it("allows a safe draft even when the eventual action is sensitive", () => {
    expect(planDelegationRequest("削除依頼メールの下書きを作って", "PREPARE")).toMatchObject({
      risk: "LOW",
      decision: { outcome: "AUTO" },
      kind: "WRITING",
    });
  });

  it("never sends sensitive material to AI, even in prepare mode", () => {
    expect(planDelegationRequest("このAPIキーを使って下書きを作って", "PREPARE")).toMatchObject({
      risk: "RESTRICTED",
      decision: { outcome: "BLOCK" },
    });
  });

  it("allows discussion about credentials when no credential value is supplied", () => {
    expect(planDelegationRequest("APIキーの安全な管理方法を調べて")).toMatchObject({
      risk: "LOW",
      decision: { outcome: "AUTO" },
    });
  });
});
