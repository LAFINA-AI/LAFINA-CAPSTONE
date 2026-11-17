import {academicProfileStore} from './academicProfileStore';
import type {AcademicProfileRecord} from './academicProfileStore';
import {studentSetupStore} from './studentSetupStore';
import type {CorSetupStatus, StudentAffiliation} from './studentSetupStore';

/**
 * The single product-eligibility decision for USTP school features
 * (handbook RAG, academic profile memory, school prompts and panels).
 *
 * This is NOT university identity verification: it only records that the
 * student chose the USTP experience and reviewed their own COR on this phone.
 */
export type UstpEligibilityReason =
  | 'eligible'
  | 'no_user'
  | 'setup_not_chosen'
  | 'not_ustp'
  | 'cor_pending'
  | 'cor_needs_review'
  | 'profile_missing';

export interface UstpEligibility {
  eligible: boolean;
  reason: UstpEligibilityReason;
  affiliation: StudentAffiliation;
  corStatus: CorSetupStatus;
  /** Changes whenever anything that affects eligibility changes. */
  token: string;
}

const hasReviewedProfile = (
  profile: AcademicProfileRecord | null,
  importId: string | null,
): boolean =>
  Boolean(
    profile &&
      importId &&
      profile.isUstpStudent &&
      profile.provenance?.source === 'cor_review' &&
      profile.provenance.importId === importId &&
      profile.campus.trim() &&
      profile.program.trim(),
  );

export const getUstpEligibility = (
  userId: string | null | undefined,
): UstpEligibility => {
  if (!userId) {
    return {
      eligible: false,
      reason: 'no_user',
      affiliation: 'unset',
      corStatus: 'none',
      token: 'none',
    };
  }
  const setup = studentSetupStore.get(userId);
  const base = {
    affiliation: setup.affiliation,
    corStatus: setup.corStatus,
    token: `${userId}|${setup.affiliation}|${setup.corStatus}|${
      setup.confirmedImportId ?? ''
    }`,
  };
  if (setup.affiliation === 'not_ustp') {
    return {...base, eligible: false, reason: 'not_ustp'};
  }
  if (setup.affiliation === 'unset') {
    return {...base, eligible: false, reason: 'setup_not_chosen'};
  }
  if (setup.corStatus === 'needs_review') {
    return {...base, eligible: false, reason: 'cor_needs_review'};
  }
  if (setup.corStatus !== 'confirmed' || !setup.confirmedImportId) {
    return {...base, eligible: false, reason: 'cor_pending'};
  }
  const profile = academicProfileStore.get(userId);
  if (!hasReviewedProfile(profile, setup.confirmedImportId)) {
    return {...base, eligible: false, reason: 'profile_missing'};
  }
  return {...base, eligible: true, reason: 'eligible'};
};

export const isUstpSchoolEnabled = (
  userId: string | null | undefined,
): boolean => getUstpEligibility(userId).eligible;

/** The academic profile only when it came from this student's reviewed COR. */
export const getConfirmedAcademicProfile = (
  userId: string | null | undefined,
): AcademicProfileRecord | null =>
  userId && isUstpSchoolEnabled(userId)
    ? academicProfileStore.get(userId)
    : null;

/** Plain-language reason shown wherever a USTP feature is unavailable. */
export const ustpUnavailableMessage = (
  reason: UstpEligibilityReason,
): string => {
  switch (reason) {
    case 'not_ustp':
      return 'USTP school features, including the USTP Student Handbook, are not part of scheduling mode. Your calendar, tasks and reminders still work.';
    case 'cor_needs_review':
      return 'Review your USTP COR to use USTP school features, including the USTP Student Handbook. Scheduling keeps working while that review is pending.';
    case 'setup_not_chosen':
    case 'cor_pending':
    case 'profile_missing':
      return 'USTP school features, including the USTP Student Handbook, become available after you review and confirm your USTP COR. Scheduling keeps working meanwhile.';
    default:
      return '';
  }
};

/**
 * Captures eligibility before asynchronous work. `stillAllowed()` is false if
 * the owner or any eligibility input changed, or school features are off.
 */
export const captureUstpEligibility = (userId: string | null | undefined) => {
  const before = getUstpEligibility(userId);
  return {
    eligibleAtStart: before.eligible,
    reason: before.reason,
    stillAllowed: (): boolean => {
      const now = getUstpEligibility(userId);
      return now.eligible && now.token === before.token;
    },
  };
};
