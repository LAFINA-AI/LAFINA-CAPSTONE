import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Cloud, HardDrive, Lock } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useThemedStyles } from '../../theme/createThemedStyles';
import { Spacing } from '../../theme';
import { getMeetingThemedStyles, meetingStyles } from './meetingStyles';

export const PrivacyNotice: React.FC = () => {
  const { colors } = useTheme();
  const themed = useThemedStyles(getMeetingThemedStyles);
  const rows = [
    {
      icon: HardDrive,
      color: colors.textSecondary,
      lead: 'Audio is recorded on this phone',
      rest: ' and intermediate raw audio chunks are deleted automatically after transcription unless you choose to keep audio.',
    },
    {
      icon: Lock,
      color: colors.textSecondary,
      lead: 'Transcription runs on this phone',
      rest: ' with bundled Whisper (whisper.cpp), so it works completely offline.',
    },
    {
      icon: Cloud,
      color: colors.warning,
      lead: 'Optional AI Summary Notes',
      rest: ' only send the text transcript to LAFINA’s cloud AI over HTTPS when you explicitly tap Generate Notes.',
    },
  ];
  return (
    <View>
      {rows.map(({ icon: Icon, color, lead, rest }) => (
        <View key={lead} style={styles.row}>
          <Icon size={18} color={color} />
          <Text style={[meetingStyles.body, styles.text, themed.textPrimary]}>
            <Text style={meetingStyles.strong}>{lead}</Text>
            {rest}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  text: {
    flex: 1,
    marginLeft: Spacing.md,
  },
});
