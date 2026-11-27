import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {BookOpen, ChevronRight, X} from 'lucide-react-native';
import type {VoiceUstpSearchResult} from '../../../handbook/voiceUstpSearch';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing, useThemedStyles} from '../../theme';
import type {ThemeColors} from '../../theme';

const emptyTitles: Record<VoiceUstpSearchResult['status'], string> = {
  ok: 'No passages available',
  no_evidence: 'No matching source found',
  wrong_academic_year: 'Academic year not covered',
  disabled: 'USTP sources are off',
  ineligible: 'USTP setup needed',
  unavailable: 'Sources unavailable',
};

/** A compact preview; the existing source sheet owns the full reading flow. */
export function UstpCallSourceCard({
  result,
  onDismiss,
  onSeePassages,
}: {
  result: VoiceUstpSearchResult;
  onDismiss: () => void;
  onSeePassages?: (passageIds: string[]) => void;
}) {
  const {colors} = useTheme();
  const themed = useThemedStyles(themeStyles);
  const seen = new Set<string>();
  const passages =
    result.status === 'ok'
      ? result.passages.filter(p => {
          if (!p.passageId.trim() || seen.has(p.passageId)) return false;
          seen.add(p.passageId);
          return true;
        })
      : [];
  const first = passages[0];
  // Do not hide freshness/conflict warnings belonging to the other matches.
  const warnings = Array.from(
    new Set(passages.flatMap(p => [p.staleNote, ...p.caveats]).filter(Boolean)),
  );
  const meta = first
    ? [
        first.sourceTitle ||
          (first.collection === 'ustp_cdo'
            ? 'USTP CDO'
            : '2023 Student Handbook'),
        first.pageLabel,
        first.asOf ? `As of ${first.asOf}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <View testID="call-ustp-results" style={[styles.card, themed.card]}>
      <View style={styles.header}>
        <BookOpen size={17} color={colors.primary} />
        <Text style={[styles.kicker, themed.accent]} accessibilityRole="header">
          USTP sources
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss USTP sources"
          style={styles.close}
        >
          <X size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {result.query.trim() ? (
        <Text style={[styles.query, themed.muted]} numberOfLines={2}>
          {result.query.trim()}
        </Text>
      ) : null}
      {first ? (
        <View style={styles.preview}>
          <Text style={[styles.title, themed.text]} numberOfLines={2}>
            {first.section.trim() || first.chapter.trim() || 'Source passage'}
          </Text>
          <Text style={[styles.meta, themed.muted]}>{meta}</Text>
          {first.excerpt.trim() ? (
            <Text style={[styles.excerpt, themed.text]} numberOfLines={3}>
              {first.excerpt.trim()}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.preview}>
          <Text style={[styles.title, themed.text]}>
            {emptyTitles[result.status]}
          </Text>
          <Text style={[styles.excerpt, themed.muted]}>
            {result.message ||
              result.spokenReply ||
              'Try a more specific USTP question, or check with the Registrar or Office of Student Affairs.'}
          </Text>
        </View>
      )}
      {warnings.length > 0 ? (
        <Text style={[styles.meta, themed.muted]} testID="call-ustp-warning">
          Source note: {warnings.join(' ')}
        </Text>
      ) : null}
      {first && onSeePassages ? (
        <TouchableOpacity
          onPress={() => onSeePassages(passages.map(p => p.passageId))}
          accessibilityRole="button"
          accessibilityLabel="See USTP source passages"
          accessibilityHint="Opens the full passages for this question"
          testID="call-ustp-see-passages"
          style={[styles.action, themed.divider]}
        >
          <Text style={[styles.actionText, themed.accent]}>
            See passages{passages.length > 1 ? ` (${passages.length})` : ''}
          </Text>
          <ChevronRight size={18} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const themeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {backgroundColor: colors.surface, borderColor: colors.border},
    text: {color: colors.textPrimary},
    muted: {color: colors.textSecondary},
    accent: {color: colors.primary},
    divider: {borderTopColor: colors.border},
  });

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  kicker: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  query: {fontFamily: Fonts.body, fontSize: FontSize.small},
  preview: {gap: Spacing.xs},
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  meta: {fontFamily: Fonts.body, fontSize: FontSize.small},
  excerpt: {fontFamily: Fonts.body, fontSize: FontSize.small, lineHeight: 20},
  action: {
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  actionText: {
    flexShrink: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
});
