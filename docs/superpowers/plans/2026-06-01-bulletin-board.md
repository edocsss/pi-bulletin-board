# Bulletin Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pi-bulletin-board`, a git-distributed Pi extension that lets the agent publish important long-running task updates to a read-only, session-persistent overlay.

**Architecture:** The extension is split into small units: `config.ts` loads safe defaults, `bulletin-store.ts` manages session-backed state and unread counts, `bulletin-overlay.ts` renders the read-only TUI overlay, and `index.ts` wires Pi tools, commands, shortcuts, session reconstruction, and status badges. State is stored in Pi custom session entries and reconstructed from the current branch on reload/resume.

**Tech Stack:** TypeScript ESM, Pi extension APIs from `@earendil-works/pi-coding-agent`, TUI components from `@earendil-works/pi-tui`, schemas from `typebox`, enum helper from `@earendil-works/pi-ai`, Vitest for unit tests.

---

## File structure

Create or modify these files:

```text
/Users/bytedance/aec/src/github/pi-agent/pi-bulletin-board/
├── .gitignore
├── CHANGELOG.md
├── README.md
├── src/
│   ├── bulletin-overlay.ts
│   ├── bulletin-store.ts
│   ├── config.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.mjs
├── tests/
│   ├── bulletin-render.test.ts
│   ├── bulletin-store.test.ts
│   ├── config.test.ts
│   └── index.test.ts
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-06-01-bulletin-board-design.md
        └── plans/
            └── 2026-06-01-bulletin-board.md
```

Responsibilities:

- `config.ts`: parse optional `config.json`, validate shortcut/size values, return defaults on missing or malformed config.
- `bulletin-store.ts`: define bulletin types, normalize tool input, reconstruct session custom entries, manage clear markers, track unread count.
- `bulletin-overlay.ts`: pure rendering helpers plus `BulletinOverlay` component with scroll/close/focus handling.
- `index.ts`: register `publish_bulletin`, `/bulletin`, `/bulletin-clear`, `Alt+Shift+M`, session reconstruction, status badge updates.
- `tests/`: unit tests for config, store, rendering, and extension registration.
- `README.md`: user-facing marketing/readme content.

---

### Task 1: Package scaffold and development tooling

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.mjs`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create package metadata and tooling files**

Write `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.DS_Store
config.json
```

Write `package.json`:

```json
{
  "name": "pi-bulletin-board",
  "version": "0.1.0",
  "private": true,
  "description": "A read-only bulletin board overlay for important Pi agent progress updates",
  "type": "module",
  "keywords": [
    "pi-package",
    "pi",
    "pi-coding-agent",
    "extension",
    "bulletin-board",
    "overlay",
    "progress"
  ],
  "author": "Nico Bailon",
  "license": "MIT",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.78.0",
    "@earendil-works/pi-coding-agent": "^0.78.0",
    "@earendil-works/pi-tui": "^0.78.0",
    "@types/node": "^24.0.0",
    "typebox": "^1.1.38",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node", "vitest"]
  },
  "include": ["*.ts", "tests/**/*.ts"]
}
```

Write `vitest.config.mjs`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

Write `CHANGELOG.md`:

```markdown
# Changelog

## 0.1.0

- Initial git-distributed Pi extension package.
- Adds a session-persistent bulletin board overlay design target.
```

- [ ] **Step 2: Install development dependencies**

Run:

```bash
cd /Users/bytedance/aec/src/github/pi-agent/pi-bulletin-board
npm install
```

Expected: `node_modules/` and `package-lock.json` are created, with no install errors.

- [ ] **Step 3: Run the empty test suite**

Run:

```bash
npm test
```

Expected: Vitest starts and reports no test files or no tests. This confirms the test runner is installed.

- [ ] **Step 4: Commit scaffold**

Run:

```bash
git add .gitignore package.json package-lock.json tsconfig.json vitest.config.mjs CHANGELOG.md
git commit -m "chore: scaffold bulletin board package"
```

Expected: commit succeeds.

---

### Task 2: Config module

**Files:**
- Create: `tests/config.test.ts`
- Create: `src/config.ts`

- [ ] **Step 1: Write failing config tests**

Write `tests/config.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig, normalizeConfig } from "../src/config.ts";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "pi-bulletin-config-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("config", () => {
  it("returns defaults when config file is missing", () => {
    withTempDir((dir) => {
      expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
    });
  });

  it("returns defaults when config file is malformed", () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, "config.json"), "{not-json", "utf8");
      expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
    });
  });

  it("accepts valid shortcut and sizing overrides", () => {
    withTempDir((dir) => {
      writeFileSync(
        join(dir, "config.json"),
        JSON.stringify({ shortcut: "ctrl+shift+b", width: "80%", maxHeight: 24 }),
        "utf8",
      );
      expect(loadConfig(dir)).toEqual({ shortcut: "ctrl+shift+b", width: "80%", maxHeight: 24 });
    });
  });

  it("normalizes invalid fields independently", () => {
    expect(normalizeConfig({ shortcut: "   ", width: "180%", maxHeight: -1 })).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig({ shortcut: "alt+u", width: 100, maxHeight: "60%" })).toEqual({
      shortcut: "alt+u",
      width: 100,
      maxHeight: "60%",
    });
  });
});
```

- [ ] **Step 2: Run config tests to verify they fail**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: FAIL because `../src/config.ts` does not exist.

- [ ] **Step 3: Implement config module**

Write `src/config.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SizeValue } from "@earendil-works/pi-tui";

