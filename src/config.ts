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
