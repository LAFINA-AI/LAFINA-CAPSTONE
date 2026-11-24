/**
 * Students never see the names of the services behind LAFINA's online
 * answers and voice. Messages that come from the server can still name them
 * ("ElevenLabs is busy."), so they pass through here before they are shown.
 */

const VENDORS: ReadonlyArray<[RegExp, string]> = [
  [/\bEleven\s?Labs\b/gi, 'the online voice'],
  [/\bDeep\s?Seek\b/gi, 'the online assistant'],
  [/\bGemini\b/g, 'the online service'],
];

/** Replaces vendor names with plain words, capitalising at a sentence start. */
export const hideVendorNames = (text: string): string => {
  let out = text;
  for (const [pattern, words] of VENDORS) {
    out = out.replace(pattern, (_match, offset: number, whole: string) => {
      const before = whole.slice(0, offset);
      const startsSentence = /(^|[.!?]\s+|\n\s*)$/.test(before);
      return startsSentence
        ? words.charAt(0).toUpperCase() + words.slice(1)
        : words;
    });
  }
  return out;
};
