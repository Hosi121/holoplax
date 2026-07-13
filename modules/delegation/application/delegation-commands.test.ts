import { describe, expect, it, vi } from "vitest";
import { createDelegationCommands, type DelegationCommandPort } from "./delegation-commands";

const actor = { userId: "user-1", workspaceId: null };

const createPort = () =>
  ({
    create: vi.fn(),
    list: vi.fn(),
    find: vi.fn(),
    act: vi.fn(),
  }) as unknown as DelegationCommandPort;

describe("delegation commands", () => {
  it("rejects sensitive input before calling persistence", () => {
    const port = createPort();
    const commands = createDelegationCommands(port);

    expect(() => commands.create(actor, "APIキーを使って文章を作って", "PREPARE")).toThrow(
      "内容から取り除いてください",
    );
    expect(port.create).not.toHaveBeenCalled();
  });
});