export interface BulletinConfig {
  shortcut: string;
  width: SizeValue;
  maxHeight: SizeValue;
}

export const DEFAULT_CONFIG: BulletinConfig = {
  shortcut: "alt+shift+m",
  width: "90%",
  maxHeight: "70%",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeShortcut(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CONFIG.shortcut;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_CONFIG.shortcut;
}

function normalizeSize(value: unknown, fallback: SizeValue): SizeValue {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^(?:[1-9]\d?|100)%$/.test(trimmed)) return trimmed as SizeValue;
  return fallback;
}

export function normalizeConfig(raw: unknown): BulletinConfig {
  if (!isPlainObject(raw)) return { ...DEFAULT_CONFIG };
  return {
    shortcut: normalizeShortcut(raw.shortcut),
    width: normalizeSize(raw.width, DEFAULT_CONFIG.width),
    maxHeight: normalizeSize(raw.maxHeight, DEFAULT_CONFIG.maxHeight),
  };
}

export function loadConfig(baseDir = dirname(fileURLToPath(import.meta.url))): BulletinConfig {
  const configPath = join(baseDir, "config.json");
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    return normalizeConfig(JSON.parse(readFileSync(configPath, "utf8")));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
```

- [ ] **Step 4: Run config tests to verify they pass**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck config**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit config module**

Run:

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add bulletin board config loader"
```

Expected: commit succeeds.

---

### Task 3: Bulletin store and session reconstruction

**Files:**
- Create: `tests/bulletin-store.test.ts`
- Create: `src/bulletin-store.ts`

- [ ] **Step 1: Write failing store tests**

Write `tests/bulletin-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BulletinStore,
  CLEAR_CUSTOM_TYPE,
  ITEM_CUSTOM_TYPE,
  createBulletinEntry,
  reconstructBulletins,
  type SessionEntryLike,
} from "../src/bulletin-store.ts";

const fixedDate = "2026-06-01T10:00:00.000Z";

function custom(customType: string, data: unknown): SessionEntryLike {
  return { type: "custom", customType, data };
}

describe("createBulletinEntry", () => {
  it("normalizes fields and defaults priority to normal", () => {
    const entry = createBulletinEntry(
      {
        title: "  Direction changed  ",
        message: "  Found a better path.  ",
        tags: [" review ", "", "plan"],
      },
      { id: "b-1", createdAt: fixedDate },
    );

    expect(entry).toEqual({
      id: "b-1",
      createdAt: fixedDate,
      title: "Direction changed",
      message: "Found a better path.",
      priority: "normal",
      tags: ["review", "plan"],
    });
  });

  it("preserves markdown details and valid priority", () => {
    const entry = createBulletinEntry(
      {
        title: "Evidence found",
        message: "The logs point to a deploy window.",
        priority: "high",
        markdownDetails: "## Evidence\n- deploy at 10:00\n- errors at 10:01",
      },
      { id: "b-2", createdAt: fixedDate },
    );

    expect(entry.priority).toBe("high");
    expect(entry.markdownDetails).toContain("## Evidence");
  });

  it("rejects empty required fields", () => {
    expect(() => createBulletinEntry({ title: "", message: "ok" }, { id: "b", createdAt: fixedDate })).toThrow(
      "title is required",
    );
    expect(() => createBulletinEntry({ title: "ok", message: "" }, { id: "b", createdAt: fixedDate })).toThrow(
      "message is required",
    );
  });
});

describe("reconstructBulletins", () => {
  it("reconstructs entries in order", () => {
    const first = createBulletinEntry({ title: "One", message: "First" }, { id: "b-1", createdAt: fixedDate });
    const second = createBulletinEntry({ title: "Two", message: "Second" }, { id: "b-2", createdAt: fixedDate });

    expect(reconstructBulletins([custom(ITEM_CUSTOM_TYPE, first), custom(ITEM_CUSTOM_TYPE, second)])).toEqual([
      first,
      second,
    ]);
  });

  it("applies latest clear marker", () => {
    const first = createBulletinEntry({ title: "One", message: "First" }, { id: "b-1", createdAt: fixedDate });
    const second = createBulletinEntry({ title: "Two", message: "Second" }, { id: "b-2", createdAt: fixedDate });

    expect(
      reconstructBulletins([
        custom(ITEM_CUSTOM_TYPE, first),
        custom(CLEAR_CUSTOM_TYPE, { clearedAt: "2026-06-01T10:01:00.000Z" }),
        custom(ITEM_CUSTOM_TYPE, second),
      ]),
    ).toEqual([second]);
  });

  it("ignores malformed custom entries", () => {
    expect(reconstructBulletins([custom(ITEM_CUSTOM_TYPE, { title: "bad" }), custom("other", {})])).toEqual([]);
  });
});

describe("BulletinStore", () => {
  it("tracks unread count only while hidden", () => {
    const store = new BulletinStore({ now: () => new Date(fixedDate), idFactory: () => "b-1" });

    store.publish({ title: "Hidden update", message: "Unread while hidden" });
    expect(store.getUnreadCount()).toBe(1);

    store.setVisible(true);
    expect(store.getUnreadCount()).toBe(0);

    store.publish({ title: "Visible update", message: "No unread increment" });
    expect(store.getUnreadCount()).toBe(0);
  });

  it("clears entries and unread count", () => {
    const store = new BulletinStore({ now: () => new Date(fixedDate), idFactory: () => "b-1" });

    store.publish({ title: "Hidden update", message: "Unread while hidden" });
    store.clear();

    expect(store.getEntries()).toEqual([]);
    expect(store.getUnreadCount()).toBe(0);
  });

  it("resets from session entries as already read", () => {
    const entry = createBulletinEntry({ title: "Restored", message: "From session" }, { id: "b-1", createdAt: fixedDate });
    const store = new BulletinStore();

    store.resetFromSessionEntries([custom(ITEM_CUSTOM_TYPE, entry)]);

    expect(store.getEntries()).toEqual([entry]);
    expect(store.getUnreadCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run store tests to verify they fail**

Run:

```bash
npm test -- tests/bulletin-store.test.ts
```

Expected: FAIL because `../src/bulletin-store.ts` does not exist.

- [ ] **Step 3: Implement bulletin store**

Write `src/bulletin-store.ts`:

```ts
export const ITEM_CUSTOM_TYPE = "bulletin-board:item";
export const CLEAR_CUSTOM_TYPE = "bulletin-board:clear";

export const BULLETIN_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type BulletinPriority = (typeof BULLETIN_PRIORITIES)[number];

export interface PublishBulletinInput {
  title: string;
  message: string;
  priority?: BulletinPriority;
  markdownDetails?: string;
  tags?: string[];
}

export interface BulletinEntry {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  priority: BulletinPriority;
  markdownDetails?: string;
  tags?: string[];
}

export interface SessionEntryLike {
  type?: string;
  customType?: string;
  data?: unknown;
}

interface EntryMetadata {
  id: string;
  createdAt: string;
}

interface BulletinStoreOptions {
  now?: () => Date;
  idFactory?: () => string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: "title" | "message"): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePriority(value: unknown): BulletinPriority {
  return BULLETIN_PRIORITIES.includes(value as BulletinPriority) ? (value as BulletinPriority) : "normal";
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

export function createBulletinEntry(input: PublishBulletinInput, metadata: EntryMetadata): BulletinEntry {
  const entry: BulletinEntry = {
    id: metadata.id,
    createdAt: metadata.createdAt,
    title: requiredText(input.title, "title"),
    message: requiredText(input.message, "message"),
    priority: normalizePriority(input.priority),
  };

  const markdownDetails = optionalText(input.markdownDetails);
  if (markdownDetails) entry.markdownDetails = markdownDetails;

  const tags = normalizeTags(input.tags);
  if (tags) entry.tags = tags;

  return entry;
}

function parseStoredBulletin(data: unknown): BulletinEntry | undefined {
  if (!isPlainObject(data)) return undefined;
  if (typeof data.id !== "string" || !data.id.trim()) return undefined;
  if (typeof data.createdAt !== "string" || !data.createdAt.trim()) return undefined;
  if (typeof data.title !== "string" || !data.title.trim()) return undefined;
  if (typeof data.message !== "string" || !data.message.trim()) return undefined;

  return createBulletinEntry(
    {
      title: data.title,
      message: data.message,
      priority: normalizePriority(data.priority),
      markdownDetails: optionalText(data.markdownDetails),
      tags: normalizeTags(data.tags),
    },
    { id: data.id.trim(), createdAt: data.createdAt.trim() },
  );
}

export function reconstructBulletins(entries: readonly SessionEntryLike[]): BulletinEntry[] {
  let bulletins: BulletinEntry[] = [];

  for (const entry of entries) {
    if (entry.type !== "custom") continue;

    if (entry.customType === CLEAR_CUSTOM_TYPE) {
      bulletins = [];
      continue;
    }

    if (entry.customType !== ITEM_CUSTOM_TYPE) continue;
    const bulletin = parseStoredBulletin(entry.data);
    if (bulletin) bulletins.push(bulletin);
  }

  return bulletins;
}

export class BulletinStore {
  private entries: BulletinEntry[] = [];
  private unreadCount = 0;
  private visible = false;
  private now: () => Date;
  private idFactory: () => string;

  constructor(options: BulletinStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => `bulletin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  resetFromSessionEntries(entries: readonly SessionEntryLike[]): void {
    this.entries = reconstructBulletins(entries);
    this.unreadCount = 0;
  }

  publish(input: PublishBulletinInput): BulletinEntry {
    const entry = createBulletinEntry(input, {
      id: this.idFactory(),
      createdAt: this.now().toISOString(),
    });

    this.entries.push(entry);
    if (!this.visible) this.unreadCount += 1;
    return entry;
  }

  clear(): void {
    this.entries = [];
    this.unreadCount = 0;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.unreadCount = 0;
  }

  isVisible(): boolean {
    return this.visible;
  }

  getEntries(): readonly BulletinEntry[] {
    return this.entries;
  }

  getUnreadCount(): number {
    return this.unreadCount;
  }
}
```

- [ ] **Step 4: Run store tests to verify they pass**

Run:

```bash
npm test -- tests/bulletin-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit store module**

Run:

```bash
git add src/bulletin-store.ts tests/bulletin-store.test.ts
git commit -m "feat: add session-backed bulletin store"
```

Expected: commit succeeds.

---

### Task 4: Rendering helpers and read-only overlay component

**Files:**
- Create: `tests/bulletin-render.test.ts`
- Create: `src/bulletin-overlay.ts`

- [ ] **Step 1: Write failing render tests**

Write `tests/bulletin-render.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  formatBulletinTime,
  renderBulletinContent,
  renderBulletinEntry,
  type MarkdownRenderer,
} from "../src/bulletin-overlay.ts";
import type { BulletinEntry } from "../src/bulletin-store.ts";

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
});
```

- [ ] **Step 2: Run render tests to verify they fail**

Run:

```bash
npm test -- tests/bulletin-render.test.ts
```

Expected: FAIL because `../src/bulletin-overlay.ts` does not exist.

- [ ] **Step 3: Implement rendering helpers and overlay**

Write `src/bulletin-overlay.ts`:

```ts
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
  type TUI,
} from "@earendil-works/pi-tui";
import type { BulletinEntry, BulletinStore } from "./bulletin-store.ts";

