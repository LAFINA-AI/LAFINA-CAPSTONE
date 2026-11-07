import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {COMMAND_GUIDE} from '../../../ai/nlu/commandGuide';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import type {ThemeColors} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import {Fonts, FontSize, Spacing} from '../../theme';

interface CommandGuideProps {
  visible: boolean;
  onClose: () => void;
  /** Receives the chosen example. The caller only puts it in the draft. */
  onSelect: (command: string) => void;
}

/**
 * Offers tested command examples (AGY-PORT 06). Adapted from the LAFINA donor
 * `CommandGuide.tsx` (blob 1e06bf35) onto AGY's ToolSheet and theme tokens.
 * Choosing an example never sends, saves or confirms it.
 */
export const CommandGuide: React.FC<CommandGuideProps> = ({
  visible,
  onClose,
  onSelect,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  return (
    <ToolSheet visible={visible} title="What you can ask" onClose={onClose}>
      <Text style={[styles.intro, themed.primary]}>
        Choose an example to put it in your message box. You can edit it before
        sending. Changes to your planner always wait for Confirm.
      </Text>
      {COMMAND_GUIDE.map((example, index) => (
        <TouchableOpacity
          key={example.command}
          accessibilityRole="button"
          accessibilityLabel={`Use example: ${example.command}`}
          onPress={() => onSelect(example.command)}
          style={[styles.row, {borderColor: colors.border}]}
          testID={`chat-guide-example-${index}`}
        >
          <Text style={[styles.command, themed.primary]}>
            {example.command}
          </Text>
          <Text style={[styles.explanation, themed.secondary]}>
            {example.explanation}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={styles.footnote}>
        <Text style={[styles.explanation, themed.secondary]}>
          Schedule questions and planner changes work offline. Turn on Online
          for general questions, the USTP Handbook and document generation.
          Calendar, Notes and the recorder stay available from their own
          screens.
        </Text>
      </View>
    </ToolSheet>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  primary: {color: colors.textPrimary},
  secondary: {color: colors.textSecondary},
});

const styles = StyleSheet.create({
  intro: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  row: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.xs,
  },
  command: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  explanation: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
  },
  footnote: {
    marginTop: Spacing.md,
  },
});
