import {db} from './database';
import type {DatabaseTransaction} from './database';
import type {RevisionEntityType} from './assistantOperationSchema';

/** The applied result of one reviewed assistant command (local only). */
export interface OperationReceipt {
  operationId: string;
  userId: string;
  intent: string;
  operation: string;
  entityType: string | null;
  entityId: string | null;
  reminderId: string | null;
  reply: string;
  appliedAt: string;
}

const toReceipt = (row: Record<string, unknown>): OperationReceipt => ({
  operationId: String(row.operation_id),
  userId: String(row.user_id),
  intent: String(row.intent),
  operation: String(row.operation),
  entityType: row.entity_type == null ? null : String(row.entity_type),
  entityId: row.entity_id == null ? null : String(row.entity_id),
  reminderId: row.reminder_id == null ? null : String(row.reminder_id),
  reply: String(row.reply),
  appliedAt: String(row.applied_at),
});

export const assistantOperationStore = {
  /** Current local revision of one row; 0 when it was never written since schema 20. */
  revisionOf: (
    type: RevisionEntityType,
    id: string,
    executor: DatabaseTransaction = db,
  ): number => {
    const value = executor.executeSync(
      'SELECT revision FROM entity_local_revisions WHERE entity_type = ? AND entity_id = ?',
      [type, id],
    ).rows?.[0]?.revision;
    return value == null ? 0 : Number(value);
  },

  getReceipt: (
    operationId: string,
    executor: DatabaseTransaction = db,
  ): OperationReceipt | null => {
    const row = executor.executeSync(
      'SELECT * FROM assistant_operation_receipts WHERE operation_id = ?',
      [operationId],
    ).rows?.[0];
    return row ? toReceipt(row) : null;
  },

  /** Must run inside the transaction that applies the operation. */
  insertReceipt: (
    receipt: Omit<OperationReceipt, 'appliedAt'>,
    tx: DatabaseTransaction,
  ): OperationReceipt => {
    const appliedAt = new Date().toISOString();
    tx.executeSync(
      `INSERT INTO assistant_operation_receipts
         (operation_id, user_id, intent, operation, entity_type, entity_id, reminder_id, reply, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receipt.operationId,
        receipt.userId,
        receipt.intent,
        receipt.operation,
        receipt.entityType,
        receipt.entityId,
        receipt.reminderId,
        receipt.reply,
        appliedAt,
      ],
    );
    return {...receipt, appliedAt};
  },
};
