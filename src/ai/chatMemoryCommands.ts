/** Only a complete, explicit command authorizes clearing local memories.
 * Quoted text, questions, negation and requests to forget a particular fact
 * stay on the normal conversation path.
 */
export const isForgetAllMemoriesRequest = (text: string): boolean =>
  /^(?:please\s+)?(?:forget (?:everything(?: (?:you (?:know|remember) about me|about me))?|all (?:of )?(?:my |your )?(?:saved )?memories(?: about me)?)|(?:clear|delete|remove) all (?:of )?(?:my |your )?(?:saved )?memories(?: about me)?)(?:\s+please)?[.!]*$/i.test(
    text.trim().replace(/\s+/g, ' '),
  );
