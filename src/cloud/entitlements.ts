import { userStore } from '../storage/userStore';
import { GUEST_USER_ID } from '../constants';

export const hasProEntitlement = (userId: string): boolean => {
  if (!userId || userId === GUEST_USER_ID) return false;
  const localUser = userStore.getUserById(userId);
  return (
    localUser?.role === 'student' ||
    localUser?.role === 'student_pro' ||
    localUser?.role === 'admin'
  );
};

/**
 * Capstone removes the separate "Student Pro" badge/tier: all USTP student
 * accounts share full feature access without a Pro badge.
 */
export const isStudentProRole = (_role: string | null | undefined): boolean =>
  false;

export const isStudentProAccount = (_userId: string): boolean => false;

export const isGuestAccount = (userId: string): boolean =>
  userId === GUEST_USER_ID || userStore.isGuest(userId);