export type MarkdownRenderer = (markdown: string, width: number) => string[];

export interface BulletinOverlayOptions {
  tui: TUI;
  theme: Theme;
  store: BulletinStore;
  shortcut: string;
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
  entries.forEach((entry, index) => {
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

  private frameLine(content: string, width: number): string {
    const { theme } = this.options;
    const borderColor = this.focused ? "border" : "borderMuted";
    const inner = Math.max(0, width - 4);
    const safe = truncateToWidth(content.replaceAll("\r", " "), inner, "...", true);
    return theme.fg(borderColor, "│ ") + padToWidth(safe, inner) + theme.fg(borderColor, " │");
  }

  private maxVisibleContentLines(): number {
    const rows = this.options.tui.terminal.rows ?? process.stdout.rows ?? 24;
    return Math.max(4, Math.floor(rows * 0.7) - 6);
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
    const start = Math.max(0, this.totalContentLines - maxVisible - this.scrollOffset);
    const end = Math.max(0, this.totalContentLines - this.scrollOffset);
    const visible = contentLines.slice(start, end);

    const lines: string[] = [];
    lines.push(theme.fg(borderColor, "┌" + "─".repeat(width - 2) + "┐"));
    lines.push(this.frameLine(`${left}${gap}${right}`, width));
    lines.push(theme.fg(borderColor, "├" + "─".repeat(width - 2) + "┤"));
    for (const line of visible) lines.push(this.frameLine(line, width));
    for (let i = visible.length; i < maxVisible; i += 1) lines.push(this.frameLine("", width));
    lines.push(theme.fg(borderColor, "├" + "─".repeat(width - 2) + "┤"));
    lines.push(this.frameLine(theme.fg("dim", "PgUp/PgDn scroll · Shift+↑/↓ scroll · Esc close"), width));
    lines.push(theme.fg(borderColor, "└" + "─".repeat(width - 2) + "┘"));
    return lines.map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width) : line));
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.options.onClose();
      return;
    }

    const maxOffset = Math.max(0, this.totalContentLines - this.maxVisibleContentLines());
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.shift("up"))) {
      this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 5);
      this.options.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.shift("down"))) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 5);
      this.options.tui.requestRender();
    }
  }

  invalidate(): void {}
}
```

- [ ] **Step 4: Run render tests to verify they pass**

Run:

```bash
npm test -- tests/bulletin-render.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit rendering and overlay**

