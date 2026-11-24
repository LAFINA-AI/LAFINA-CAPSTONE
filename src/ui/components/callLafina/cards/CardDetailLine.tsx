/**
 * One detail line on a call review card, e.g. "Due: Wed, Nov 25 at 2:00 PM.".
 *
 * A "Label: value" line shows the label small and muted and the value in
 * bold, so the important part (the day, the time) is what the eye lands on.
 * Status lines such as "No reminder (no time was given)." lead in bold.
 * Anything else is drawn as plain text.
 */

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Fonts, FontSize} from '../../../theme';
import {useTheme} from '../../../contexts/ThemeContext';

const FIELD_RE = /^([A-Z][A-Za-z ]{1,24}):\s+(.+)$/;
const LEAD_RE =
  /^(No due date\.|No reminder(?:\s*\([^)]+\))?\.?|Repeats [^.]+\.|Only this [^.]+\.)(?:\s+(.+))?$/i;

/** A trailing period reads as clutter after a short value. */
const tidy = (value: string): string =>
  value.length < 60 ? value.replace(/\.$/, '') : value;

export interface CardDetailLineProps {
  line: string;
  testID?: string;
}

export const CardDetailLine: React.FC<CardDetailLineProps> = ({
  line,
  testID,
}) => {
  const {colors} = useTheme();
  const trimmed = line.trim();
  const field = FIELD_RE.exec(trimmed);
  if (field) {
    return (
      <View style={styles.fieldRow} testID={testID}>
        <Text style={[styles.fieldLabel, {color: colors.textSecondary}]}>
          {`${field[1]}: `}
        </Text>
        <Text style={[styles.fieldValue, {color: colors.textPrimary}]}>
          {tidy(field[2])}
        </Text>
      </View>
    );
  }
  const lead = LEAD_RE.exec(trimmed);
  if (lead) {
    return (
      <Text
        style={[styles.line, {color: colors.textSecondary}]}
        testID={testID}
      >
        <Text style={[styles.bold, {color: colors.textPrimary}]}>
          {lead[1]}
        </Text>
        {lead[2] ? ` ${lead[2]}` : ''}
      </Text>
    );
  }
  return (
    <Text style={[styles.line, {color: colors.textSecondary}]} testID={testID}>
      {line}
    </Text>
  );
};

const styles = StyleSheet.create({
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 3,
  },
  fieldLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    width: 78,
    paddingTop: 1,
  },
  fieldValue: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  line: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 20,
    paddingVertical: 2,
  },
  bold: {
    fontWeight: '700',
  },
});
