import type {
  ColumnType,
  Event,
  Row,
  Schema,
  SchemaChange,
  SchemaColumn,
  Table,
} from "./types";

const cloneValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      clone[key] = cloneValue(val);
    });
    return clone as T;
  }
  return value;
};

const cloneRow = (row: Row): Row => cloneValue(row);

const cloneSchemaColumn = (column: SchemaColumn): SchemaColumn => ({ ...column });

const cloneSchema = (schema: Schema): Schema => ({
  name: schema.name,
  version: schema.version,
  columns: schema.columns.map(cloneSchemaColumn),
});

const inferColumnType = (key: string, value: unknown): ColumnType => {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") {
    if (/_ts$|timestamp$/i.test(key)) return "timestamp";
    return "number";
  }
  if (value instanceof Date) return "timestamp";
  return "string";
};

type TableState = {
  schema: Schema;
  rows: Map<string, Row>;
  /** Version of the newest change applied per key; only kept when a guard or delete markers are on. */
  versions: Map<string, KeyVersion>;
  /** Keys whose latest change was a delete, kept as a marker instead of being forgotten. */
  tombstones: Map<string, KeyVersion>;
  /** Highest source position applied per key, kept always so stale applies can be counted. */
  highestApplied: Map<string, number>;
};

type KeyVersion = {
  /** Source log position of the change (sourcePosition, else the bus offset). */
  position?: number;
  /** The envelope ts_ms (commitTs) of the change. */
  ts: number;
};

/**
 * How the destination decides whether to apply a change event.
 *
 * - `none`: apply every delivery in arrival order (an unconditional upsert).
 *   This is the original behaviour and the default.
 * - `timestamp`: keep a change only if its `ts_ms` is strictly newer than the
 *   one last applied for the key. A naive guard: timestamps tie and skew.
 * - `position`: keep a change only if its source log position is higher than
 *   the one last applied for the key. This is the guard the lessons teach.
 */
export type SinkGuardMode = "none" | "timestamp" | "position";

export const SINK_GUARD_MODES: readonly SinkGuardMode[] = ["none", "timestamp", "position"];

export type SinkOptions = {
  guard?: SinkGuardMode;
  /**
   * When true a delete keeps a marker (key, position, ts_ms) instead of
   * forgetting the key, so a guard can recognise a late older change. When
   * false the row and its version are removed, as before.
   */
  deleteMarkers?: boolean;
};

export type SinkStats = {
  /** Change events that were applied to a row or recorded as a delete. */
  applied: number;
  /** Change events the guard refused to apply. */
  skipped: number;
  /**
   * Change events that were applied although the destination had already applied
   * the same or a later source position for that key: a repeat or a regression.
   */
  staleApplied: number;
};

export type SinkTombstone = { id: string; position?: number; ts: number };

const isSinkGuardMode = (value: unknown): value is SinkGuardMode =>
  value === "none" || value === "timestamp" || value === "position";

const createEmptySchema = (tableName: string, version = 1): Schema => ({
  name: tableName,
  version,
  columns: [
    {
      name: "id",
      type: "string",
      nullable: false,
    },
  ],
});

const ensureIdColumn = (schema: Schema) => {
  const hasId = schema.columns.some(column => column.name === "id");
  if (!hasId) {
    schema.columns.unshift({ name: "id", type: "string", nullable: false });
  }
};

const normaliseRow = (row: Row): Row => {
  const clone = cloneRow(row);
  clone.id = String(clone.id);
  return clone;
};

/** The position used to order a change: the original log position of a redelivery, else the bus offset. */
const sourcePositionOf = (event: Event): number | undefined =>
  typeof event.sourcePosition === "number"
    ? event.sourcePosition
    : typeof event.offset === "number"
      ? event.offset
      : undefined;

export type StorageSnapshot = Table[];

export type ReplayEventsOptions = {
  /**
   * Optional tables to seed before replaying events. They will be cloned
   * internally so callers retain their original references.
   */
  initialTables?: Table[];
  /**
   * When enabled, tables with zero rows after replay will be excluded from the
   * returned snapshot.
   */
  pruneEmptyTables?: boolean;
};

