import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Fonts, FontSize, Spacing, useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../contexts/ThemeContext';
import { parseReleaseNotes, type InlineSpan, type NoteBlock } from './releaseNotesMarkdown';

interface ReleaseNotesProps {
  markdown: string | null;
  /** Shown when there are no notes. */
  emptyText?: string;
}

const openLink = (url: string): void => {
  if (/^https:\/\//.test(url)) void Linking.openURL(url).catch(() => undefined);
};

/** GitHub release notes, drawn with the app's own type and colours. */
export const ReleaseNotes: React.FC<ReleaseNotesProps> = ({ markdown, emptyText }) => {
  const themed = useThemedStyles(getThemedStyles);
  const blocks = useMemo(() => parseReleaseNotes(markdown), [markdown]);

  const renderSpans = (spans: InlineSpan[]): React.ReactNode =>
    spans.map((span, index) => {
      switch (span.kind) {
        case 'bold':
          return (
            <Text key={index} style={styles.bold}>
              {span.text}
            </Text>
          );
        case 'italic':
          return (
            <Text key={index} style={styles.italic}>
              {span.text}
            </Text>
          );
        case 'code':
          return (
            <Text key={index} style={[styles.code, themed.code]}>
              {span.text}
            </Text>
          );
        case 'link':
          return (
            <Text
              key={index}
              style={[styles.link, themed.link]}
              onPress={() => openLink(span.url)}
              accessibilityRole="link"
            >
              {span.text}
            </Text>
          );
        default:
          return <React.Fragment key={index}>{span.text}</React.Fragment>;
      }
    });

  const renderBlock = (block: NoteBlock, index: number): React.ReactNode => {
    switch (block.kind) {
      case 'heading':
        return (
          <Text
            key={index}
            accessibilityRole="header"
            style={[
              styles.heading,
              block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3,
              themed.text,
              index === 0 && styles.first,
            ]}
          >
            {renderSpans(block.spans)}
          </Text>
        );
      case 'bullet':
      case 'numbered':
        return (
          <View key={index} style={[styles.listRow, { paddingLeft: block.depth * Spacing.lg }]}>
            <Text style={[styles.marker, themed.muted]}>
              {block.kind === 'bullet' ? (block.depth > 0 ? '◦' : '•') : `${block.number}.`}
            </Text>
            <Text style={[styles.body, styles.listText, themed.text]}>
              {renderSpans(block.spans)}
            </Text>
          </View>
        );
      case 'quote':
        return (
          <View key={index} style={[styles.quote, themed.quote]}>
            <Text style={[styles.body, themed.muted]}>{renderSpans(block.spans)}</Text>
          </View>
        );
      case 'rule':
        return <View key={index} style={[styles.rule, themed.rule]} />;
      default:
        return (
          <Text key={index} style={[styles.body, styles.paragraph, themed.text]}>
            {renderSpans(block.spans)}
          </Text>
        );
    }
  };

  if (!blocks.length) {
    return emptyText ? <Text style={[styles.body, themed.muted]}>{emptyText}</Text> : null;
  }
  return <View testID="release-notes">{blocks.map(renderBlock)}</View>;
};

const styles = StyleSheet.create({
  body: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 21,
  },
  paragraph: {
    marginBottom: Spacing.sm,
  },
  heading: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  first: {
    marginTop: 0,
  },
  h1: {
    fontSize: FontSize.subtitle,
  },
  h2: {
    fontSize: FontSize.bodyLarge + 1,
  },
  h3: {
    fontSize: FontSize.bodyLarge,
  },
  listRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  marker: {
    width: 18,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 21,
  },
  listText: {
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    fontFamily: 'monospace',
    fontSize: FontSize.small + 1,
  },
  link: {
    textDecorationLine: 'underline',
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.md,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  text: { color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  code: { color: colors.textPrimary, backgroundColor: colors.inputBg },
  link: { color: colors.blue },
  quote: { borderLeftColor: colors.border },
  rule: { backgroundColor: colors.divider },
});
