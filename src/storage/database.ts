import { open } from '@op-engineering/op-sqlite';

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
  close?: () => void;
}

class DatabaseService {
  private dbInstance: NativeSQLiteConnection | null = null;
  private isFallbackMode: boolean = false;
  private inTransaction: boolean = false;

  constructor() {
    this.initConnection();
  }

  private initConnection() {
    try {
      this.dbInstance = open({ name: 'lafina.db' }) as NativeSQLiteConnection;
      this.isFallbackMode = false;
    } catch (e) {
      console.warn(
        '[Database] Native SQLite connection failed. Entering fallback mode for UI preview.',
        e,
      );
      this.isFallbackMode = true;
    }
  }

  public executeSync(query: string, params: unknown[] = []): QueryResult {
    if (this.isFallbackMode || !this.dbInstance) {
      return {
        rows: [],
        rowsAffected: 0,
      };
    }

    try {
      const sanitizedParams: SqlValue[] = params.map((param) =>
        param === undefined ? null : (param as SqlValue),
      );
      const res = this.dbInstance.executeSync(query, sanitizedParams);
      return {
        rows: res?.rows ?? [],
        insertId: res?.insertId,
        rowsAffected: res?.rowsAffected ?? 0,
      };
    } catch (error) {
      console.error(
        `[Database] SQL Error executing query: ${query}`,
        params,
        error,
      );
      throw error;
    }
  }

  public transactionSync<T>(fn: (tx: DatabaseTransaction) => T): T {
    if (this.isFallbackMode || !this.dbInstance) {
      const afterCommitCallbacks: Array<() => void> = [];
      const result = fn({
        executeSync: (query: string, params: unknown[] = []) =>
          this.executeSync(query, params),
        afterCommit: (callback: () => void) => {
          afterCommitCallbacks.push(callback);
        },
      });
      for (const callback of afterCommitCallbacks) {
        callback();
      }
      return result;
    }

    if (this.inTransaction) {
      throw new Error('Nested SQLite transactions are not supported.');
    }

    const afterCommitCallbacks: Array<() => void> = [];
    const tx: DatabaseTransaction = {
      executeSync: (query: string, params: unknown[] = []) =>
        this.executeSync(query, params),
      afterCommit: (callback: () => void) => {
        afterCommitCallbacks.push(callback);
      },
    };

    this.inTransaction = true;
    let committed = false;
    try {
      this.executeSync('BEGIN IMMEDIATE TRANSACTION');
      const result = fn(tx);
      this.executeSync('COMMIT');
      committed = true;
      for (const callback of afterCommitCallbacks) {
        try {
          callback();
        } catch (callbackError) {
          console.error(
            '[Database] Post-commit callback failed:',
            callbackError,
          );
        }
      }
      return result;
    } catch (error) {
      if (!committed) {
        try {
          this.executeSync('ROLLBACK');
        } catch (rollbackError) {
          console.error('[Database] SQL Rollback failed:', rollbackError);
        }
      }
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  public isFallback(): boolean {
    return this.isFallbackMode;
  }

  public setFallbackForTesting(fallback: boolean): void {
    this.isFallbackMode = fallback;
    if (!fallback && !this.dbInstance) {
      this.initConnection();
    }
  }
}

export const db = new DatabaseService();