export class InMemoryTableStorage {
  private readonly tables = new Map<string, TableState>();
  private guard: SinkGuardMode = "none";
  private deleteMarkers = false;
  private stats: SinkStats = { applied: 0, skipped: 0, staleApplied: 0 };

  constructor(initialTables: Table[] = [], options: SinkOptions = {}) {
    this.configureSink(options);
    initialTables.forEach(table => this.upsertTable(table));
  }

  /** Set the guard mode and delete handling. Does not touch stored rows. */
  configureSink(options: SinkOptions = {}): void {
    this.guard = isSinkGuardMode(options.guard) ? options.guard : "none";
    this.deleteMarkers = Boolean(options.deleteMarkers);
  }

  getSinkOptions(): Required<SinkOptions> {
    return { guard: this.guard, deleteMarkers: this.deleteMarkers };
  }

  getSinkStats(): SinkStats {
    return { ...this.stats };
  }

  /** Delete markers currently held, oldest table first. Empty unless `deleteMarkers` is on. */
  getTombstones(tableName?: string): Array<SinkTombstone & { table: string }> {
    const result: Array<SinkTombstone & { table: string }> = [];
    this.tables.forEach((state, name) => {
      if (tableName && name !== tableName) return;
      state.tombstones.forEach((version, id) => {
        result.push({ table: name, id, position: version.position, ts: version.ts });
      });
    });
    return result;
  }

  upsertTable(table: Table): void {
    const schema = cloneSchema(table.schema);
    ensureIdColumn(schema);
    const rows = new Map<string, Row>();
    table.rows.forEach(row => {
      const normalised = normaliseRow(cloneRow(row));
      rows.set(normalised.id, normalised);
    });
    this.tables.set(table.name, {
      schema,
      rows,
      versions: new Map<string, KeyVersion>(),
      tombstones: new Map<string, KeyVersion>(),
      highestApplied: new Map<string, number>(),
    });
  }

  replaceAll(tables: Table[]): void {
    this.tables.clear();
    tables.forEach(table => this.upsertTable(table));
  }

  getTable(name: string): Table | undefined {
    const state = this.tables.get(name);
    if (!state) return undefined;
    return {
      name,
      schema: cloneSchema(state.schema),
      rows: Array.from(state.rows.values()).map(row => cloneRow(row)),
    };
  }

  listTables(): Table[] {
    return Array.from(this.tables.keys())
      .map(name => this.getTable(name))
      .filter((table): table is Table => Boolean(table));
  }

  clear(): void {
    this.tables.clear();
    this.stats = { applied: 0, skipped: 0, staleApplied: 0 };
  }

  applyEvents(events: Event[]): void {
    events.forEach(event => this.applyEvent(event));
  }

  applyEvent(event: Event): void {
    if (!event?.table) return;
    if (event.kind === "SCHEMA_ADD_COL" || event.kind === "SCHEMA_DROP_COL") {
      this.applySchemaChange(event);
      return;
    }
    const state = this.ensureTableState(event.table, event.schemaVersion);
    if (event.schemaVersion && event.schemaVersion > state.schema.version) {
      state.schema.version = event.schemaVersion;
    }

    if (event.kind === "DELETE") {
      const id = event.before?.id ?? event.after?.id;
      if (id == null) return;
      const key = String(id);
      if (!this.admit(state, key, event)) return;
      state.rows.delete(key);
      if (this.deleteMarkers) {
        const version = this.versionOf(event);
        state.tombstones.set(key, version);
        state.versions.set(key, version);
      } else {
        // Without a marker the key's version is forgotten with the row, so a
        // later older change for it looks like a brand new key.
        state.versions.delete(key);
        state.tombstones.delete(key);
      }
      return;
    }

    const payload = event.after ?? undefined;
    if (!payload) return;
    const normalised = normaliseRow(payload);
    if (!this.admit(state, normalised.id, event)) return;
    if (this.guard !== "none" || this.deleteMarkers) {
      state.versions.set(normalised.id, this.versionOf(event));
    }
    state.tombstones.delete(normalised.id);
    const existing = state.rows.get(normalised.id);
    const mergedData = existing ? ({ ...existing, ...normalised } as Row) : normalised;
    const merged = cloneRow(mergedData);
    this.syncSchemaColumns(state, merged);
    state.rows.set(merged.id, merged);
  }

