/**
 * Chooses the most trustworthy COR reading.
 *
 * 1. A PDF's own text layer, read by layout: exact characters, so it wins
 *    whenever the portal template is recognized.
 * 2. Otherwise OCR. Both the layout reading (word boxes) and the older text
 *    reading are scored by the automatic checks; the one with fewer problems
 *    is used (layout on a tie).
 *
 * Pure: native extraction happens in `visionService`, so this is testable.
 */
import {checkCorExtraction, checkScore} from './corChecks';
import {
  corWordsToText,
  parseCorLayout,
  type CorPageWords,
} from './corLayoutParser';
import {parseUstpCor, type ParsedUstpCorResult} from './ustpCorParser';

export interface CorReading {
  parsed: ParsedUstpCorResult;
  /** Text shown beside the review ("what LAFINA read"). */
  text: string;
}

const withChecks = (parsed: ParsedUstpCorResult): ParsedUstpCorResult => ({
  ...parsed,
  checks: checkCorExtraction(parsed),
});

const usable = (parsed: ParsedUstpCorResult) =>
  parsed.isValidUstpCor && parsed.courses.length > 0;

export const chooseCorReading = (input: {
  pdfWords?: CorPageWords | null;
  ocrWords?: CorPageWords | null;
  ocrText?: string | null;
  referenceDate?: Date;
}): CorReading | null => {
  const refDate = input.referenceDate ?? new Date();

  if (input.pdfWords && input.pdfWords.words.length > 0) {
    const outcome = parseCorLayout(input.pdfWords, refDate);
    if (outcome.ok && usable(outcome.result)) {
      return {
        parsed: withChecks(outcome.result),
        text: corWordsToText(input.pdfWords),
      };
    }
  }

  const candidates: CorReading[] = [];
  if (input.ocrWords && input.ocrWords.words.length > 0) {
    const outcome = parseCorLayout(input.ocrWords, refDate);
    if (outcome.ok && usable(outcome.result)) {
      candidates.push({
        parsed: withChecks(outcome.result),
        text: input.ocrText || corWordsToText(input.ocrWords),
      });
    }
  }
  if (input.ocrText && input.ocrText.trim()) {
    const parsed = parseUstpCor(input.ocrText, refDate);
    if (parsed.isValidUstpCor) {
      candidates.push({parsed: withChecks(parsed), text: input.ocrText});
    }
  }
  if (candidates.length === 0) return null;
  // Stable sort keeps the layout reading first on a tie.
  return [...candidates].sort(
    (a, b) => checkScore(a.parsed.checks!) - checkScore(b.parsed.checks!),
  )[0];
};
