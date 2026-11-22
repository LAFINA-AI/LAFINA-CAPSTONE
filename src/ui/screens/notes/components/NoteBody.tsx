import {SkillFonts} from '../../../theme/skills';
import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CheckSquare, Image as ImageIcon, Square} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {noteBodyToMarkdown, parseNoteBlocks} from '../../../../utils';
import type {NoteBlock, NoteInline} from '../../../../utils';

/** How far one level of list nesting is pushed in. */
const INDENT = 16;

interface NoteBodyProps {
  /** A note body in either format; a desktop one is projected on the way in. */
  body: string;
  /** Caps a preview. Anything past it is replaced by a "more" line. */
  maxBlocks?: number;
  /** Given, checkboxes can be ticked; without it the note is read-only. */
  onToggleChecklist?: (index: number) => void;
  /** Card sizing rather than editor sizing. */
  compact?: boolean;
  /** Concise 2-column grid card preview: drops blank spacers, limits line wraps, hides overflow count. */
  gridPreview?: boolean;
}

const spanStyle = (
  span: NoteInline,
  colors: ThemeColors,
): Record<string, unknown> | undefined => {
  const style: Record<string, unknown> = {};
  if (span.bold) style.fontWeight = 'bold';
  if (span.italic) style.fontStyle = 'italic';
  if (span.highlight) {
    style.backgroundColor = colors.noteHighlightBg;
    style.color = colors.noteHighlightText;
  }
  if (span.code) {
    style.fontFamily = 'monospace';
    style.backgroundColor = colors.inputBg;
  }
  return Object.keys(style).length > 0 ? style : undefined;
};

const Spans: React.FC<{spans: NoteInline[]; colors: ThemeColors}> = ({
  spans,
  colors,
}) => (
  <>
    {spans.map((span, index) => (
      <Text key={index} style={spanStyle(span, colors)}>
        {span.text}
      </Text>
    ))}
  </>
);

/**
 * Draws a note the way the desktop editor does.
 *
 * Both apps store the same dialect, so a note written on the desktop has to
 * read as headings, quotes and lists here too rather than as its own markup.
 * Checklists are the reason this is a view tree and not one `Text`: a to-do
 * is only useful if it can be ticked.
 */
