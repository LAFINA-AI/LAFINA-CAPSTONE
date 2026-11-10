/**
 * Chat reply formatting: markdown replies are drawn as headings, lists,
 * tables and code, or as plain text when the student turns markdown off in
 * Profile. Jest only; the emulator check is recorded in the Phase 09 report.
 */
import React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {db, initDatabase, userStore} from '../../src/storage';
import {
  CHAT_REPLY_FORMAT_KEY,
  chatReplyFormatStore,
} from '../../src/storage/chatReplyFormatStore';
import {
  chatMarkdownToPlainText,
  hasWideMarkdownBlock,
  hideDanglingMarkers,
  parseChatInline,
  parseChatMarkdown,
} from '../../src/utils';
import {ChatMessageItem} from '../../src/ui/components/chat/ChatMessageItem';
import {
  fitColumnWidths,
  tableColumnSizes,
} from '../../src/ui/components/chat/ChatReplyText';
import {ProfileScreen} from '../../src/ui/screens/ProfileScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import type {ChatMessage} from '../../src/storage/chatStore';

let serial = 0;
const owner = (): string => {
  serial += 1;
  const id = `reply-format-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const reply = (content: string, sender: ChatMessage['sender'] = 'assistant'): ChatMessage => ({
  id: `m-${content.length}-${sender}`,
  sessionId: 's',
  sender,
  content,
  createdAt: '2026-11-08T05:00:00.000Z',
  updatedAt: '2026-11-08T05:00:00.000Z',
});

/** The reply DeepSeek sent for "explain photosynthesis in detail with six steps" (shortened). */
const PHOTOSYNTHESIS = [
  "Here's a detailed breakdown in six steps:",
  '',
  '**Step 1: Light Absorption**',
  'Chlorophyll absorbs photons of light, primarily in the *blue* and *red* wavelengths.',
  '',
  '**Step 2: Water Splitting (Photolysis)**',
  'Water is split, releasing electrons, protons (H⁺), and oxygen.',
].join('\n');

beforeAll(async () => {
  await initDatabase();
});

afterEach(() => {
  db.executeSync('DELETE FROM active_session');
});

describe('parseChatInline', () => {
  it('reads bold, italic, bold italic, strikethrough and code', () => {
    expect(parseChatInline('a **b** *c* ***d*** ~~e~~ `f **g**`')).toEqual([
      {text: 'a '},
      {text: 'b', bold: true},
      {text: ' '},
      {text: 'c', italic: true},
      {text: ' '},
      {text: 'd', bold: true, italic: true},
      {text: ' '},
      {text: 'e', strike: true},
      {text: ' '},
      {text: 'f **g**', code: true},
    ]);
  });

  it('leaves arithmetic and snake_case alone', () => {
    expect(parseChatInline('2 * 3 * 4 = 24')).toEqual([{text: '2 * 3 * 4 = 24'}]);
    expect(parseChatInline('use my_var_name here')).toEqual([{text: 'use my_var_name here'}]);
    expect(parseChatInline('an _emphasised_ word')).toEqual([
      {text: 'an '},
      {text: 'emphasised', italic: true},
      {text: ' word'},
    ]);
  });

  it('keeps web links and drops other targets', () => {
    expect(parseChatInline('see [USTP](https://www.ustp.edu.ph) now')).toEqual([
      {text: 'see '},
      {text: 'USTP', href: 'https://www.ustp.edu.ph'},
      {text: ' now'},
    ]);
    // Not a web link: the words stay, nothing becomes tappable.
    expect(parseChatInline('[run](javascript:alert(1))')).toEqual([{text: 'run)'}]);
  });
});

describe('parseChatMarkdown', () => {
  it('reads the blocks a reply uses and keeps single line breaks', () => {
    const blocks = parseChatMarkdown(
      [
        '# Title',
        '#### Deep heading',
        'Line one',
        'Line two',
        '',
        '',
        '- first',
        '    - nested',
        '1. one',
        '2) two',
        '- [x] done',
        '> quoted',
        '---',
        '```python',
        'print("**not bold**")',
        '```',
      ].join('\n'),
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      'heading',
      'heading',
      'paragraph',
      'paragraph',
      'blank',
      'bullet',
      'bullet',
      'ordered',
      'ordered',
      'checklist',
      'quote',
      'divider',
      'code',
    ]);
    expect(blocks[1]).toMatchObject({kind: 'heading', level: 3});
    expect(blocks[6]).toMatchObject({kind: 'bullet', depth: 1});
    expect(blocks[8]).toMatchObject({kind: 'ordered', marker: '2'});
    expect(blocks[12]).toEqual({kind: 'code', language: 'python', text: 'print("**not bold**")'});
  });

  it('reads a table with its header', () => {
    const [table] = parseChatMarkdown('| Day | Class |\n|---|:---:|\n| Mon | **Math** |\n| Tue | Art |');
    expect(table).toMatchObject({kind: 'table'});
    if (table.kind !== 'table') throw new Error('not a table');
    expect(table.header).toEqual([[{text: 'Day'}], [{text: 'Class'}]]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][1]).toEqual([{text: 'Math', bold: true}]);
  });

  it('treats an unclosed code fence as code to the end while it streams', () => {
    expect(parseChatMarkdown('```\nconst a = 1;\nconst b', {streaming: true})).toEqual([
      {kind: 'code', language: '', text: 'const a = 1;\nconst b'},
    ]);
  });
});

