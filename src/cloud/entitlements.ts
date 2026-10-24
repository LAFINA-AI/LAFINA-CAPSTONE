import { userStore } from '../storage/userStore';
import { GUEST_USER_ID } from '../constants';

export const hasProEntitlement = (userId: string): boolean => {
  if (!userId || userId === GUEST_USER_ID) return false;
  const localUser = userStore.getUserById(userId);
  return localUser?.role === 'student_pro' || localUser?.role === 'admin';
};

export const isStudentProRole = (role: string | null | undefined): boolean =>
  role === 'student_pro';

export const isStudentProAccount = (userId: string): boolean => {
  if (!userId || userId === GUEST_USER_ID) return false;
  const localUser = userStore.getUserById(userId);
  return localUser?.role === 'student_pro';
};

export const isGuestAccount = (userId: string): boolean =>
  userId === GUEST_USER_ID || userStore.isGuest(userId);