Run:

```bash
git add src/bulletin-overlay.ts tests/bulletin-render.test.ts
git commit -m "feat: add bulletin board overlay rendering"
```

Expected: commit succeeds.

---

### Task 5: Pi extension integration

**Files:**
- Create: `tests/index.test.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write failing extension registration tests**

Write `tests/index.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import bulletinBoardExtension from "../src/index.ts";

describe("bulletinBoardExtension", () => {
  it("registers the bulletin tool, commands, shortcut, and session handler", () => {
    const pi = {
      on: vi.fn(),
      registerTool: vi.fn(),
      registerShortcut: vi.fn(),
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
    };

    bulletinBoardExtension(pi as never);

    expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "publish_bulletin" }));
    expect(pi.registerShortcut).toHaveBeenCalledWith("alt+shift+m", expect.objectContaining({ description: expect.any(String) }));
    expect(pi.registerCommand).toHaveBeenCalledWith("bulletin", expect.any(Object));
    expect(pi.registerCommand).toHaveBeenCalledWith("bulletin-clear", expect.any(Object));
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
  });
});
```

- [ ] **Step 2: Run index tests to verify they fail**

Run:

```bash
npm test -- tests/index.test.ts
```

Expected: FAIL because `../src/index.ts` does not exist.

- [ ] **Step 3: Implement Pi extension integration**

Write `src/index.ts`:

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { OverlayHandle } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { BulletinOverlay } from "./bulletin-overlay.ts";
import { BulletinStore, CLEAR_CUSTOM_TYPE, ITEM_CUSTOM_TYPE } from "./bulletin-store.ts";
import { loadConfig } from "./config.ts";

const OVERLAY_BLOCKED_ERROR = "PI_BULLETIN_BOARD_OVERLAY_BLOCKED";

const PublishBulletinSchema = Type.Object({
  title: Type.String({
    description: "Short section title shown as the bulletin heading. Not Markdown.",
  }),
  message: Type.String({
    description: "One or two sentence plain-text summary shown below the heading.",
  }),
  priority: Type.Optional(
    StringEnum(["low", "normal", "high", "critical"] as const, {
      description: "General importance label. Defaults to normal.",
    }),
  ),
  markdownDetails: Type.Optional(
    Type.String({
      description:
        "Optional Markdown-formatted details. Supports headings, lists, code blocks, and emphasis; rendered with Pi's normal terminal Markdown styling in the bulletin overlay.",
    }),
  ),
  tags: Type.Optional(
    Type.Array(Type.String({ description: "Short label for scanability." }), {
      description: "Optional short labels shown below the bulletin.",
    }),
  ),
});

type PublishBulletinParams = Static<typeof PublishBulletinSchema>;

function updateStatus(ctx: ExtensionContext, store: BulletinStore): void {
  const unread = store.getUnreadCount();
  if (unread <= 0) {
    ctx.ui.setStatus("bulletin-board", undefined);
    return;
  }

  ctx.ui.setStatus("bulletin-board", ctx.ui.theme.fg("accent", `Bulletins: ${unread} new`));
}

export default function bulletinBoardExtension(pi: ExtensionAPI) {
  const config = loadConfig();
  const store = new BulletinStore();
  let activeOverlay: BulletinOverlay | null = null;
  let overlayHandle: OverlayHandle | null = null;

  const closeOverlay = (ctx?: ExtensionContext) => {
    activeOverlay = null;
    overlayHandle?.hide();
    overlayHandle = null;
    store.setVisible(false);
    if (ctx) updateStatus(ctx, store);
  };

  const openBulletin = async (ctx: ExtensionContext) => {
    if (activeOverlay) {
      closeOverlay(ctx);
      return;
    }

    try {
      await ctx.ui.custom<"close">(
        (tui, theme, _keybindings, done) => {
          if (tui.hasOverlay()) {
            setTimeout(() => ctx.ui.notify("Close or background the current overlay first", "warning"), 0);
            throw new Error(OVERLAY_BLOCKED_ERROR);
          }

          store.setVisible(true);
          updateStatus(ctx, store);

          activeOverlay = new BulletinOverlay({
            tui,
            theme,
            store,
            shortcut: config.shortcut,
            onClose: () => {
              activeOverlay = null;
              overlayHandle = null;
              store.setVisible(false);
              updateStatus(ctx, store);
              done("close");
            },
          });

          return activeOverlay;
        },
        {
          overlay: true,
          overlayOptions: {
            width: config.width,
            maxHeight: config.maxHeight,
            anchor: "top-center",
            margin: { top: 1, left: 2, right: 2 },
            nonCapturing: true,
          },
          onHandle: (handle) => {
            overlayHandle = handle;
            handle.focus();
          },
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message === OVERLAY_BLOCKED_ERROR) return;
      closeOverlay(ctx);
      throw error;
    }
  };

  const toggleBulletin = async (ctx: ExtensionContext) => {
    if (activeOverlay) {
      closeOverlay(ctx);
      return;
    }
    await openBulletin(ctx);
  };

  pi.on("session_start", (_event, ctx) => {
    store.resetFromSessionEntries(ctx.sessionManager.getBranch());
    updateStatus(ctx, store);
  });

  pi.registerTool({
    name: "publish_bulletin",
    label: "Publish Bulletin",
    description: "Publish an important progress update to the read-only bulletin board overlay.",
    promptSnippet: "Publish important long-running task updates to a read-only bulletin board overlay",
    promptGuidelines: [
      "Use publish_bulletin only for important progress updates during long-running work, such as meaningful milestones, direction changes, key findings, blockers, decisions, or useful checkpoints.",
      "Do not use publish_bulletin for every tool call or minor step; keep the main conversation clean and the bulletin board high-signal.",
      "In publish_bulletin, title is a short non-Markdown section heading, message is a concise plain-text summary, and markdownDetails supports Markdown rendered with Pi's normal terminal Markdown styling.",
    ],
    parameters: PublishBulletinSchema,
    async execute(_toolCallId, params: PublishBulletinParams, _signal, _onUpdate, ctx) {
      const entry = store.publish(params);
      pi.appendEntry(ITEM_CUSTOM_TYPE, entry);

      if (activeOverlay) {
        store.setVisible(true);
        updateStatus(ctx, store);
        activeOverlay.requestRender();
      } else {
        updateStatus(ctx, store);
      }

      return {
        content: [{ type: "text", text: `Published bulletin: ${entry.title}` }],
        details: { entryId: entry.id },
      };
    },
  });

  pi.registerShortcut(config.shortcut, {
    description: "Open or focus the bulletin board overlay",
    handler: toggleBulletin,
  });

  pi.registerCommand("bulletin", {
    description: "Open or focus the bulletin board overlay",
    handler: async (_args, ctx) => toggleBulletin(ctx),
  });

  pi.registerCommand("bulletin-clear", {
    description: "Clear bulletin board entries in this session",
    handler: async (_args, ctx) => {
      store.clear();
      pi.appendEntry(CLEAR_CUSTOM_TYPE, { clearedAt: new Date().toISOString() });
      updateStatus(ctx, store);
      activeOverlay?.requestRender();
      ctx.ui.notify("Bulletin board cleared", "info");
    },
  });
}
```

