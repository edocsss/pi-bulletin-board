import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Key,
  Markdown,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeyId,
  type SizeValue,
  type TUI,
} from "@earendil-works/pi-tui";
import type { BulletinEntry, BulletinStore } from "./bulletin-store.ts";

export type MarkdownRenderer = (markdown: string, width: number) => string[];

export interface BulletinOverlayOptions {
  tui: TUI;
  theme: Theme;
  store: BulletinStore;
  shortcut: string;
  maxHeight: SizeValue;
  onClose: () => void;
}

const PRIORITY_COLORS: Record<BulletinEntry["priority"], "dim" | "text" | "warning" | "error"> = {
  low: "dim",
  normal: "text",
  high: "warning",
  critical: "error",
};

export function formatBulletinTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function defaultMarkdownRenderer(markdown: string, width: number): string[] {
  return new Markdown(markdown, 0, 0, getMarkdownTheme()).render(width);
}

function divider(theme: Theme, width: number): string {
  return theme.fg("dim", "─".repeat(Math.max(0, width)));
}

export function renderBulletinEntry(
  entry: BulletinEntry,
  theme: Theme,
  width: number,
  markdownRenderer: MarkdownRenderer = defaultMarkdownRenderer,
): string[] {
  const lines: string[] = [];
  const priority = entry.priority.toUpperCase();
  const priorityColor = PRIORITY_COLORS[entry.priority];
  const header = `${formatBulletinTime(entry.createdAt)}  ${priority}`;

  lines.push(divider(theme, width));
  lines.push(theme.fg(priorityColor, truncateToWidth(header, width)));
  lines.push(theme.bold(theme.fg("accent", truncateToWidth(entry.title, width))));
  lines.push(divider(theme, width));
  lines.push("");
  lines.push(...wrapTextWithAnsi(theme.fg("text", entry.message), width));

  if (entry.markdownDetails) {
    lines.push("");
    lines.push(...markdownRenderer(entry.markdownDetails, width));
  }

  if (entry.tags && entry.tags.length > 0) {
    lines.push("");
    lines.push(theme.fg("dim", truncateToWidth(`Tags: ${entry.tags.join(", ")}`, width)));
  }

  return lines;
}

export function renderBulletinContent(
  entries: readonly BulletinEntry[],
  theme: Theme,
  width: number,
  markdownRenderer: MarkdownRenderer = defaultMarkdownRenderer,
): string[] {
  if (entries.length === 0) {
    return [
      theme.fg("dim", "No bulletins yet."),
      theme.fg("dim", "Long-running agents can post important updates with publish_bulletin."),
    ];
  }

  const lines: string[] = [];
  [...entries].reverse().forEach((entry, index) => {
    if (index > 0) lines.push("");
    lines.push(...renderBulletinEntry(entry, theme, width, markdownRenderer));
  });
  return lines;
}

function padToWidth(value: string, width: number): string {
  return value + " ".repeat(Math.max(0, width - visibleWidth(value)));
}

export class BulletinOverlay implements Component, Focusable {
  private scrollOffset = 0;
  private totalContentLines = 0;
  private _focused = true;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  constructor(private options: BulletinOverlayOptions) {}

  requestRender(): void {
    this.options.tui.requestRender();
  }

  scrollToLatest(): void {
    this.scrollOffset = 0;
  }

  private frameLine(content: string, width: number): string {
    const { theme } = this.options;
    const borderColor = this.focused ? "border" : "borderMuted";
    const inner = Math.max(0, width - 4);
    const safe = truncateToWidth(content.replaceAll("\r", " "), inner, "...", true);
    return theme.fg(borderColor, "│ ") + padToWidth(safe, inner) + theme.fg(borderColor, " │");
  }

  private maxVisibleContentLines(): number {
    const rows = this.options.tui.terminal.rows ?? process.stdout.rows ?? 24;
    const maxHeight = this.options.maxHeight;
    const resolvedHeight =
      typeof maxHeight === "number"
        ? Math.floor(maxHeight)
        : Math.floor((rows * Number.parseInt(maxHeight, 10)) / 100);
    return Math.max(0, resolvedHeight - 6);
  }

  render(width: number): string[] {
    const { theme, store, shortcut } = this.options;
    if (width < 8) return [" ".repeat(Math.max(0, width))];

    const borderColor = this.focused ? "border" : "borderMuted";
    const inner = Math.max(0, width - 4);
    const entries = store.getEntries();
    const unread = store.getUnreadCount();
    const title = theme.bold(theme.fg("accent", "Bulletin Board"));
    const count = `${entries.length} bulletin${entries.length === 1 ? "" : "s"}`;
    const unreadText = unread > 0 ? ` · ${unread} unread` : "";
    const right = theme.fg("dim", `${count}${unreadText} · ${shortcut} open/close`);
    const titleWidth = Math.max(1, inner - visibleWidth(right) - 1);
    const left = truncateToWidth(title, titleWidth);
    const gap = " ".repeat(Math.max(1, inner - visibleWidth(left) - visibleWidth(right)));

    const contentLines = renderBulletinContent(entries, theme, inner);
    this.totalContentLines = contentLines.length;
    const maxVisible = this.maxVisibleContentLines();
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, Math.max(0, this.totalContentLines - maxVisible)));
    const start = this.scrollOffset;
    const end = this.scrollOffset + maxVisible;
    const visible = contentLines.slice(start, end);

    const lines: string[] = [];
    lines.push(theme.fg(borderColor, "┌" + "─".repeat(width - 2) + "┐"));
    lines.push(this.frameLine(`${left}${gap}${right}`, width));
    lines.push(theme.fg(borderColor, "├" + "─".repeat(width - 2) + "┤"));
    for (const line of visible) lines.push(this.frameLine(line, width));
    for (let i = visible.length; i < maxVisible; i += 1) lines.push(this.frameLine("", width));
    lines.push(theme.fg(borderColor, "├" + "─".repeat(width - 2) + "┤"));
    lines.push(this.frameLine(theme.fg("dim", `PgUp/PgDn page · ↑/↓ smooth · Esc/${shortcut} close`), width));
    lines.push(theme.fg(borderColor, "└" + "─".repeat(width - 2) + "┘"));
    return lines.map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width) : line));
  }

  handleInput(data: string): void {
    if (matchesKey(data, this.options.shortcut as KeyId)) {
      this.options.onClose();
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.options.onClose();
      return;
    }

    const maxOffset = Math.max(0, this.totalContentLines - this.maxVisibleContentLines());
    if (matchesKey(data, Key.pageUp)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 5);
      this.options.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.pageDown)) {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 5);
      this.options.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.options.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
      this.options.tui.requestRender();
    }
  }

  invalidate(): void {}
}
