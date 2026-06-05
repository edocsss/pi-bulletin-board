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
pi install /Users/bytedance/aec/src/github/pi-bulletin-board
```

### NPM package

After this package is published to npm, install it with:

```bash
pi install npm:pi-bulletin-board
```

Before publishing, verify the package contents without publishing:

```bash
npm run pack:check
```

To build a local tarball for install testing:

```bash
npm run pack:local
pi install ./pi-bulletin-board-0.1.0.tgz
```

### Git distribution

After pushing this repository to a remote, install it as a git package:

```bash
pi install git:github.com/edocsss/pi-bulletin-board
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
