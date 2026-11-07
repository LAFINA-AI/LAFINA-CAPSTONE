export type SqlValue = string | number | boolean | null | ArrayBuffer;

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  insertId?: number;
  rowsAffected: number;
}

export interface DatabaseTransaction {
  executeSync: (query: string, params?: unknown[]) => QueryResult;
  afterCommit?: (callback: () => void) => void;
}

interface NativeSQLiteConnection {
  executeSync: (
    query: string,
    params?: SqlValue[],
  ) => {
    rows?: Array<Record<string, unknown>>;
    insertId?: number;
    rowsAffected?: number;
  };
  close?: () => unknown;
}

export type StorageStatus =
  | 'ready'
  | 'temporary'
  | 'unavailable'
  | 'quarantined';

export type StorageFailureReason =
  | 'open_failed'
  | 'unreadable'
  | 'future_schema'
  | 'malformed_version'
  | 'integrity_failed'
  | 'migration_failed'
  | 'rollback_failed';

export interface StorageHealth {
  status: StorageStatus;
  /** True only when a successful write survives an app restart. */
  durable: boolean;
  reason: StorageFailureReason | null;
  message: string | null;
}

const NOT_RESET = 'Your existing data has not been reset.';

const FAILURE_MESSAGES: Record<StorageFailureReason, string> = {
  open_failed: `Local storage is unavailable. Nothing can be saved right now. ${NOT_RESET}`,
  unreadable: `Local storage could not be read. Nothing can be saved right now. ${NOT_RESET}`,
  future_schema:
    'This data was saved by a newer version of LAFINA. Update the app to open it. Your existing data has not been changed.',
  malformed_version: `Local storage reports a version LAFINA does not recognize. Nothing can be saved right now. ${NOT_RESET}`,
  integrity_failed: `Local storage could not be verified safely. Nothing can be saved right now. ${NOT_RESET}`,
  migration_failed: `LAFINA could not finish updating local storage. ${NOT_RESET}`,
  rollback_failed: `A save could not be undone safely, so local storage was paused. ${NOT_RESET}`,
};

/** Thrown instead of returning empty results when storage cannot be trusted. */
export class StorageUnavailableError extends Error {
  public readonly code = 'STORAGE_UNAVAILABLE';
  public readonly reason: StorageFailureReason;

  constructor(reason: StorageFailureReason, message?: string) {
    super(message ?? FAILURE_MESSAGES[reason]);
    this.name = 'StorageUnavailableError';
    this.reason = reason;
  }
}

const AUTO_ROLLBACK_PATTERN = /no transaction is active/i;

const openDefaultConnection = (): NativeSQLiteConnection => {
  // op-sqlite throws while loading when its native bindings are missing, so it
  // must load here, inside the guarded open path, rather than at module scope.
  const {open} =
    require('@op-engineering/op-sqlite') as typeof import('@op-engineering/op-sqlite');
  return open({name: 'lafina.db'}) as NativeSQLiteConnection;
};

/** Native errors may not be `instanceof Error` here, so read the message safely. */
export const storageErrorMessage = (error: unknown): string => {
  const message = (error as {message?: unknown} | null | undefined)?.message;
  return typeof message === 'string' ? message : String(error);
};

const describeQuery = (query: string): string =>
  query.replace(/\s+/g, ' ').trim().slice(0, 120);

export class DatabaseService {
  private readonly openConnection: () => NativeSQLiteConnection;
  private dbInstance: NativeSQLiteConnection | null = null;
  private isFallbackMode: boolean = false;
  private failure: StorageFailureReason | null = null;
  private activeTransaction: symbol | null = null;
  private readonly healthListeners = new Set<(h: StorageHealth) => void>();

  constructor(
    openConnection: () => NativeSQLiteConnection = openDefaultConnection,
  ) {
    this.openConnection = openConnection;
    this.initConnection();
  }

  private initConnection(): void {
    try {
      this.dbInstance = this.openConnection();
      this.failure = null;
    } catch (error) {
      this.dbInstance = null;
      this.failure = 'open_failed';
      console.error('[Database] Native SQLite connection failed:', error);
    }
  }

  private assertUsable(): void {
    if (this.failure) throw new StorageUnavailableError(this.failure);
    if (!this.dbInstance) throw new StorageUnavailableError('open_failed');
  }

  private publishHealth(): void {
    const health = this.getHealth();
    this.healthListeners.forEach(listener => {
      try {
        listener(health);
      } catch (error) {
        console.error('[Database] Health listener failed:', error);
      }
    });
  }

