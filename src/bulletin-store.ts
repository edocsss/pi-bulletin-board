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
