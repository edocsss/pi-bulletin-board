# Bulletin Board Pi Extension Design

Date: 2026-06-01

## Goal

Create a standalone, git-distributed Pi extension named `pi-bulletin-board`. The extension provides a read-only bulletin board overlay where the agent can publish important progress updates during long-running work. The board should keep the main conversation clean while giving the user a clear place to check current status, direction changes, findings, blockers, and milestones.

The first implementation is intentionally simple: one agent-facing publish tool, one large top overlay, session-persistent entries, and basic open/clear commands. The repository will not be published to npm.

## Non-goals

- No chat input inside the overlay.
- No automatic summarization of every tool call or assistant message.
- No project-file-backed bulletin log in v1.
- No remote repository setup in v1.
- No filtering, pinning, editing, deleting individual entries, or archive workflow in v1.

## Repository and package structure

Create a new git repository at:

```text
/Users/bytedance/aec/src/github/pi-agent/pi-bulletin-board
```

Recommended layout:

```text
pi-bulletin-board/
├── package.json
├── README.md
├── CHANGELOG.md
├── src/
│   ├── bulletin-overlay.ts
│   ├── bulletin-store.ts
│   ├── config.ts
│   └── index.ts
├── vitest.config.mjs
├── tests/
│   ├── bulletin-store.test.ts
│   ├── bulletin-render.test.ts
│   └── config.test.ts
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-06-01-bulletin-board-design.md
```

`package.json` should be suitable for git-based Pi package distribution:

```json
{
  "name": "pi-bulletin-board",
  "private": true,
  "type": "module",
  "keywords": ["pi-package", "pi", "extension", "bulletin-board"],
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

Use current Pi extension imports from the installed Pi docs, including:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

Runtime Pi packages should be listed as peer dependencies with `"*"` ranges if needed. Test-only packages such as `vitest` belong in `devDependencies`.

## README requirement

The repository must include a polished `README.md` with marketing-oriented content, not just API notes. It should include:

- A concise product tagline.
- The problem: long-running agents produce noisy main-thread output and users need a clean progress surface.
- The solution: a read-only bulletin board overlay for important updates.
- A quick-start install section for future git distribution.
- A short demo workflow showing `publish_bulletin` updates appearing in the overlay.
- Use cases such as oncall triage, long code reviews, multi-step investigations, migrations, and test/debug loops.
- Keyboard controls and commands.
- Configuration example.
- Limitations and security notes.

The README should be written as if it is user-facing package marketing, while remaining accurate about the v1 feature set.

## Extension responsibilities

### `index.ts`

Registers the Pi extension surface:

- `publish_bulletin` tool.
- `Alt+Shift+M` shortcut by default.
- `/bulletin` command to open or toggle the overlay.
- `/bulletin-clear` command to clear the current board.
- session lifecycle handlers to reconstruct state on startup/reload/resume.
- status badge updates for unread bulletins.

### `bulletin-store.ts`

Owns state and branch reconstruction:

- stores `BulletinEntry` objects in memory.
- appends session custom entries via `pi.appendEntry` when publishing or clearing.
- reconstructs entries from the current session branch on `session_start`.
- applies clear markers so entries before the latest clear marker are hidden.
- tracks unread count while the overlay is hidden.
- marks entries read when the overlay opens.

### `bulletin-overlay.ts`

Renders the read-only overlay:

- large top overlay, visually similar to `pi-side-chat`, but without an editor.
- scrollable list of bulletins.
- structured header per entry.
- Pi-themed markdown rendering for `markdownDetails`.
- empty state when there are no bulletins.
- keyboard handling for close and scroll.

### `config.ts`

Loads optional local config next to the extension and falls back safely to defaults.

## Bulletin tool design

Register one agent-facing tool:

```ts
publish_bulletin({
  title: string,
  message: string,
  priority?: "low" | "normal" | "high" | "critical",
  markdownDetails?: string,
  tags?: string[]
})
```

Parameter meanings:

- `title`: short section title shown as the bulletin heading. Not Markdown.
- `message`: one or two sentence summary shown below the heading. Plain text.
- `priority`: optional general importance label. Defaults to `normal`.
- `markdownDetails`: optional Markdown-formatted details. Supports headings, lists, code blocks, and emphasis. The overlay renders this field with Pi's normal terminal Markdown styling.
- `tags`: optional short labels for scanability.

Tool guidance should be explicit:

- Use `publish_bulletin` only for important progress updates during long-running work.
- Do not post every tool call or minor step.
- Post when there is a meaningful milestone, direction change, key finding, blocker, decision, or useful checkpoint.
- Keep `title` and `message` concise.
- Use `markdownDetails` when structure improves readability; Markdown headings/lists/code blocks are rendered in the bulletin overlay with Pi styling.

The tool should return a concise confirmation to the agent, such as:

```text
Published bulletin: Root cause direction changed
```

The full bulletin content is stored in custom session entries rather than repeated in the main conversation.

## Data model

```ts
type BulletinPriority = "low" | "normal" | "high" | "critical";