  public executeSync(query: string, params: unknown[] = []): QueryResult {
    if (this.isFallbackMode) {
      return {rows: [], rowsAffected: 0};
    }
    this.assertUsable();

    try {
      const sanitizedParams: SqlValue[] = params.map(param =>
        param === undefined ? null : (param as SqlValue),
      );
      const res = this.dbInstance!.executeSync(query, sanitizedParams);
      return {
        rows: res?.rows ?? [],
        insertId: res?.insertId,
        rowsAffected: res?.rowsAffected ?? 0,
      };
    } catch (error) {
      // Bound values can hold note text or credentials, so they are never logged.
      console.error(
        `[Database] SQL Error executing query: ${describeQuery(query)}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Runs synchronous work atomically. The handle expires when the callback ends,
   * and `afterCommit` work runs only after a durable COMMIT. An after-commit
   * failure (a native alarm registration, say) is logged rather than thrown,
   * because the data is already saved and must not look rolled back.
   */
  public transactionSync<T>(fn: (tx: DatabaseTransaction) => T): T {
    if (Object.prototype.toString.call(fn) === '[object AsyncFunction]') {
      throw new Error(
        'SQLite transactionSync requires a synchronous callback.',
      );
    }

    if (this.isFallbackMode) {
      const callbacks: Array<() => void> = [];
      const result = fn({
        executeSync: (query: string, params: unknown[] = []) =>
          this.executeSync(query, params),
        afterCommit: (callback: () => void) => {
          callbacks.push(callback);
        },
      });
      for (const callback of callbacks) callback();
      return result;
    }

    this.assertUsable();
    if (this.activeTransaction) {
      throw new Error('Nested SQLite transactions are not supported.');
    }

    const owner = Symbol('transaction');
    const callbacks: Array<() => void> = [];
    const assertOwned = (): void => {
      if (this.activeTransaction !== owner) {
        throw new Error('This transaction is no longer active.');
      }
    };
    const tx: DatabaseTransaction = {
      executeSync: (query: string, params: unknown[] = []) => {
        assertOwned();
        return this.executeSync(query, params);
      },
      afterCommit: (callback: () => void) => {
        assertOwned();
        callbacks.push(callback);
      },
    };

    this.executeSync('BEGIN IMMEDIATE TRANSACTION');
    this.activeTransaction = owner;
    let result: T;
    try {
      result = fn(tx);
      if (
        result !== null &&
        (typeof result === 'object' || typeof result === 'function') &&
        typeof (result as {then?: unknown}).then === 'function'
      ) {
        void Promise.resolve(result).catch(() => undefined);
        throw new Error(
          'SQLite transactionSync requires a synchronous callback.',
        );
      }
      this.executeSync('COMMIT');
    } catch (error) {
      this.activeTransaction = null;
      this.rollback();
      throw error;
    }
    this.activeTransaction = null;

    for (const callback of callbacks) {
      try {
        callback();
      } catch (callbackError) {
        console.error('[Database] Post-commit callback failed:', callbackError);
      }
    }
    return result;
  }

  private rollback(): void {
    try {
      this.executeSync('ROLLBACK');
    } catch (rollbackError) {
      // SQLite already rolled back after some errors (disk full, I/O). That leaves
      // a clean connection; only a truly open transaction makes it unsafe.
      if (AUTO_ROLLBACK_PATTERN.test(storageErrorMessage(rollbackError))) {
        return;
      }
      console.error('[Database] SQL Rollback failed:', rollbackError);
      this.requireRecovery('rollback_failed');
    }
  }

  /** True only for the explicit test-only volatile adapter. */
  public isFallback(): boolean {
    return this.isFallbackMode;
  }

  public getHealth(): StorageHealth {
    if (this.isFallbackMode) {
      return {
        status: 'temporary',
        durable: false,
        reason: null,
        message: null,
      };
    }
    if (this.failure) {
      return {
        status:
          this.failure === 'rollback_failed' ? 'quarantined' : 'unavailable',
        durable: false,
        reason: this.failure,
        message: FAILURE_MESSAGES[this.failure],
      };
    }
    return {status: 'ready', durable: true, reason: null, message: null};
  }

  /** Blocks all further use of this connection until `reopen` succeeds. */
  public requireRecovery(reason: StorageFailureReason): void {
    this.failure = reason;
    this.publishHealth();
  }

  /**
   * Closes the current connection and opens a new one. Closing discards any
   * transaction SQLite still holds open, so no partial work survives.
   */
  public reopen(): StorageHealth {
    if (this.activeTransaction) {
      throw new Error('Local storage cannot reopen during a transaction.');
    }
    if (!this.isFallbackMode) {
      try {
        this.dbInstance?.close?.();
      } catch (error) {
        console.warn(
          '[Database] Closing the previous connection failed:',
          error,
        );
      }
      this.dbInstance = null;
      this.initConnection();
      this.publishHealth();
    }
    return this.getHealth();
  }

  public subscribeHealth(
    listener: (health: StorageHealth) => void,
  ): () => void {
    this.healthListeners.add(listener);
    return () => {
      this.healthListeners.delete(listener);
    };
  }

  public setFallbackForTesting(fallback: boolean): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('The volatile storage adapter is test-only.');
    }
    this.isFallbackMode = fallback;
    if (!fallback && !this.dbInstance) {
      this.initConnection();
    }
  }
}

export const db = new DatabaseService();