- [ ] **Step 4: Run index tests to verify they pass**

Run:

```bash
npm test -- tests/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit extension integration**

Run:

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: wire bulletin board pi extension"
```

Expected: commit succeeds.

---

### Task 6: Marketing README and usage documentation

**Files:**
- Create: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write README with user-facing marketing content**

Write `README.md`:

```markdown
# pi-bulletin-board

**A high-signal progress overlay for long-running Pi agents.**

When an agent is deep in a long investigation, the main thread gets noisy fast: tool calls, logs, retries, code diffs, and partial reasoning all compete for attention. `pi-bulletin-board` gives the agent a dedicated place to publish the updates that actually matter.

Open the board, scan the latest status, close it, and let the agent keep working.

## Why this exists

Long-running agent work changes direction. An oncall triage may start with a database hypothesis and end at a config rollout. A code review may uncover a test gap, then pivot into API compatibility. A migration may pass most checks, then block on one environment.

Those direction changes should be easy to find.

`pi-bulletin-board` keeps them out of the main thread and in a large read-only overlay designed for quick scanning.

## What it does

- Adds a `publish_bulletin` tool the agent can call for important updates.
- Shows updates in a large top-centered bulletin board overlay.
- Keeps the overlay read-only: no side chat, no extra conversation, no thread derailment.
- Persists bulletins in the Pi session, so `/reload` and session resume keep the board state.
- Shows a small status badge when new bulletins arrive while the board is hidden.
- Renders `markdownDetails` with Pi's normal terminal Markdown styling.

## Use cases

- Oncall triage and incident investigation.
- Thorough code review or architecture review.
- Long debugging sessions.
- Multi-step migrations.
- Test stabilization loops.
- Any task where the agent should surface only meaningful checkpoints.

## Installation

### Local development

From this repository:

```bash
pi -e ./src/index.ts
```

Or install the local package path:

```bash
pi install /Users/bytedance/aec/src/github/pi-agent/pi-bulletin-board
```

### Git distribution

After pushing this repository to a remote, install it as a git package:

```bash
pi install git:github.com/acme/pi-bulletin-board
```

Use an unpinned git source if you want Pi to notify you when the remote default branch has new commits. Use a tag or commit ref when you want reproducible installs.

## Quick start

Ask Pi to work on a long task. When something important happens, the agent can call:

```ts
publish_bulletin({
  title: "Root cause direction changed",
  message: "DB latency appears downstream, not root cause.",
  priority: "high",
  markdownDetails: "## Evidence\n- Spike is isolated to sg1\n- Deploy window aligns with the error burst\n\n## Next\nCompare TCC values and identify rollback candidates.",
  tags: ["sg1", "config", "investigation"]
})
```

Open the overlay:

```text
Alt+Shift+M
```

Or use the command:

```text
/bulletin
```

Clear the board for the current session:

```text
/bulletin-clear
```

## Controls

| Key | Action |
| --- | --- |
| `Alt+Shift+M` | Open or close the bulletin board |
| `Esc` | Close the board while focused |
| `PgUp` / `PgDn` | Page through entries |
| `Shift+↑` / `Shift+↓` | Smooth-scroll entries one line at a time |

## Configuration

Create `config.json` next to the extension file:

```json
{
  "shortcut": "alt+shift+m",
  "width": "90%",
  "maxHeight": "70%"
}
```

If the file is missing or malformed, the extension uses safe defaults.

## Agent guidance

The board is for high-signal updates only. The agent should post when there is a meaningful milestone, direction change, key finding, blocker, decision, or useful checkpoint.

The tool fields are intentionally simple:

- `title`: short section heading, not Markdown.
- `message`: one or two sentence plain-text summary.
- `priority`: `low`, `normal`, `high`, or `critical`.
- `markdownDetails`: optional Markdown rendered with Pi's terminal Markdown styling.
- `tags`: optional short labels.

## Limitations

- One bulletin board overlay at a time.
- No chat input inside the board.
- No individual delete/edit/pin actions in v1.
- No automatic extraction of updates from every tool call.
- Bulletins are session-persistent, not project-file-backed.

## Security

Pi extensions run with your local user permissions. Only install extensions from repositories you trust and review source before installing third-party packages.
```

