/**
 * UTF-16 surrogate-pair-safe string slicing helpers.
 *
 * Cutting an arbitrary JS string index can split an emoji or non-BMP character
 * (high surrogate 0xD800-0xDBFF + low surrogate 0xDC00-0xDFFF), producing a
 * lone surrogate that renders as U+FFFD and causes strict UTF-8 JSON decoders
 * on the backend to reject payloads.
 */

export const safeSlice = (text: string, maxLength: number): string => {
  if (!text || maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  let end = maxLength;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    end -= 1;
  }
  return text.slice(0, end);
};

export const safeSliceEnd = (text: string, maxLength: number): string => {
  if (!text || maxLength <= 0) return '';
  if (text.length <= maxLength) return text;
  let start = text.length - maxLength;
  const first = text.charCodeAt(start);
  if (first >= 0xdc00 && first <= 0xdfff) {
    start += 1;
  }
  return text.slice(start);
};
