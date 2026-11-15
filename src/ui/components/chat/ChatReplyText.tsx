import React, {useMemo, useState} from 'react';
import {
  Linking,
  PixelRatio,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import {CheckSquare, Square} from 'lucide-react-native';
import {Fonts} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {chatMarkdownToPlainText, parseChatMarkdown} from '../../../utils';
import type {ChatBlock, ChatInline} from '../../../utils';
import type {ChatReplyFormat} from '../../../storage/chatReplyFormatStore';

/** How far one level of list nesting is pushed in. */
const INDENT = 14;

interface ChatReplyTextProps {
  content: string;
  format: ChatReplyFormat;
  /** Body text style (size, line height, colour) of the surrounding bubble. */
  textStyle: StyleProp<TextStyle>;
  /** The reply is still being written. */
  streaming?: boolean;
  /** Drawn at the end of the last line, e.g. the streaming cursor. */
  trailing?: React.ReactNode;
  testID?: string;
}

const openLink = (href: string): void => {
  Linking.openURL(href).catch(() => {
    /* No app can open it: the words are still on screen. */
  });
};

const spanStyle = (
  span: ChatInline,
  accent: string,
  softBg: string,
): TextStyle | undefined => {
  const style: TextStyle = {};
  if (span.bold) {
    // Keep body font family so Android resolves true 700 bold instead of medium 500.
    style.fontWeight = '700';
  }
  if (span.italic) style.fontStyle = 'italic';
  if (span.strike) style.textDecorationLine = 'line-through';
  if (span.code) {
    style.fontFamily = 'monospace';
    style.fontSize = 13;
    style.backgroundColor = softBg;
    style.color = accent;
  }
  if (span.href) {
    style.color = accent;
    style.textDecorationLine = 'underline';
  }
  return Object.keys(style).length > 0 ? style : undefined;
};

/**
 * Plain runs are passed as strings, not wrapped in their own `Text`, so a
 * line of ordinary words is a single text element (screen readers and tests
 * read it as one).
 */
const renderSpans = (
  spans: ChatInline[],
  accent: string,
  softBg: string,
): React.ReactNode[] =>
  spans.map((span, index) => {
    const style = spanStyle(span, accent, softBg);
    if (!style) return span.text;
    const href = span.href;
    return (
      <Text
        key={index}
        style={style}
        onPress={href ? () => openLink(href) : undefined}
        accessibilityRole={href ? 'link' : undefined}
      >
        {span.text}
      </Text>
    );
  });

/**
 * Column sizes for a table, shared by every row so the columns line up.
 * `preferred`: wide enough for the longest cell, within limits.
 * `minimum`: wide enough for the longest single word, so a word is never
 * broken in the middle. Text widths are estimated from character counts and
 * the device's font scale (a larger system font needs wider columns).
 */
export interface ColumnSize {
  preferred: number;
  minimum: number;
}
const MIN_COLUMN = 64;
const MAX_COLUMN = 200;
/** Average width of a character in table text (13.5), for whole cells. */
const CHAR_WIDTH = 7.4;
/** A wider guess for single words, so a word is never broken mid-way. */
const WORD_CHAR_WIDTH = 8.6;
const CELL_PADDING = 16;
const cellText = (cell: ChatInline[] | undefined): string =>
  (cell ?? []).map(span => span.text).join('');
export const tableColumnSizes = (
  rows: ChatInline[][][],
  fontScale = 1,
): ColumnSize[] => {
  const columns = Math.max(0, ...rows.map(row => row.length));
  const width = (chars: number, perChar: number) =>
    Math.round(chars * perChar * fontScale + CELL_PADDING);
  return Array.from({length: columns}, (_, column) => {
    const texts = rows.map(row => cellText(row[column]));
    const longestCell = Math.max(0, ...texts.map(text => text.length));
    const longestWord = Math.max(
      0,
      ...texts.flatMap(text => text.split(/\s+/).map(word => word.length)),
    );
    const minimum = Math.max(MIN_COLUMN, width(longestWord, WORD_CHAR_WIDTH));
    const preferred = Math.max(
      minimum,
      Math.min(MAX_COLUMN * fontScale, width(longestCell, CHAR_WIDTH)),
    );
    return {preferred: Math.round(preferred), minimum: Math.round(minimum)};
  });
};

/**
 * Fits a table into the bubble when it can: each column gives up part of its
 * room above its minimum, in proportion. When even the minimums do not fit,
 * the table keeps them and scrolls sideways.
 */
const TABLE_EDGE = 4;
export const fitColumnWidths = (
  sizes: ColumnSize[],
  available: number,
): number[] => {
  const preferred = sizes.map(size => size.preferred);
  const total = preferred.reduce((sum, width) => sum + width, 0) + TABLE_EDGE;
  if (available <= 0 || total <= available) return preferred;
  const slack = sizes.reduce(
    (sum, size) => sum + size.preferred - size.minimum,
    0,
  );
  if (slack <= 0) return sizes.map(size => size.minimum);
  const ratio = Math.min(1, (total - available) / slack);
  return sizes.map(size =>
    Math.floor(size.preferred - (size.preferred - size.minimum) * ratio),
  );
};

/** Blocks whose last line can carry the trailing cursor inline. */
const takesTrailing = (block: ChatBlock): boolean =>
  block.kind !== 'code' &&
  block.kind !== 'table' &&
  block.kind !== 'divider' &&
  block.kind !== 'blank';

/**
 * An assistant reply, formatted as markdown or as plain text.
 *
 * The reply is parsed on every render while it streams. That is a few
 * thousand characters at most, well under a millisecond, so streaming stays
 * as smooth as unformatted text.
 */
export const ChatReplyText: React.FC<ChatReplyTextProps> = ({
  content,
  format,
  textStyle,
  streaming = false,
  trailing,
  testID,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const [availableWidth, setAvailableWidth] = useState(0);
  const accent = isModern ? modernPalette.accent : colors.primary;
  const softBg = isModern ? modernPalette.softViolet : colors.inputBg;
  const textInk = isModern ? modernPalette.text : colors.textPrimary;
  const borderInk = isModern ? modernPalette.border : colors.border;
  const blocks = useMemo(
    () =>
      format === 'markdown' ? parseChatMarkdown(content, {streaming}) : [],
    [content, format, streaming],
  );
  const plain = useMemo(
    () =>
      format === 'plain' ? chatMarkdownToPlainText(content, {streaming}) : '',
    [content, format, streaming],
  );

  if (format === 'plain') {
    return (
      <Text
        style={textStyle}
        testID={testID}
        accessibilityLiveRegion={streaming ? 'polite' : undefined}
      >
        {plain}
        {trailing}
      </Text>
    );
  }

  const lastIndex = blocks.length - 1;
  const trailingInline = lastIndex >= 0 && takesTrailing(blocks[lastIndex]);

  const renderBlock = (block: ChatBlock, key: number): React.ReactNode => {
    const tail = trailingInline && key === lastIndex ? trailing : null;
    switch (block.kind) {
      case 'blank':
        return <View key={key} style={styles.blank} />;

      case 'divider':
        return (
          <View
            key={key}
            style={[styles.divider, {backgroundColor: borderInk}]}
          />
        );

      case 'heading':
        return (
          <Text
            key={key}
            style={[
              textStyle,
              styles.heading,
              headingSizes[block.level],
              {color: block.level === 3 ? accent : textInk},
            ]}
            accessibilityRole="header"
          >
            {renderSpans(block.spans, accent, softBg)}
            {tail}
          </Text>
        );

      case 'quote':
        return (
          <View
            key={key}
            style={[
              styles.quoteRow,
              isModern && [styles.modernQuoteBox, {backgroundColor: softBg}],
            ]}
          >
            <View style={[styles.quoteBar, {backgroundColor: accent}]} />
            <Text
              style={[
                textStyle,
                styles.flexText,
                {color: isModern ? textInk : colors.textSecondary},
              ]}
            >
              {renderSpans(block.spans, accent, softBg)}
              {tail}
            </Text>
          </View>
        );

      case 'bullet':
      case 'ordered':
        return (
          <View
            key={key}
            style={[styles.listRow, {marginLeft: block.depth * INDENT}]}
          >
            <Text
              style={[
                textStyle,
                block.kind === 'bullet'
                  ? styles.bulletMarker
                  : styles.orderedMarker,
                {color: accent, fontWeight: '700'},
              ]}
            >
              {block.kind === 'bullet'
                ? block.depth > 0
                  ? '◦'
                  : '•'
                : `${block.marker}.`}
            </Text>
            <Text style={[textStyle, styles.flexText]}>
              {renderSpans(block.spans, accent, softBg)}
              {tail}
            </Text>
          </View>
        );

      case 'checklist': {
        const Box = block.checked ? CheckSquare : Square;
        return (
          <View
            key={key}
            style={[styles.listRow, {marginLeft: block.depth * INDENT}]}
          >
            <Box
              size={15}
              color={block.checked ? colors.success : accent}
              style={styles.checkbox}
            />
            <Text style={[textStyle, styles.flexText]}>
              {renderSpans(block.spans, accent, softBg)}
              {tail}
            </Text>
          </View>
        );
      }

      case 'code':
        return (
          <ScrollView
            key={key}
            horizontal
            nestedScrollEnabled
            style={[
              styles.codeBlock,
              {backgroundColor: colors.inputBg, borderColor: borderInk},
            ]}
            contentContainerStyle={styles.codeContent}
          >
            <Text style={[styles.codeText, {color: textInk}]} selectable>
              {block.text}
            </Text>
          </ScrollView>
        );

      case 'table': {
        const widths = fitColumnWidths(
          tableColumnSizes(
            [block.header, ...block.rows],
            PixelRatio.getFontScale(),
          ),
          availableWidth,
        );
        return (
          <ScrollView
            key={key}
            horizontal
            nestedScrollEnabled
            style={styles.tableScroll}
          >
            <View style={[styles.table, {borderColor: borderInk}]}>
              {[block.header, ...block.rows].map((row, rowIndex) => (
                <View
                  key={rowIndex}
                  style={[
                    styles.tableRow,
                    rowIndex > 0 && {
                      borderTopColor: borderInk,
                      borderTopWidth: 1,
                    },
                    rowIndex === 0 && {backgroundColor: softBg},
                  ]}
                >
                  {widths.map((width, cellIndex) => (
                    <Text
                      key={cellIndex}
                      style={[
                        textStyle,
                        styles.tableCell,
                        {width},
                        cellIndex > 0 && {
                          borderLeftColor: borderInk,
                          borderLeftWidth: 1,
                        },
                        rowIndex === 0 && styles.tableHeaderCell,
                      ]}
                    >
                      {renderSpans(row[cellIndex] ?? [], accent, softBg)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      }

      default:
        return (
          <Text key={key} style={textStyle}>
            {renderSpans(block.spans, accent, softBg)}
            {tail}
          </Text>
        );
    }
  };

  return (
    <View
      testID={testID}
      accessibilityLiveRegion={streaming ? 'polite' : undefined}
      onLayout={event =>
        setAvailableWidth(Math.floor(event.nativeEvent.layout.width))
      }
    >
      {blocks.map(renderBlock)}
      {!trailingInline && trailing ? (
        <Text style={textStyle}>{trailing}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  blank: {height: 7},
  divider: {height: 1, marginVertical: 9, opacity: 0.7},
  heading: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  quoteRow: {flexDirection: 'row', alignItems: 'stretch', marginVertical: 3},
  modernQuoteBox: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginVertical: 4,
  },
  quoteBar: {width: 3, borderRadius: 2, marginRight: 9},
  listRow: {flexDirection: 'row', alignItems: 'flex-start', marginVertical: 2},
  bulletMarker: {width: 15},
  orderedMarker: {minWidth: 20, marginRight: 4},
  checkbox: {marginTop: 3, marginRight: 6},
  flexText: {flex: 1},
  codeBlock: {borderWidth: 1, borderRadius: 8, marginVertical: 4},
  codeContent: {padding: 10},
  codeText: {fontFamily: 'monospace', fontSize: 13, lineHeight: 19},
  tableScroll: {marginVertical: 4},
  table: {borderWidth: 1, borderRadius: 8, overflow: 'hidden'},
  tableRow: {flexDirection: 'row'},
  tableCell: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13.5,
    lineHeight: 19,
  },
  tableHeaderCell: {fontWeight: '700'},
});

const headingSizes = StyleSheet.create({
  1: {fontSize: 17, lineHeight: 23},
  2: {fontSize: 15.5, lineHeight: 21},
  3: {fontSize: 14, lineHeight: 20},
});
