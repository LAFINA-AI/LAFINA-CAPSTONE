export { cloudClient } from './cloudClient';
export type { CloudResult, CloudResultStatus } from './cloudClient';
export { authService, resolveEffectiveProfileRole } from './authService';
export { accountLinkService } from './accountLinkService';
export { createCallSpeechProvider } from './speechService';
export {
  hasProEntitlement,
  isGuestAccount,
  isStudentProAccount,
  isStudentProRole,
} from './entitlements';
