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
import type {ThemeColors} from '../../contexts/ThemeContext';
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

const spanStyle = (span: ChatInline, colors: ThemeColors): TextStyle | undefined => {
  const style: TextStyle = {};
  if (span.bold) style.fontWeight = 'bold';
  if (span.italic) style.fontStyle = 'italic';
  if (span.strike) style.textDecorationLine = 'line-through';
  if (span.code) {
    style.fontFamily = 'monospace';
    style.backgroundColor = colors.inputBg;
  }
  if (span.href) {
    style.color = colors.primary;
    style.textDecorationLine = 'underline';
  }
  return Object.keys(style).length > 0 ? style : undefined;
};

/**
 * Plain runs are passed as strings, not wrapped in their own `Text`, so a
 * line of ordinary words is a single text element (screen readers and tests
 * read it as one).
 */
const renderSpans = (spans: ChatInline[], colors: ThemeColors): React.ReactNode[] =>
  spans.map((span, index) => {
    const style = spanStyle(span, colors);
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
  (cell ?? []).map((span) => span.text).join('');
export const tableColumnSizes = (rows: ChatInline[][][], fontScale = 1): ColumnSize[] => {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  const width = (chars: number, perChar: number) =>
    Math.round(chars * perChar * fontScale + CELL_PADDING);
  return Array.from({length: columns}, (_, column) => {
    const texts = rows.map((row) => cellText(row[column]));
    const longestCell = Math.max(0, ...texts.map((text) => text.length));
    const longestWord = Math.max(
      0,
      ...texts.flatMap((text) => text.split(/\s+/).map((word) => word.length)),
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
export const fitColumnWidths = (sizes: ColumnSize[], available: number): number[] => {
  const preferred = sizes.map((size) => size.preferred);
  const total = preferred.reduce((sum, width) => sum + width, 0) + TABLE_EDGE;
  if (available <= 0 || total <= available) return preferred;
  const slack = sizes.reduce((sum, size) => sum + size.preferred - size.minimum, 0);
  if (slack <= 0) return sizes.map((size) => size.minimum);
  const ratio = Math.min(1, (total - available) / slack);
  return sizes.map((size) =>
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
  const {colors} = useTheme();
  const [availableWidth, setAvailableWidth] = useState(0);
  const blocks = useMemo(
    () => (format === 'markdown' ? parseChatMarkdown(content, {streaming}) : []),
    [content, format, streaming],
  );
  const plain = useMemo(
    () => (format === 'plain' ? chatMarkdownToPlainText(content, {streaming}) : ''),
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
        return <View key={key} style={[styles.divider, {backgroundColor: colors.border}]} />;

      case 'heading':
        return (
          <Text
            key={key}
            style={[textStyle, styles.heading, headingSizes[block.level]]}
            accessibilityRole="header"
          >
            {renderSpans(block.spans, colors)}
            {tail}
          </Text>
        );

      case 'quote':
        return (
          <View key={key} style={styles.quoteRow}>
            <View style={[styles.quoteBar, {backgroundColor: colors.border}]} />
            <Text style={[textStyle, styles.flexText, {color: colors.textSecondary}]}>
              {renderSpans(block.spans, colors)}
              {tail}
            </Text>
          </View>
        );

      case 'bullet':
      case 'ordered':
        return (
          <View key={key} style={[styles.listRow, {marginLeft: block.depth * INDENT}]}>
            <Text
              style={[
                textStyle,
                block.kind === 'bullet' ? styles.bulletMarker : styles.orderedMarker,
                {color: colors.textSecondary},
              ]}
            >
              {block.kind === 'bullet' ? (block.depth > 0 ? '◦' : '•') : `${block.marker}.`}
            </Text>
            <Text style={[textStyle, styles.flexText]}>
              {renderSpans(block.spans, colors)}
              {tail}
            </Text>
          </View>
        );

      case 'checklist': {
        const Box = block.checked ? CheckSquare : Square;
        return (
          <View key={key} style={[styles.listRow, {marginLeft: block.depth * INDENT}]}>
            <Box
              size={15}
              color={block.checked ? colors.success : colors.textSecondary}
              style={styles.checkbox}
            />
            <Text style={[textStyle, styles.flexText]}>
              {renderSpans(block.spans, colors)}
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
            style={[styles.codeBlock, {backgroundColor: colors.inputBg, borderColor: colors.border}]}
            contentContainerStyle={styles.codeContent}
          >
            <Text style={[styles.codeText, {color: colors.textPrimary}]} selectable>
              {block.text}
            </Text>
          </ScrollView>
        );

      case 'table': {
        const widths = fitColumnWidths(
          tableColumnSizes([block.header, ...block.rows], PixelRatio.getFontScale()),
          availableWidth,
        );
        return (
          <ScrollView
            key={key}
            horizontal
            nestedScrollEnabled
            style={styles.tableScroll}
          >
            <View style={[styles.table, {borderColor: colors.border}]}>
              {[block.header, ...block.rows].map((row, rowIndex) => (
                <View
                  key={rowIndex}
                  style={[
                    styles.tableRow,
                    rowIndex > 0 && {borderTopColor: colors.border, borderTopWidth: 1},
                    rowIndex === 0 && {backgroundColor: colors.inputBg},
                  ]}
                >
                  {widths.map((width, cellIndex) => (
                    <Text
                      key={cellIndex}
                      style={[
                        textStyle,
                        styles.tableCell,
                        {width},
                        cellIndex > 0 && {borderLeftColor: colors.border, borderLeftWidth: 1},
                        rowIndex === 0 && styles.tableHeaderCell,
                      ]}
                    >
                      {renderSpans(row[cellIndex] ?? [], colors)}
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
            {renderSpans(block.spans, colors)}
            {tail}
          </Text>
        );
    }
  };

  return (
    <View
      testID={testID}
      accessibilityLiveRegion={streaming ? 'polite' : undefined}
      onLayout={(event) => setAvailableWidth(Math.floor(event.nativeEvent.layout.width))}
    >
      {blocks.map(renderBlock)}
      {!trailingInline && trailing ? <Text style={textStyle}>{trailing}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  blank: {height: 8},
  divider: {height: 1, marginVertical: 10},
  heading: {fontFamily: Fonts.heading, fontWeight: '700', marginTop: 4, marginBottom: 2},
  quoteRow: {flexDirection: 'row', alignItems: 'stretch', marginVertical: 2},
  quoteBar: {width: 3, borderRadius: 2, marginRight: 8},
  listRow: {flexDirection: 'row', alignItems: 'flex-start', marginVertical: 1},
  bulletMarker: {width: 14},
  orderedMarker: {minWidth: 20, marginRight: 4},
  checkbox: {marginTop: 3, marginRight: 6},
  flexText: {flex: 1},
  codeBlock: {borderWidth: 1, borderRadius: 8, marginVertical: 4},
  codeContent: {padding: 10},
  codeText: {fontFamily: 'monospace', fontSize: 13, lineHeight: 19},
  tableScroll: {marginVertical: 4},
  table: {borderWidth: 1, borderRadius: 8, overflow: 'hidden'},
  tableRow: {flexDirection: 'row'},
  tableCell: {paddingHorizontal: 8, paddingVertical: 6, fontSize: 13.5, lineHeight: 19},
  tableHeaderCell: {fontWeight: '700'},
});

const headingSizes = StyleSheet.create({
  1: {fontSize: 18, lineHeight: 25},
  2: {fontSize: 16.5, lineHeight: 23},
  3: {fontSize: 15, lineHeight: 21},
});
