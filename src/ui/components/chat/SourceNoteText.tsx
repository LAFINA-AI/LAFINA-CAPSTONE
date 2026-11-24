import React, {useMemo} from 'react';
import {Linking, Text, type StyleProp, type TextStyle} from 'react-native';
import {parseChatInline} from '../../../utils';

interface SourceNoteTextProps {
  /** The stored citation note: plain words, or Markdown links to official pages. */
  note: string;
  style: StyleProp<TextStyle>;
  linkColor: string;
  testID?: string;
}

const openSource = (href: string): void => {
  // Only official https pages are cited; anything else stays as words.
  if (!/^https:\/\//i.test(href)) return;
  Linking.openURL(href).catch(() => {
    /* No app can open it: the title is still on screen. */
  });
};

/**
 * The citation under a reply. A Student Handbook note ("Referenced USTP
 * Student Handbook (p. 12)") reads exactly as before; a USTP CDO note lists
 * the official pages it used, each one tappable.
 */
export function SourceNoteText({
  note,
  style,
  linkColor,
  testID,
}: SourceNoteTextProps) {
  const lines = useMemo(
    () => note.split('\n').map(line => parseChatInline(line)),
    [note],
  );
  return (
    <Text style={style} testID={testID}>
      {lines.map((spans, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 ? '\n' : null}
          {spans.map((span, index) => {
            const href = span.href;
            if (!href) return span.text;
            return (
              <Text
                key={index}
                style={{color: linkColor, textDecorationLine: 'underline'}}
                onPress={() => openSource(href)}
                accessibilityRole="link"
                accessibilityHint="Opens the official source"
                testID="chat-source-link"
              >
                {span.text}
              </Text>
            );
          })}
        </React.Fragment>
      ))}
    </Text>
  );
}
