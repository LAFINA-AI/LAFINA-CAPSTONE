import React from 'react';
import {Linking} from 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import {SourceNoteText} from '../../src/ui/components/chat/SourceNoteText';

const CAL =
  'https://drive.google.com/file/d/1ijghm2zH9S203nn58Qxe8Ln8wchVWw3h/view?usp=sharing';

describe('SourceNoteText', () => {
  afterEach(() => jest.restoreAllMocks());

  test('a Student Handbook note reads exactly as before, with no links', () => {
    const screen = render(
      <SourceNoteText
        note="Referenced USTP Student Handbook (p. 42)"
        style={{}}
        linkColor="#00f"
        testID="note"
      />,
    );
    expect(screen.getByTestId('note')).toHaveTextContent(
      'Referenced USTP Student Handbook (p. 42)',
    );
    expect(screen.queryAllByTestId('chat-source-link')).toHaveLength(0);
  });

  test('each official page in a campus note is a tappable link', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(
      <SourceNoteText
        note={`Referenced USTP Student Handbook (p. 19)\nUSTP CDO sources (as of November 24, 2026): [Academic Calendar, PDF p. 4](${CAL}) · [USTP CDO Library](https://www.ustp.edu.ph/cdeo/library/)`}
        style={{}}
        linkColor="#00f"
        testID="note"
      />,
    );
    const links = screen.getAllByTestId('chat-source-link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Academic Calendar, PDF p. 4');
    expect(screen.getByTestId('note')).toHaveTextContent(
      /Referenced USTP Student Handbook \(p\. 19\)\s+USTP CDO sources/,
    );
    fireEvent.press(links[1]);
    expect(open).toHaveBeenCalledWith('https://www.ustp.edu.ph/cdeo/library/');
  });

  test('a link that is not https is never opened', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(
      <SourceNoteText
        note="[Old page](http://example.com/page)"
        style={{}}
        linkColor="#00f"
      />,
    );
    for (const link of screen.queryAllByTestId('chat-source-link')) {
      fireEvent.press(link);
    }
    expect(open).not.toHaveBeenCalled();
  });
});
