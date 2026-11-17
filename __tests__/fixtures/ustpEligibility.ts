import {academicProfileStore} from '../../src/storage/academicProfileStore';
import type {AcademicProfileRecord} from '../../src/storage/academicProfileStore';
import {studentSetupStore} from '../../src/storage/studentSetupStore';

/**
 * Puts a test user in the state a reviewed COR import leaves behind (USTP
 * selected, COR confirmed, academic profile with review provenance), so
 * tests of USTP-only features exercise them deliberately. Tests that omit
 * this see the real default: school features off.
 */
export const enableUstpForTest = (
  userId: string,
  profile: Partial<Omit<AcademicProfileRecord, 'updatedAt'>> = {},
): void => {
  const importId = `test-import-${userId}`;
  const reviewedAt = '2026-06-01T00:00:00.000Z';
  academicProfileStore.save(
    userId,
    {
      isUstpStudent: true,
      campus: 'Cagayan de Oro',
      registrationNo: '',
      studentNo: '',
      fullName: '',
      formattedName: '',
      preferredName: '',
      gender: '',
      age: null,
      nationality: '',
      college: '',
      collegeShort: '',
      program: 'Bachelor of Science in Information Technology',
      major: '',
      yearLevel: '3rd Year',
      yearLevelShort: '',
      curriculum: '',
      academicTerm: '',
      academicYearTerm: '',
      section: '',
      primarySection: '',
      totalUnits: '',
      totalLecUnits: null,
      totalLabUnits: null,
      totalCreditUnits: null,
      courses: [],
      ...profile,
    },
    undefined,
    {
      updateUsername: false,
      provenance: {source: 'cor_review', importId, reviewedAt},
    },
  );
  studentSetupStore.update(userId, {
    affiliation: 'ustp',
    corStatus: 'confirmed',
    confirmedImportId: importId,
    confirmedAt: reviewedAt,
  });
};
