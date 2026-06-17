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
  it("uses 85% as the default max height", () => {
    expect(DEFAULT_CONFIG.maxHeight).toBe("85%");
  });

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