describe('streaming', () => {
  it('hides an opening marker until its partner arrives', () => {
    expect(hideDanglingMarkers('**Step 3: Car')).toBe('Step 3: Car');
    expect(hideDanglingMarkers('**Step 3** and *wat')).toBe('**Step 3** and wat');
    expect(hideDanglingMarkers('run `npm')).toBe('run npm');
    expect(hideDanglingMarkers('see [the hand')).toBe('see the hand');
    expect(hideDanglingMarkers('see [the handbook](https://ex')).toBe('see the handbook');
    expect(hideDanglingMarkers('* list item')).toBe('* list item');
    expect(hideDanglingMarkers('**done** text')).toBe('**done** text');
  });

  it('only touches the last line, and only while streaming', () => {
    const text = '**Step 1**\n**Step 2: Wat';
    expect(chatMarkdownToPlainText(text, {streaming: true})).toBe('Step 1\nStep 2: Wat');
    expect(chatMarkdownToPlainText(text)).toBe('Step 1\n**Step 2: Wat');
  });
});

describe('chatMarkdownToPlainText', () => {
  it('removes markup but keeps structure', () => {
    expect(chatMarkdownToPlainText(PHOTOSYNTHESIS)).toBe(
      [
        "Here's a detailed breakdown in six steps:",
        '',
        'Step 1: Light Absorption',
        'Chlorophyll absorbs photons of light, primarily in the blue and red wavelengths.',
        '',
        'Step 2: Water Splitting (Photolysis)',
        'Water is split, releasing electrons, protons (H⁺), and oxygen.',
      ].join('\n'),
    );
    expect(chatMarkdownToPlainText('## Plan\n- read\n  - notes\n3. rest\n| a | b |\n|--|--|\n| 1 | 2 |')).toBe(
      'Plan\n• read\n  • notes\n3. rest\na | b\n1 | 2',
    );
  });
});

describe('table column sizes', () => {
  const MITOSIS = [
    '| Feature | Mitosis |',
    '|---|---|',
    '| Chromosome number | 2, genetically identical to the parent cell and to each other |',
    '| Divisions | One |',
  ].join('\n');
  const rowsOf = (text: string) => {
    const [table] = parseChatMarkdown(text);
    if (table.kind !== 'table') throw new Error('not a table');
    return [table.header, ...table.rows];
  };
  const cellWidth = (chars: number) => Math.round(chars * 7.4 + 16);
  const wordWidth = (chars: number, scale = 1) => Math.round(chars * 8.6 * scale + 16);

  it('sizes a column by its longest cell, and never below its longest word', () => {
    const [first, second] = tableColumnSizes(rowsOf(MITOSIS));
    expect(first).toEqual({
      preferred: cellWidth('Chromosome number'.length),
      minimum: wordWidth('Chromosome'.length),
    });
    expect(second.preferred).toBe(200);
    expect(second.minimum).toBe(wordWidth('genetically'.length));
  });

  it('widens columns for a larger system font', () => {
    const [normal] = tableColumnSizes(rowsOf(MITOSIS), 1);
    const [large] = tableColumnSizes(rowsOf(MITOSIS), 1.3);
    expect(large.minimum).toBe(wordWidth('Chromosome'.length, 1.3));
    expect(large.minimum).toBeGreaterThan(normal.minimum);
  });

  it('fits the bubble by shrinking toward each minimum, and scrolls when even that is too wide', () => {
    const sizes = [
      {preferred: 150, minimum: 100},
      {preferred: 200, minimum: 110},
      {preferred: 200, minimum: 110},
    ];
    // Fits already, or width not measured yet: preferred widths.
    expect(fitColumnWidths(sizes, 600)).toEqual([150, 200, 200]);
    expect(fitColumnWidths(sizes, 0)).toEqual([150, 200, 200]);
    // Too wide: every column gives up room, none below its minimum.
    const fitted = fitColumnWidths(sizes, 400);
    expect(fitted.reduce((sum, w) => sum + w, 0) + 4).toBeLessThanOrEqual(400);
    fitted.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(sizes[i].minimum));
    // Minimums do not fit: keep them, and the table scrolls sideways.
    expect(fitColumnWidths(sizes, 250)).toEqual([100, 110, 110]);
  });
});

