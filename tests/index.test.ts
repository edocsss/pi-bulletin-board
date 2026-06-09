import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bulletinBoardExtension from "../src/index.ts";

function createPiMock() {
  return {
    on: vi.fn(),
    registerTool: vi.fn(),
    registerShortcut: vi.fn(),
    registerCommand: vi.fn(),
    appendEntry: vi.fn(),
  };
}

describe("package entrypoint", () => {
  it("loads the extension from src/index.ts", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.pi.extensions).toEqual(["./src/index.ts"]);
  });
});

describe("bulletinBoardExtension", () => {
  it("registers the bulletin tool, commands, shortcut, and session handler", () => {
    const pi = createPiMock();

    bulletinBoardExtension(pi as never);

    expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "publish_bulletin" }));
    expect(pi.registerShortcut).toHaveBeenCalledWith("alt+shift+m", expect.objectContaining({ description: expect.any(String) }));
    expect(pi.registerCommand).toHaveBeenCalledWith("bulletin", expect.any(Object));
    expect(pi.registerCommand).toHaveBeenCalledWith("bulletin-clear", expect.any(Object));
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("session_tree", expect.any(Function));
  });

  it("guides agents to publish selective, high-signal bulletins instead of routine progress", () => {
    const pi = createPiMock();

    bulletinBoardExtension(pi as never);

    const tool = pi.registerTool.mock.calls[0][0];
    const toolText = JSON.stringify(tool);

    expect(toolText).toContain("Use publish_bulletin selectively");
    expect(toolText).toContain("materially change confidence");
    expect(toolText).toContain("routine file read");
    expect(toolText).toContain("generic progress note");
    expect(toolText).toContain("will remain useful as a checkpoint later");
    expect(toolText).not.toContain("rare");
  });

  it("tells agents to provide markdownDetails as raw Markdown rather than one fenced text block", () => {
    const pi = createPiMock();

    bulletinBoardExtension(pi as never);

    const tool = pi.registerTool.mock.calls[0][0];
    const toolText = JSON.stringify(tool);

    expect(toolText).toContain("raw Markdown");
    expect(toolText).toContain("Do not wrap the entire content in a fenced code block");
    expect(toolText).toContain("Use `##` headings and `-` lists directly");
  });

  it("does not keep the /bulletin command in-flight while the overlay is open", async () => {
    const pi = createPiMock();
    bulletinBoardExtension(pi as never);
    const [, commandOptions] = pi.registerCommand.mock.calls.find(([name]) => name === "bulletin")!;
    const ctx = {
      ui: {
        custom: vi.fn(() => new Promise(() => undefined)),
        notify: vi.fn(),
        setStatus: vi.fn(),
        theme: { fg: (_color: string, text: string) => text },
      },
      sessionManager: { getBranch: vi.fn(() => []) },
    };

    const result = await Promise.race([
      commandOptions.handler("", ctx).then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 25)),
    ]);

    expect(result).toBe("returned");
    expect(ctx.ui.custom).toHaveBeenCalledOnce();
  });

  it("closes an existing overlay when the shortcut is pressed again", () => {
    const pi = createPiMock();
    bulletinBoardExtension(pi as never);
    const [, shortcutOptions] = pi.registerShortcut.mock.calls[0];
    const handle = { hide: vi.fn(), isFocused: vi.fn(() => false), focus: vi.fn() };
    const ctx = {
      ui: {
        custom: vi.fn((factory, options) => {
          const tui = { hasOverlay: vi.fn(() => false), terminal: { rows: 20 }, requestRender: vi.fn() };
          const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
          factory(tui, theme, {}, vi.fn());
          options.onHandle(handle);
          return new Promise(() => undefined);
        }),
        notify: vi.fn(),
        setStatus: vi.fn(),
        theme: { fg: (_color: string, text: string) => text },
      },
      sessionManager: { getBranch: vi.fn(() => []) },
    };

    shortcutOptions.handler(ctx);
    handle.focus.mockClear();
    shortcutOptions.handler(ctx);

    expect(handle.hide).toHaveBeenCalledOnce();
    expect(handle.focus).not.toHaveBeenCalled();
  });
});