export const NoteBody: React.FC<NoteBodyProps> = ({
  body,
  maxBlocks,
  onToggleChecklist,
  compact = false,
  gridPreview = false,
}) => {
  const {colors} = useTheme();
  const blocks = useMemo(() => {
    const preview =
      gridPreview && body.length > 4000 ? body.slice(0, 4000) : body;
    return parseNoteBlocks(noteBodyToMarkdown(preview));
  }, [body, gridPreview]);
  const displayBlocks = useMemo(() => {
    if (!gridPreview) return blocks;
    return blocks.filter(block => {
      if (block.kind === 'divider') return false;
      if (block.kind === 'paragraph') {
        return block.spans.some(span => span.text.trim().length > 0);
      }
      return true;
    });
  }, [blocks, gridPreview]);

  const sizes = gridPreview
    ? gridPreviewSizes
    : compact
    ? compactSizes
    : fullSizes;
  const shown =
    maxBlocks === undefined ? displayBlocks : displayBlocks.slice(0, maxBlocks);
  const hidden = gridPreview ? 0 : displayBlocks.length - shown.length;

  const getIndent = (depth: number): number =>
    gridPreview ? Math.min(depth, 1) * 10 : depth * INDENT;

  const renderBlock = (block: NoteBlock, key: number): React.ReactNode => {
    switch (block.kind) {
      case 'divider':
        return (
          <View
            key={key}
            style={[styles.divider, {backgroundColor: colors.border}]}
          />
        );

      case 'image':
        return (
          <View key={key} style={styles.imageRow}>
            <ImageIcon
              size={compact || gridPreview ? 11 : 14}
              color={colors.textMuted}
            />
            <Text
              style={[sizes.body, styles.imageLabel, {color: colors.textMuted}]}
              numberOfLines={gridPreview ? 1 : undefined}
            >
              {block.alt || 'Image'}
            </Text>
          </View>
        );

      case 'heading':
        return (
          <Text
            key={key}
            style={[sizes.heading[block.level], {color: colors.textPrimary}]}
            numberOfLines={gridPreview ? 1 : undefined}
          >
            <Spans spans={block.spans} colors={colors} />
          </Text>
        );

      case 'quote':
        return (
          <View key={key} style={styles.quoteRow}>
            <View style={[styles.quoteBar, {backgroundColor: colors.border}]} />
            <Text
              style={[
                sizes.body,
                styles.quoteText,
                {color: colors.textSecondary},
              ]}
              numberOfLines={gridPreview ? 2 : undefined}
            >
              <Spans spans={block.spans} colors={colors} />
            </Text>
          </View>
        );

      case 'bullet':
      case 'ordered':
        return (
          <View
            key={key}
            style={[styles.row, {marginLeft: getIndent(block.depth)}]}
          >
            <Text
              style={[sizes.body, styles.marker, {color: colors.textMuted}]}
            >
              {block.kind === 'bullet' ? '•' : `${block.marker}.`}
            </Text>
            <Text
              style={[
                sizes.body,
                styles.flexText,
                {color: colors.textSecondary},
              ]}
              numberOfLines={gridPreview ? 1 : undefined}
            >
              <Spans spans={block.spans} colors={colors} />
            </Text>
          </View>
        );

      case 'checklist': {
        const Box = block.checked ? CheckSquare : Square;
        const size = gridPreview ? 12 : compact ? 13 : 18;
        const content = (
          <>
            <Box
              size={size}
              color={block.checked ? colors.success : colors.textMuted}
              style={[styles.checkbox, gridPreview && styles.gridCheckbox]}
            />
            <Text
              style={[
                sizes.body,
                styles.flexText,
                {color: block.checked ? colors.textMuted : colors.textPrimary},
                block.checked && styles.done,
              ]}
              numberOfLines={gridPreview ? 1 : undefined}
            >
              <Spans spans={block.spans} colors={colors} />
            </Text>
          </>
        );
        const style = [
          styles.row,
          gridPreview ? styles.gridCheckRow : styles.checkRow,
          {marginLeft: getIndent(block.depth)},
        ];
        return onToggleChecklist ? (
          <TouchableOpacity
            key={key}
            style={style}
            activeOpacity={0.6}
            onPress={() => onToggleChecklist(block.index)}
            accessibilityRole="checkbox"
            accessibilityState={{checked: block.checked}}
            accessibilityLabel={block.spans.map(span => span.text).join('')}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View key={key} style={style}>
            {content}
          </View>
        );
      }

      default: {
        const text = block.spans.map(span => span.text).join('');
        // A blank line is spacing between paragraphs, not an empty row.
        if (!text.trim()) return <View key={key} style={styles.blankLine} />;
        return (
          <Text
            key={key}
            style={[sizes.body, {color: colors.textSecondary}]}
            numberOfLines={
              gridPreview ? (displayBlocks.length === 1 ? 3 : 2) : undefined
            }
          >
            <Spans spans={block.spans} colors={colors} />
          </Text>
        );
      }
    }
  };

  return (
    <View>
      {shown.map(renderBlock)}
      {hidden > 0 && (
        <Text style={[sizes.body, {color: colors.textMuted}]}>
          {`+${hidden} more line${hidden === 1 ? '' : 's'}`}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-start'},
  checkRow: {paddingVertical: 2},
  gridCheckRow: {paddingVertical: 1},
  checkbox: {marginTop: 2, marginRight: 8},
  gridCheckbox: {marginTop: 2, marginRight: 5},
  marker: {marginRight: 6},
  flexText: {flex: 1},
  done: {textDecorationLine: 'line-through'},
  divider: {height: 1, marginVertical: 8},
  quoteRow: {flexDirection: 'row', alignItems: 'stretch', marginVertical: 2},
  quoteBar: {width: 3, borderRadius: 2, marginRight: 8},
  quoteText: {flex: 1, fontStyle: 'italic'},
  imageRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 2},
  imageLabel: {marginLeft: 6, fontStyle: 'italic'},
  blankLine: {height: 6},
});

const compactText = StyleSheet.create({
  body: {fontFamily: SkillFonts.body, fontSize: 12, lineHeight: 16},
  h1: {
    fontFamily: SkillFonts.semibold,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  h2: {
    fontFamily: SkillFonts.semibold,
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  h3: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
});

const gridPreviewText = StyleSheet.create({
  body: {fontFamily: SkillFonts.body, fontSize: 12, lineHeight: 16},
  h1: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 1,
  },
  h2: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 1,
  },
  h3: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 1,
  },
});

const fullText = StyleSheet.create({
  body: {fontFamily: SkillFonts.body, fontSize: 15, lineHeight: 22},
  h1: {
    fontFamily: SkillFonts.semibold,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  h2: {
    fontFamily: SkillFonts.semibold,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  h3: {
    fontFamily: SkillFonts.semibold,
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 2,
  },
});

const compactSizes = {
  body: compactText.body,
  heading: {1: compactText.h1, 2: compactText.h2, 3: compactText.h3},
};

const gridPreviewSizes = {
  body: gridPreviewText.body,
  heading: {
    1: gridPreviewText.h1,
    2: gridPreviewText.h2,
    3: gridPreviewText.h3,
  },
};

const fullSizes = {
  body: fullText.body,
  heading: {1: fullText.h1, 2: fullText.h2, 3: fullText.h3},
};