describe('chatReplyFormatStore', () => {
  it('defaults to markdown, saves per account and tells open screens', () => {
    const first = owner();
    const second = owner();
    expect(chatReplyFormatStore.read(first)).toBe('markdown');

    const heard: string[] = [];
    const stop = chatReplyFormatStore.subscribe((userId, format) => heard.push(`${userId}:${format}`));
    expect(chatReplyFormatStore.save(first, 'plain')).toBe(true);
    stop();
    chatReplyFormatStore.save(first, 'markdown');
    chatReplyFormatStore.save(first, 'plain');

    expect(chatReplyFormatStore.read(first)).toBe('plain');
    expect(chatReplyFormatStore.read(second)).toBe('markdown');
    expect(heard).toEqual([`${first}:plain`]);
  });

  it('reads an unknown stored value as markdown', () => {
    const userId = owner();
    db.executeSync(
      'INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [userId, CHAT_REPLY_FORMAT_KEY, 'html', new Date().toISOString()],
    );
    expect(chatReplyFormatStore.read(userId)).toBe('markdown');
  });
});

describe('ChatMessageItem', () => {
  const themed = (node: React.ReactElement) => <ThemeProvider userId={null}>{node}</ThemeProvider>;

  it('draws a markdown reply without its symbols', () => {
    const screen = render(themed(<ChatMessageItem item={reply(PHOTOSYNTHESIS)} replyFormat="markdown" />));
    expect(screen.getByText('Step 1: Light Absorption')).toBeTruthy();
    expect(screen.getByText('blue')).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
    expect(screen.getByTestId('chat-message-content')).toHaveTextContent(/Step 2: Water Splitting/);
  });

  it('draws the same reply as plain text when markdown is off', () => {
    const screen = render(themed(<ChatMessageItem item={reply(PHOTOSYNTHESIS)} replyFormat="plain" />));
    const content = screen.getByTestId('chat-message-content');
    expect(content).toHaveTextContent(/Step 1: Light Absorption/);
    expect(content).not.toHaveTextContent(/\*/);
  });

  it('shows the student their own words exactly as typed', () => {
    const screen = render(themed(<ChatMessageItem item={reply('**not** a heading', 'user')} />));
    expect(screen.getByText('**not** a heading')).toBeTruthy();
  });

  it('keeps the streaming cursor on the last line and hides a half-written marker', () => {
    const screen = render(
      themed(<ChatMessageItem item={reply('- one\n- **tw')} replyFormat="markdown" streaming />),
    );
    expect(screen.getByTestId('chat-streaming-content')).toHaveTextContent(/one\s*•\s*tw ▍$/);
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('gives a reply with a table or code the full width, and others the usual bubble', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    expect(hasWideMarkdownBlock(table)).toBe(true);
    expect(hasWideMarkdownBlock('```\nnpm test\n```')).toBe(true);
    expect(hasWideMarkdownBlock('**Step 1**\n- a | b')).toBe(false);

    const expectBubble = (content: string, format: 'markdown' | 'plain', maxWidth: `${number}%`) => {
      const item = reply(content);
      const screen = render(themed(<ChatMessageItem item={item} replyFormat={format} />));
      expect(screen.getByTestId(`chat-bubble-${item.id}`)).toHaveStyle({maxWidth});
      screen.unmount();
    };
    expectBubble(table, 'markdown', '100%');
    expectBubble(table, 'plain', '82%');
    expectBubble('just words', 'markdown', '82%');
  });

  it('draws tables and code blocks', () => {
    const screen = render(
      themed(
        <ChatMessageItem
          item={reply('| Day | Class |\n|---|---|\n| Mon | Math |\n\n```\nnpm test\n```')}
          replyFormat="markdown"
        />,
      ),
    );
    for (const cell of ['Day', 'Class', 'Mon', 'Math', 'npm test']) {
      expect(screen.getByText(cell)).toBeTruthy();
    }
  });
});

describe('Profile setting', () => {
  it('switches replies between markdown and plain text', () => {
    const userId = owner();
    userStore.setCurrentUser(userId);
    const screen = render(
      <ThemeProvider userId={userId}>
        <ProfileScreen userId={userId} refreshTrigger={0} onRefresh={jest.fn()} onLogout={jest.fn()} />
      </ThemeProvider>,
    );
    const toggle = screen.getByLabelText('Markdown Chat Replies');
    expect(toggle.props.value).toBe(true);

    act(() => {
      fireEvent(toggle, 'valueChange', false);
    });
    expect(chatReplyFormatStore.read(userId)).toBe('plain');
    expect(screen.getByLabelText('Markdown Chat Replies').props.value).toBe(false);

    act(() => {
      fireEvent(screen.getByLabelText('Markdown Chat Replies'), 'valueChange', true);
    });
    expect(chatReplyFormatStore.read(userId)).toBe('markdown');
    screen.unmount();
  });
});
