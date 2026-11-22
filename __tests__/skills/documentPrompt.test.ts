import {buildSkillDocumentPrompt} from '../../src/skills/documentPrompt';

test('bounded document requests retain their instructions and verified citations', () => {
  const result = buildSkillDocumentPrompt({
    prompt: 'p'.repeat(500),
    format: 'docx',
    length: 'Detailed',
    context: 'source '.repeat(2000),
    citations: 'Verified Handbook p. 40',
    previous: {
      title: 'Prior document',
      summary: 's'.repeat(4000),
      prompt: 'o'.repeat(500),
    },
  });
  expect(result.prompt.length).toBeLessThanOrEqual(4000);
  expect(result.prompt).toContain('Verified Handbook p. 40');
  expect(result.prompt).toContain('Requested changes:');
  expect(result.prompt).toContain('Original request:');
  expect(result.truncated).toBe(true);
  expect(result.context.length).toBeLessThanOrEqual(2500);
});
test('slide and document length choices reach the existing document endpoint', () => {
  const slides = buildSkillDocumentPrompt({
    prompt: 'My request',
    format: 'pptx',
    length: 'Standard',
    context: '',
  });
  expect(slides.prompt).toContain('10 slides');
  expect(slides.truncated).toBe(false);
  expect(
    buildSkillDocumentPrompt({
      prompt: 'My request',
      format: 'pdf',
      length: 'Short',
      context: 'Actual source',
    }).prompt,
  ).toContain('1–2 pages');
  expect(
    buildSkillDocumentPrompt({
      prompt: 'My tracker',
      format: 'xlsx',
      length: 'Detailed',
      context: 'Rows',
    }).prompt,
  ).toContain('Multi-sheet workbook');
});