  private versionOf(event: Event): KeyVersion {
    return { position: sourcePositionOf(event), ts: event.commitTs };
  }

  /**
   * Decide whether a row change is applied, and keep the counters. A change
   * without a position cannot be compared by the position guard and is applied.
   */
  private admit(state: TableState, key: string, event: Event): boolean {
    const position = sourcePositionOf(event);
    const known = state.versions.get(key);
    if (known) {
      if (this.guard === "position" && position != null && known.position != null) {
        if (position <= known.position) {
          this.stats.skipped += 1;
          return false;
        }
      } else if (this.guard === "timestamp") {
        if (!(event.commitTs > known.ts)) {
          this.stats.skipped += 1;
          return false;
        }
      }
    }
    const highest = state.highestApplied.get(key);
    if (position != null) {
      if (highest != null && position <= highest) {
        this.stats.staleApplied += 1;
      } else {
        state.highestApplied.set(key, position);
      }
    }
    this.stats.applied += 1;
    return true;
  }

  snapshot(): StorageSnapshot {
    return this.listTables();
  }

  private ensureTableState(tableName: string, version?: number): TableState {
    let state = this.tables.get(tableName);
    if (!state) {
      state = {
        schema: createEmptySchema(tableName, version ?? 1),
        rows: new Map<string, Row>(),
        versions: new Map<string, KeyVersion>(),
        tombstones: new Map<string, KeyVersion>(),
        highestApplied: new Map<string, number>(),
      };
      this.tables.set(tableName, state);
    }
    if (version && version > state.schema.version) {
      state.schema.version = version;
    }
    ensureIdColumn(state.schema);
    return state;
  }

  private applySchemaChange(event: Event & { schemaChange?: SchemaChange }): void {
    const change = event.schemaChange;
    if (!change) return;
    const state = this.ensureTableState(event.table, change.nextVersion ?? event.schemaVersion);
    state.schema.version = Math.max(
      state.schema.version,
      change.nextVersion ?? event.schemaVersion ?? state.schema.version,
    );
    if (event.kind === "SCHEMA_ADD_COL") {
      this.addColumn(state, change.column);
    } else if (event.kind === "SCHEMA_DROP_COL") {
      this.dropColumn(state, change.column.name);
    }
  }

  private addColumn(state: TableState, column: SchemaColumn): void {
    const existing = state.schema.columns.find(col => col.name === column.name);
    if (existing) {
      existing.type = column.type;
      if (column.nullable) existing.nullable = true;
    } else {
      state.schema.columns.push(cloneSchemaColumn(column));
    }
    state.rows.forEach(row => {
      if (!(column.name in row)) {
        row[column.name] = null;
      }
    });
  }

  private dropColumn(state: TableState, columnName: string): void {
    if (columnName === "id") return;
    state.schema.columns = state.schema.columns.filter(column => column.name !== columnName);
    state.rows.forEach(row => {
      if (columnName in row) {
        delete row[columnName];
      }
    });
  }

  private syncSchemaColumns(state: TableState, row: Row): void {
    const columns = state.schema.columns;
    Object.entries(row).forEach(([key, value]) => {
      if (key === "id" || key.startsWith("__")) return;
      let column = columns.find(col => col.name === key);
      if (!column) {
        column = {
          name: key,
          type: inferColumnType(key, value),
        };
        columns.push(column);
      }
      if (value == null) {
        column.nullable = true;
      }
    });
  }
}

export const replayEventsToTables = (
  events: readonly Event[] | undefined,
  options: ReplayEventsOptions = {},
): Table[] => {
  const { initialTables = [], pruneEmptyTables = false } = options;
  const storage = new InMemoryTableStorage(initialTables);
  if (Array.isArray(events) && events.length > 0) {
    storage.applyEvents(events as Event[]);
  }
  const snapshot = storage.snapshot();
  if (!pruneEmptyTables) {
    return snapshot;
  }
  return snapshot.filter(table => table.rows.length > 0);
};
