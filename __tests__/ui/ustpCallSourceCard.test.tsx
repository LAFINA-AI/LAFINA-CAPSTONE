import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {StyleSheet} from 'react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {CallReadResults} from '../../src/ui/components/callLafina/CallReadResults';
import type {
  VoiceUstpSearchResult,
  VoiceUstpPassage,
} from '../../src/handbook/voiceUstpSearch';
import {initDatabase, userStore} from '../../src/storage';

const passage = (id: string): VoiceUstpPassage => ({
  passageId: id,
  collection: 'handbook',
  sourceTitle: '2023 Student Handbook',
  chapter: 'Academic policies',
  section: 'Art. 4. Dropped Due to Absence',
  pageLabel: 'p. 33',
  asOf: null,
  scope: null,
  caveats: [],
  staleNote: null,
  excerpt:
    'Read the attendance policy and check the full passage for conditions.',
});
const result = (
  patch: Partial<VoiceUstpSearchResult> = {},
): VoiceUstpSearchResult => ({
  ustpSearch: true,
  status: 'ok',
  query: 'What are the attendance rules at USTP?',
  passages: [passage('a')],
  sources: [],
  spokenReply: 'Check the attendance rules.',
  dataIsUntrusted: true,
  ...patch,
});
beforeAll(async () => {
  await initDatabase();
  userStore.createGuestUser();
});
const show = (
  data: VoiceUstpSearchResult,
  onSeePassages = jest.fn(),
  onDismiss = jest.fn(),
) =>
  render(
    <ThemeProvider userId="local_guest_user">
      <CallReadResults
        result={data}
        ownerId="local_guest_user"
        onSeePassages={onSeePassages}
        onDismiss={onDismiss}
      />
    </ThemeProvider>,
  );

test('a compact preview opens all unique valid passages in relevance order and dismisses', () => {
  const onOpen = jest.fn();
  const onDismiss = jest.fn();
  const view = show(
    result({
      passages: [
        passage('a'),
        passage('a'),
        passage(''),
        passage('b'),
        passage('c'),
        passage('d'),
      ],
    }),
    onOpen,
    onDismiss,
  );
  expect(view.getByText('See passages (4)')).toBeTruthy();
  expect(view.getAllByText('Art. 4. Dropped Due to Absence')).toHaveLength(1);
  expect(view.getByText(/Read the attendance policy/)).toBeTruthy();
  fireEvent.press(view.getByTestId('call-ustp-see-passages'));
  expect(onOpen).toHaveBeenCalledWith(['a', 'b', 'c', 'd']);
  fireEvent.press(view.getByLabelText('Dismiss USTP sources'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  // The vertical preview must size to content, unlike the old flex: 1 rows.
  const card = StyleSheet.flatten(
    view.getByTestId('call-ustp-results').props.style,
  );
  expect(card.flex).toBeUndefined();
  expect(card.height).toBeUndefined();
});

test.each([
  'no_evidence',
  'wrong_academic_year',
  'disabled',
  'ineligible',
  'unavailable',
] as const)(
  '%s explains the reason and never offers stale passages',
  status => {
    const view = show(result({status, message: `Reason: ${status}`}));
    expect(view.getByText(`Reason: ${status}`)).toBeTruthy();
    expect(view.queryByTestId('call-ustp-see-passages')).toBeNull();
    expect(view.queryByText('Art. 4. Dropped Due to Absence')).toBeNull();
  },
);

test('empty successful results do not leave a blank card or dead action', () => {
  const view = show(result({passages: [], spokenReply: ''}));
  expect(view.getByText('No passages available')).toBeTruthy();
  expect(view.getByText(/Try a more specific USTP question/)).toBeTruthy();
  expect(view.queryByTestId('call-ustp-see-passages')).toBeNull();
});

test('long titles and excerpts are previews; source dates and every match warning remain readable', () => {
  const first = {
    ...passage('a'),
    section: 'Long source title '.repeat(40),
    asOf: 'November 24, 2026',
    excerpt: 'Long passage '.repeat(200),
  };
  const second = {
    ...passage('b'),
    caveats: ['Conflicting calendar dates.'],
    staleNote: 'This snapshot may be outdated.',
  };
  const view = show(result({passages: [first, second]}));
  expect(view.getByText(first.section).props.numberOfLines).toBe(2);
  expect(view.getByText(first.excerpt.trim()).props.numberOfLines).toBe(3);
  expect(view.getByText(/As of November 24, 2026/)).toBeTruthy();
  const warning = view.getByTestId('call-ustp-warning');
  expect(warning.props.numberOfLines).toBeUndefined();
  expect(view.getByText(/Conflicting calendar dates/)).toBeTruthy();
  expect(view.getByText(/snapshot may be outdated/)).toBeTruthy();
});