interface BulletinEntry {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  priority: BulletinPriority;
  markdownDetails?: string;
  tags?: string[];
}
```

Publishing appends:

```ts
pi.appendEntry("bulletin-board:item", entry)
```

Clearing appends:

```ts
pi.appendEntry("bulletin-board:clear", { clearedAt: string })
```

Reconstruction scans the current session branch in order and returns entries after the latest clear marker. This keeps state attached to the Pi session and avoids project-local data files.

## Overlay design

Use a large, wide top overlay:

```ts
ctx.ui.custom(..., {
  overlay: true,
  overlayOptions: {
    width: "90%",
    maxHeight: "70%",
    anchor: "top-center",
    margin: { top: 1, left: 2, right: 2 },
    nonCapturing: true
  }
})
```

The selected visual direction is the wide top overlay. It should be large enough for substantial status updates while keeping the main editor visible underneath.

Entry rendering should separate the structured title from Markdown content:

```text
────────────────────────────────────────
14:18  HIGH
Root cause direction changed
────────────────────────────────────────

DB latency appears downstream, not root cause.

## Evidence
- sg1-only spike
- deploy window aligns with error burst

## Next
Compare TCC values and rollback candidate config.

Tags: sg1, config, investigation
```

Rendering rules:

- Timestamp, priority, title, divider, message, and tags are rendered by the overlay component.
- `title` is a visible section header and is not interpreted as Markdown.
- `message` is plain text.
- `markdownDetails` is rendered through Pi's Markdown component/theme so section headers, lists, emphasis, and code blocks receive normal Pi terminal markdown styling.
- The board scrolls when content exceeds the overlay height.

Empty state:

```text
No bulletins yet.
Long-running agents can post important updates with publish_bulletin.
```

## Controls and commands

Default shortcut:

```text
Alt+Shift+M
```

Shortcut behavior mirrors the side-chat pattern:

- if closed: open overlay.
- if open: close overlay.

Overlay controls:

```text
Esc              close while focused
PgUp / PgDn     page scroll
Shift+↑ / ↓     smooth one-line scroll
Alt+Shift+M           open/close
```

Commands:

```text
/bulletin        open or toggle the board
/bulletin-clear  clear the current board
```

## Status badge and unread behavior

When the board is hidden and new bulletins arrive, the extension should not auto-open the overlay. Instead it updates a footer/status badge, for example:

```text
Bulletins: 2 new
```

Opening the overlay marks all current entries as read and clears the unread badge. New entries while the overlay is visible should trigger a render refresh and remain visible in the board.

## Configuration

Optional `config.json` next to the extension:

```json
{
  "shortcut": "alt+shift+m",
  "width": "90%",
  "maxHeight": "70%"
}
```

Defaults:

```ts
{
  shortcut: "alt+shift+m",
  width: "90%",
  maxHeight: "70%"
}
```

Malformed or missing config should fall back silently to defaults.

## Error handling

- If another overlay is already active, notify: `Close or background the current overlay first`.
- If config cannot be read or parsed, use defaults.
- If `markdownDetails` is long, rely on overlay scrolling rather than truncating in v1.
- Validate tool inputs through the TypeBox schema.
- Normalize missing `priority` to `normal`.
- Normalize empty or whitespace-only `tags` out of the stored entry.

## Testing plan

Use Vitest with tests in a top-level `tests/` folder.

Required tests:

### `tests/bulletin-store.test.ts`

- publishes entries in order.
- reconstructs entries from session-like custom entries.
- applies the latest clear marker.
- normalizes default priority to `normal`.
- tracks unread count when hidden.
- marks entries read when opened.

### `tests/bulletin-render.test.ts`

- renders title as a separate structured section header.
- renders priority and timestamp outside the markdown body.
- passes `markdownDetails` through the markdown rendering path.
- renders empty state when no entries exist.
- handles long content via scroll state.

### `tests/config.test.ts`

- returns defaults when config is missing.
- returns defaults when config is malformed.
- accepts valid shortcut, width, and maxHeight overrides.

## Acceptance criteria

- A fresh git repo exists at `pi-agent/pi-bulletin-board`.
- `pi install git:<repo-url>` will be the intended distribution model once a remote exists.
- The extension registers `publish_bulletin`, `/bulletin`, `/bulletin-clear`, and `Alt+Shift+M`.
- The agent can publish concise bulletins without adding noisy progress text to the main thread.
- Bulletins persist across `/reload` and session resume via Pi custom session entries.
- The overlay is read-only, wide, top-centered, scrollable, and large enough for long-running task updates.
- The overlay clearly separates title/message from Markdown details.
- Tool docs explicitly state that `markdownDetails` supports Markdown and is rendered with Pi styling.
- Hidden-board updates show a status badge instead of auto-opening.
- README contains polished marketing/user-facing content.
- Unit tests live under `tests/` and cover store, rendering, and config behavior.
