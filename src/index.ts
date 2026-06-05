import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { KeyId, OverlayHandle } from "@earendil-works/pi-tui";
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
        "Optional raw Markdown details shown below the summary. Use headings, bullet lists, emphasis, and inline code directly. Do not wrap the entire content in a fenced code block such as ```text; fenced code blocks should only be used for actual code or log snippets, because anything inside a fence is rendered as literal text and Markdown formatting will not apply.",
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
            maxHeight: config.maxHeight,
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

  const toggleBulletinInBackground = (ctx: ExtensionContext) => {
    void toggleBulletin(ctx).catch((error: unknown) => {
      closeOverlay(ctx);
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Bulletin board error: ${message}`, "error");
    });
  };

  const resetFromCurrentBranch = (ctx: ExtensionContext) => {
    store.resetFromSessionEntries(ctx.sessionManager.getBranch());
    updateStatus(ctx, store);
    activeOverlay?.requestRender();
  };

  pi.on("session_start", (_event, ctx) => resetFromCurrentBranch(ctx));
  pi.on("session_tree", (_event, ctx) => resetFromCurrentBranch(ctx));

  pi.registerTool({
    name: "publish_bulletin",
    label: "Publish Bulletin",
    description: "Publish an important progress update to the read-only bulletin board overlay.",
    promptSnippet: "Publish important long-running task updates to a read-only bulletin board overlay",
    promptGuidelines: [
      "Use publish_bulletin only for important progress updates during long-running work, such as meaningful milestones, direction changes, key findings, blockers, decisions, or useful checkpoints.",
      "Do not use publish_bulletin for every tool call or minor step; keep the main conversation clean and the bulletin board high-signal.",
      "In publish_bulletin, title is a short non-Markdown section heading, message is a concise plain-text summary, and markdownDetails should be raw Markdown, not a single fenced text block. Use `##` headings and `-` lists directly; reserve fenced code blocks only for real code or log excerpts.",
    ],
    parameters: PublishBulletinSchema,
    async execute(_toolCallId, params: PublishBulletinParams, _signal, _onUpdate, ctx) {
      const entry = store.publish(params);
      pi.appendEntry(ITEM_CUSTOM_TYPE, entry);

      if (activeOverlay) {
        store.setVisible(true);
        updateStatus(ctx, store);
        activeOverlay.scrollToLatest();
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

  pi.registerShortcut(config.shortcut as KeyId, {
    description: "Open or close the bulletin board overlay",
    handler: toggleBulletinInBackground,
  });

  pi.registerCommand("bulletin", {
    description: "Open or close the bulletin board overlay",
    handler: async (_args, ctx) => {
      toggleBulletinInBackground(ctx);
    },
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
