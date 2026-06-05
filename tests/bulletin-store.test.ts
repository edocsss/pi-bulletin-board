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
