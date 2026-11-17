import {db} from './database';
import type {DatabaseTransaction} from './database';
import {studentSetupStore} from './studentSetupStore';
import type {StudentSetupState} from './studentSetupStore';
import {
  refreshAcademicMemories,
  removeAcademicMemories,
  removeOnboardingMemoryKeys,
} from './onboardingMemory';

/**
 * Switching between USTP and scheduling-only mode (onboarding and Profile).
 *
 * - Choosing USTP never turns school features on by itself: a COR that was
 *   already reviewed and confirmed is reused, otherwise the COR is pending.
 * - Choosing "not a USTP student" turns school features off at once: the
 *   handbook goal is cleared and academic facts are removed from memory.
 *   A confirmed COR import stays on this phone (the classes are the
 *   student's own schedule) but is ignored until USTP is chosen again.
 */
export const chooseUstpMode = (userId: string): StudentSetupState => {
  let next = studentSetupStore.get(userId);
  db.transactionSync(tx => {
    const current = studentSetupStore.get(userId, tx);
    const corStatus =
      current.corStatus === 'confirmed' && current.confirmedImportId
        ? 'confirmed'
        : current.corStatus === 'needs_review'
        ? 'needs_review'
        : 'pending';
    next = studentSetupStore.update(
      userId,
      {affiliation: 'ustp', corStatus},
      tx as DatabaseTransaction,
    );
    refreshAcademicMemories(userId, tx as DatabaseTransaction);
  });
  return next;
};

export const chooseNotUstpMode = (userId: string): StudentSetupState => {
  let next = studentSetupStore.get(userId);
  db.transactionSync(tx => {
    const current = studentSetupStore.get(userId, tx);
    const handbookGoal = current.goal === 'handbook';
    next = studentSetupStore.update(
      userId,
      {
        affiliation: 'not_ustp',
        goal: handbookGoal ? null : current.goal,
        explicit: handbookGoal
          ? current.explicit.filter(key => key !== 'goal')
          : current.explicit,
      },
      tx as DatabaseTransaction,
    );
    removeAcademicMemories(userId, tx as DatabaseTransaction);
    if (handbookGoal) {
      removeOnboardingMemoryKeys(
        userId,
        key => key === 'goal',
        tx as DatabaseTransaction,
      );
    }
  });
  return next;
};
