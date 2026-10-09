export type CDCMode = 'LOG_BASED' | 'QUERY_BASED' | 'TRIGGER_BASED';

export type ColumnType = 'string' | 'number' | 'bool' | 'timestamp';

export type SchemaColumn = {
  name: string;
  type: ColumnType;
  nullable?: boolean;
};

export type Schema = {
  name: string;
  columns: SchemaColumn[];
  version: number;
};

export type Row = {
  id: string;
  [key: string]: unknown;
  __ts?: number;
};

export type ChangeKind =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'SCHEMA_ADD_COL'
  | 'SCHEMA_DROP_COL';

export type SchemaChangeAction = 'ADD_COLUMN' | 'DROP_COLUMN';

export type SchemaChange = {
  action: SchemaChangeAction;
  column: SchemaColumn;
  previousVersion: number;
  nextVersion: number;
};

export type Event = {
  id: string;
  kind: ChangeKind;
  table: string;
  before?: Row;
  after?: Row;
  txnId?: string;
  txnIndex?: number;
  txnTotal?: number;
  txnLast?: boolean;
  commitTs: number;
  schemaVersion: number;
  topic: string;
  partition: number;
  offset?: number;
  /**
   * Position of the original log record this event copies. Set only on a
   * redelivery, where `offset` is a fresh bus offset (the position the copy
   * was published at) and `sourcePosition` is the offset the first delivery
   * got. A sink that orders by source log position compares this value, not
   * the bus offset.
   */
  sourcePosition?: number;
  /** True when this event is a repeat delivery of an earlier log record. */
  redelivered?: boolean;
  schemaChange?: SchemaChange;
};

export type TransactionMeta = {
  id: string;
  index: number;
  total?: number;
  last?: boolean;
};

export type Transaction = {
  id: string;
  changes: Omit<Event, 'id' | 'topic' | 'partition' | 'offset'>[];
  commitTs: number;
};

export type MetricsSnapshot = {
  produced: number;
  consumed: number;
  backlog: number;
  lagMsP50: number;
  lagMsP95: number;
  missedDeletes: number;
  writeAmplification: number;
  snapshotRows: number;
  errors: number;
};

export type Table = {
  name: string;
  schema: Schema;
  rows: Row[];
};

export type SourceOp =
  | {
      t: number;
      op: 'insert';
      table: string;
      pk: { id: string };
      after: Record<string, unknown>;
      txn?: TransactionMeta;
      ts_ms?: number;
    }
  | {
      t: number;
      op: 'update';
      table: string;
      pk: { id: string };
      after: Record<string, unknown>;
      txn?: TransactionMeta;
      /**
       * The ts_ms stamped on the change event when the committing node's clock
       * differs from `t` (clock skew). `t` still decides when the write happens.
       * Only the log lane honours it.
       */
      ts_ms?: number;
    }
  | {
      t: number;
      op: 'delete';
      table: string;
      pk: { id: string };
      txn?: TransactionMeta;
      ts_ms?: number;
    }
  | {
      /**
       * Delivery-layer operation, not a source write: the log lane delivers
       * the record produced by `ops[ref]` a second time, with its original
       * position. `ref` is a 0-based index into the scenario's `ops`; `table`
       * and `pk` repeat that record's key. Polling and trigger lanes ignore it.
       */
      t: number;
      op: 'redeliver';
      ref: number;
      table: string;
      pk: { id: string };
      txn?: TransactionMeta;
    };
