/** Honest capability gates; the existing recorder transcribes finalized chunks only. */
export const SKILLS_CAPABILITIES = {
  liveMeetingTranscript: false,
  embeddedOfficePreview: false,
  docxSourceExtraction: true,
} as const;