- [ ] **Step 2: Update changelog**

Replace `CHANGELOG.md` with:

```markdown
# Changelog

## 0.1.0

- Adds `publish_bulletin` tool for important long-running task updates.
- Adds read-only top overlay opened with `Alt+Shift+M` or `/bulletin`.
- Adds `/bulletin-clear` command.
- Persists bulletins in Pi custom session entries.
- Renders `markdownDetails` with Pi terminal Markdown styling.
- Adds config loader and unit test suite.
```

- [ ] **Step 3: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: PASS for both commands.

- [ ] **Step 4: Commit documentation**

Run:

```bash
git add README.md CHANGELOG.md
git commit -m "docs: add bulletin board README"
```

Expected: commit succeeds.

---

### Task 7: Manual Pi verification

**Files:**
- No file changes expected unless verification finds a defect.

- [ ] **Step 1: Run the extension in Pi from the package directory**

Run:

```bash
cd /Users/bytedance/aec/src/github/pi-agent/pi-bulletin-board
pi -e ./src/index.ts
```

Expected: Pi starts without extension load errors.

- [ ] **Step 2: Verify slash commands appear and overlay opens**

Inside Pi, run:

```text
/bulletin
```

Expected: a large, top-centered empty bulletin board overlay opens with the empty state text.

