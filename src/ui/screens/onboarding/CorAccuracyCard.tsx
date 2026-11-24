import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Fonts} from '../../theme';
import type {CorDraftAccuracy} from '../../../ai/vision/corReviewModel';
import {onboardingStyles, useOnboardingTokens} from './onboardingUi';

const MAX_LISTED = 6;

const headline = (accuracy: CorDraftAccuracy): string => {
  if (accuracy.level === 'exact') return 'Read exactly from your COR PDF';
  if (accuracy.level === 'checked') return 'Read from an image · checks passed';
  const count = accuracy.issues.length;
  return `${count} ${count === 1 ? 'thing' : 'things'} to double-check`;
};

const detail = (accuracy: CorDraftAccuracy): string => {
  if (accuracy.level === 'exact') {
    return 'Units match the printed total and every schedule is in the expected format. Still glance over it before adding.';
  }
  if (accuracy.level === 'checked') {
    return 'Everything looks right. Photos can still misspell names or rooms, so compare with your COR. The PDF from the student portal works best.';
  }
  return accuracy.method === 'pdf_text'
    ? 'These come from the COR itself. Compare them with the original:'
    : 'Image reading can misread small text. Compare these with the original, or use the COR PDF from the student portal:';
};

/** How the COR was read and what the automatic checks found. */
export const CorAccuracyCard: React.FC<{accuracy: CorDraftAccuracy}> = ({
  accuracy,
}) => {
  const t = useOnboardingTokens();
  const attention = accuracy.level === 'needs_attention';
  const listed = accuracy.issues.slice(0, MAX_LISTED);
  const more = accuracy.issues.length - listed.length;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: attention ? t.dangerSoft : t.goodSoft,
          borderColor: attention ? t.danger : t.good,
        },
      ]}
      accessibilityRole="summary"
      testID={`cor-accuracy-${accuracy.level}`}
    >
      <Text style={[styles.title, {color: attention ? t.danger : t.good}]}>
        {headline(accuracy)}
      </Text>
      <Text style={[onboardingStyles.small, {color: t.ink}]}>
        {detail(accuracy)}
      </Text>
      {attention
        ? listed.map((message, index) => (
            <Text
              key={`${index}-${message}`}
              style={[onboardingStyles.small, {color: t.ink}]}
              testID="cor-accuracy-issue"
            >
              {`• ${message}`}
            </Text>
          ))
        : null}
      {attention && more > 0 ? (
        <Text style={[onboardingStyles.small, {color: t.muted}]}>
          {`…and ${more} more.`}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {borderWidth: 1, borderRadius: 14, padding: 12, gap: 6},
  title: {fontFamily: Fonts.heading, fontSize: 14, lineHeight: 19},
});
