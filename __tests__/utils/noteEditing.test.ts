import {
  applyNoteFormat,
  continueListOnNewline,
  getActiveLineFormat,
} from '../../src/utils/noteEditing';

describe('noteEditing logic', () => {
  test('bullet formatting and newline continuation', () => {
    // 1. Initial state: empty body, cursor at 0
    let body = '';
    let selection = {start: 0, end: 0};

    // 2. Click bullet button
    const formatRes = applyNoteFormat(body, selection, 'bullet');
    body = formatRes.body;
    selection = formatRes.selection;
    expect(body).toBe('- ');
    expect(selection).toEqual({start: 2, end: 2});

    // 3. User types "First item"
    body = '- First item';
    selection = {start: 12, end: 12};

    // 4. User presses Enter: next text has newline appended
    const carried = continueListOnNewline(body, body + '\n');
    expect(carried).not.toBeNull();
    expect(carried?.body).toBe('- First item\n- ');
    expect(carried?.selection).toEqual({start: 15, end: 15});
  });

  test('continueListOnNewline with empty bullet removes it', () => {
    const body = '- ';
    const carried = continueListOnNewline(body, body + '\n');
    expect(carried).not.toBeNull();
    expect(carried?.body).toBe('');
    expect(carried?.selection).toEqual({start: 0, end: 0});
  });

  test('applyNoteFormat on existing line without marker', () => {
    const body = 'My heading';
    const selection = {start: 5, end: 5};
    const res = applyNoteFormat(body, selection, 'bullet');
    expect(res.body).toBe('- My heading');
    expect(res.selection).toEqual({start: 7, end: 7});
  });

  test('applyNoteFormat on multi-line text with cursor on second line', () => {
    const body = 'Line 1\nLine 2';
    // cursor at start of Line 2 (index 7)
    const selection = {start: 7, end: 7};
    const res = applyNoteFormat(body, selection, 'bullet');
    expect(res.body).toBe('Line 1\n- Line 2');
    expect(res.selection).toEqual({start: 9, end: 9});
  });

  test('selection.start === 0 boundary fix does not duplicate newline at top of file', () => {
    const body = '\nhello';
    const selection = {start: 0, end: 0};
    const res = applyNoteFormat(body, selection, 'bullet');
    expect(res.body).toBe('- \nhello');
    expect(res.selection).toEqual({start: 2, end: 2});
  });

  test('getActiveLineFormat detects bullet and checklist lines', () => {
    const body = '- Bullet line\n- [ ] Checklist line\n# Header\nPlain line';
    expect(getActiveLineFormat(body, {start: 2, end: 2}).isBullet).toBe(true);
    expect(getActiveLineFormat(body, {start: 20, end: 20}).isChecklist).toBe(true);
    expect(getActiveLineFormat(body, {start: 38, end: 38}).isH1).toBe(true);
    expect(getActiveLineFormat(body, {start: 46, end: 46}).isBullet).toBe(false);
  });
});