- [ ] **Step 3: Verify shortcut behavior**

Inside Pi:

```text
Alt+Shift+M
Alt+Shift+M
Esc
```

Expected:

- `Alt+Shift+M` opens the board if closed.
- `Alt+Shift+M` closes the board when open.
- `Esc` closes the board when focused.

- [ ] **Step 4: Verify agent tool behavior with a direct prompt**

In Pi, ask:

```text
Use publish_bulletin to post a high-priority update titled "Manual verification". Message: "The bulletin board extension loaded and the overlay opened." markdownDetails: "## Evidence\n- /bulletin opened the overlay\n- Alt+Shift+M closed the overlay" tags: ["manual-test"]
```

Expected:

- The agent calls `publish_bulletin`.
- Main thread receives only a concise tool result confirmation.
- The footer/status badge shows a new bulletin when the board is hidden.
- Opening `/bulletin` shows the posted entry with structured title and Markdown-rendered details.

- [ ] **Step 5: Verify clear command**

Inside Pi, run:

```text
/bulletin-clear
/bulletin
```

Expected: board shows the empty state and unread badge is gone.

- [ ] **Step 6: Run final automated verification**

Run:

```bash
cd /Users/bytedance/aec/src/github/pi-agent/pi-bulletin-board
npm test
npm run typecheck
git status --short
```

