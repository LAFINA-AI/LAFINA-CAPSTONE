/** Short acknowledgements only approve a draft after an actual save question. */
export const hasDraftApproval = (
  text: string,
  assistantText: string,
): boolean => {
  const t = text.trim();
  const answer =
    /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|confirm(?:\s+(?:it|that))?|save(?:\s+(?:it|that))?|lock(?:\s+it)?\s+in|go\s+ahead|do\s+it|sounds\s+good|please\s+(?:save(?:\s+(?:it|that))?|confirm(?:\s+(?:it|that))?)|yes\s*,?\s*(?:please|save(?:\s+(?:it|that))?|confirm(?:\s+(?:it|that))?|lock(?:\s+it)?\s+in))(?:\s+(?:please|lafina))?[.!]?$/i.test(
      t,
    );
  if (!answer) return false;
  if (/\b(?:confirm|save|lock|go\s+ahead|do\s+it)\b/i.test(t)) return true;
  if (
    /\b(?:cannot|can't|couldn't|do not|don't|no longer)\b/i.test(assistantText)
  )
    return false;
  return (
    /\b(?:would|do)\s+you\s+like\s+me\s+to\s+(?:save|add|schedule)/i.test(
      assistantText,
    ) ||
    /\b(?:shall|should|can|may)\s+i\s+(?:save|add|schedule)|\b(?:confirm|save)\b[^.!?]*(?:card|draft|it|that)|\b(?:card|draft)\b[^.!?]*(?:confirm|save)/i.test(
      assistantText,
    )
  );
};

/** Multiple requested artifacts must not be flattened into a single action. */
export const isCompoundVoiceRequest = (text: string): boolean =>
  /\b(?:and|also|then|plus|tapos|at\s+saka)\s+(?:(?:please|also|then)\s+)*(?:(?:add|create|schedule|set|make|remind|save|jot)\b|(?:a|an|another)\s+(?:task|event|meeting|reminder|note|time\s*block)\b)/i.test(
    text,
  );
