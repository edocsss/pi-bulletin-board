import { describe, expect, it, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  BulletinOverlay,
  formatBulletinTime,
  renderBulletinContent,
  renderBulletinEntry,
  type MarkdownRenderer,
} from "../src/bulletin-overlay.ts";
import { BulletinStore, type BulletinEntry } from "../src/bulletin-store.ts";
import type { TUI } from "@earendil-works/pi-tui";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const entry: BulletinEntry = {
  id: "b-1",
  createdAt: "2026-06-01T14:18:00.000Z",
  title: "Root cause direction changed",
  message: "DB latency appears downstream, not root cause.",
  priority: "high",
  markdownDetails: "## Evidence\n- sg1-only spike\n- deploy window aligns",
  tags: ["sg1", "config"],
};

describe("bulletin rendering", () => {
  it("formats bulletin time as local HH:mm", () => {
    expect(formatBulletinTime("2026-06-01T14:18:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("renders title as a structured section header outside markdown", () => {
    const markdownRenderer: MarkdownRenderer = vi.fn(() => ["MARKDOWN BODY"]);
    const lines = renderBulletinEntry(entry, theme, 80, markdownRenderer);

    expect(lines.join("\n")).toContain("HIGH");
    expect(lines.join("\n")).toContain("Root cause direction changed");
    expect(lines.join("\n")).toContain("DB latency appears downstream");
    expect(markdownRenderer).toHaveBeenCalledWith(entry.markdownDetails, 80);
  });

  it("renders tags after markdown details", () => {
    const lines = renderBulletinEntry(entry, theme, 80, () => ["MARKDOWN BODY"]);
    const joined = lines.join("\n");

    expect(joined.indexOf("MARKDOWN BODY")).toBeLessThan(joined.indexOf("Tags: sg1, config"));
  });

  it("renders empty state when no entries exist", () => {
    const lines = renderBulletinContent([], theme, 80, () => []);

    expect(lines.join("\n")).toContain("No bulletins yet.");
    expect(lines.join("\n")).toContain("publish_bulletin");
  });

  it("renders newest bulletins before older bulletins", () => {
    const older: BulletinEntry = {
      ...entry,
      id: "b-old",
      title: "Older update",
      createdAt: "2026-06-01T10:00:00.000Z",
    };
    const newer: BulletinEntry = {
      ...entry,
      id: "b-new",
      title: "Newer update",
      createdAt: "2026-06-01T11:00:00.000Z",
    };

    const lines = renderBulletinContent([older, newer], theme, 80, () => []);
    const joined = lines.join("\n");

    expect(joined.indexOf("Newer update")).toBeLessThan(joined.indexOf("Older update"));
  });

  it("opens at the beginning of the latest bulletin", () => {
    let id = 0;
    const store = new BulletinStore({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      idFactory: () => `b-${id++}`,
    });
    for (let i = 0; i < 5; i += 1) {
      store.publish({ title: `Older ${i}`, message: "Historical update." });
    }
    store.publish({
      title: "Newest item",
      message: "Fresh update at the top of the overlay.",
      markdownDetails: "detail line 1\ndetail line 2\ndetail line 3",
    });

    const overlay = new BulletinOverlay({
      tui: { terminal: { rows: 20 }, requestRender: vi.fn() } as unknown as TUI,
      theme,
      store,
      shortcut: "alt+shift+m",
      maxHeight: 10,
      onClose: vi.fn(),
    });

    const rendered = overlay.render(80).join("\n");

    expect(rendered).toContain("Newest item");
    expect(rendered).not.toContain("Older 4");
  });

  it("respects configured maxHeight when rendering the overlay frame", () => {
    const store = new BulletinStore({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      idFactory: () => crypto.randomUUID(),
    });
    for (let i = 0; i < 8; i += 1) {
      store.publish({ title: `Update ${i}`, message: "A long-running task update." });
    }

    const overlay = new BulletinOverlay({
      tui: { terminal: { rows: 20 }, requestRender: vi.fn() } as unknown as TUI,
      theme,
      store,
      shortcut: "alt+shift+m",
      maxHeight: 10,
      onClose: vi.fn(),
    });

    const lines = overlay.render(80);

    expect(lines).toHaveLength(10);
    expect(lines.join("\n")).toContain("Esc/alt+shift+m close");
  });

  it("closes when the configured shortcut is pressed while focused", () => {
    const onClose = vi.fn();
    const overlay = new BulletinOverlay({
      tui: { terminal: { rows: 20 }, requestRender: vi.fn() } as unknown as TUI,
      theme,
      store: new BulletinStore(),
      shortcut: "alt+shift+m",
      maxHeight: "70%",
      onClose,
    });

    overlay.handleInput("\u001b[109;4u");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("scrolls down into older bulletins and up toward the latest bulletin", () => {
    let id = 0;
    const store = new BulletinStore({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      idFactory: () => `b-${id++}`,
    });
    for (let i = 0; i < 10; i += 1) {
      store.publish({ title: `Update ${i}`, message: "Historical update." });
    }
    const makeOverlay = () =>
      new BulletinOverlay({
        tui: { terminal: { rows: 20 }, requestRender: vi.fn() } as unknown as TUI,
        theme,
        store,
        shortcut: "alt+shift+m",
        maxHeight: 10,
        onClose: vi.fn(),
      });

    const pageOverlay = makeOverlay();
    pageOverlay.render(80);
    pageOverlay.handleInput("\u001b[6~");
    expect((pageOverlay as unknown as { scrollOffset: number }).scrollOffset).toBe(5);
    pageOverlay.handleInput("\u001b[5~");
    expect((pageOverlay as unknown as { scrollOffset: number }).scrollOffset).toBe(0);

    const smoothOverlay = makeOverlay();
    smoothOverlay.render(80);
    smoothOverlay.handleInput("\u001b[B");
    expect((smoothOverlay as unknown as { scrollOffset: number }).scrollOffset).toBe(1);
    smoothOverlay.handleInput("\u001b[A");
    expect((smoothOverlay as unknown as { scrollOffset: number }).scrollOffset).toBe(0);

    smoothOverlay.handleInput("\u001b[1;2B");
    expect((smoothOverlay as unknown as { scrollOffset: number }).scrollOffset).toBe(0);
  });

  it("can scroll back to the latest bulletin after the user has scrolled down into older bulletins", () => {
    let id = 0;
    const store = new BulletinStore({
      now: () => new Date("2026-06-01T10:00:00.000Z"),
      idFactory: () => `b-${id++}`,
    });
    for (let i = 0; i < 10; i += 1) {
      store.publish({ title: `Old ${i}`, message: "Historical update." });
    }
    const tui = { terminal: { rows: 20 }, requestRender: vi.fn() } as unknown as TUI;
    const overlay = new BulletinOverlay({
      tui,
      theme,
      store,
      shortcut: "alt+shift+m",
      maxHeight: 10,
      onClose: vi.fn(),
    });

    overlay.render(80);
    overlay.handleInput("\u001b[6~");
    expect((overlay as unknown as { scrollOffset: number }).scrollOffset).toBe(5);
    store.publish({ title: "Newest", message: "Fresh update." });
    overlay.scrollToLatest();

    expect(overlay.render(80).join("\n")).toContain("Newest");
  });
});