Expected:

- `npm test`: PASS.
- `npm run typecheck`: PASS.
- `git status --short`: clean, or only intentional verification fixes remain.

- [ ] **Step 7: Commit verification fixes if any were needed**

If Step 6 shows intentional code or docs fixes, run:

```bash
git add .
git commit -m "fix: polish bulletin board verification issues"
```

Expected: commit succeeds. If no fixes were needed, skip this step.

---

## Self-review checklist

Spec coverage:

- Repository is git-distributed and not npm-published: Task 1 and Task 6.
- Agent-facing `publish_bulletin` tool: Task 5.
- Session-persistent custom entries: Task 3 and Task 5.
- Wide read-only top overlay: Task 4.
- `Alt+Shift+M`, `/bulletin`, `/bulletin-clear`: Task 5 and Task 7.
- `markdownDetails` with explicit Markdown styling guidance: Task 5 and Task 6.
- Status badge for hidden updates: Task 5 and Task 7.
- Dedicated `tests/` folder: Tasks 2 through 5.
- Marketing README: Task 6.

Placeholder scan:

- No unfinished placeholder tokens or incomplete implementation steps are present.
- Example remote uses `github.com/acme/pi-bulletin-board` as documentation sample text, while local development commands use the actual repository path.

Type consistency:

- Tool field name is `markdownDetails` in schema, store, render tests, README, and manual verification.
- Custom entry names are `bulletin-board:item` and `bulletin-board:clear` in store and index.
- Priority values are `low`, `normal`, `high`, and `critical` everywhere.
