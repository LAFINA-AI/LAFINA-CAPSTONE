import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Fonts, useThemedStyles} from '../../theme';
import type {ThemeColors} from '../../contexts/ThemeContext';

interface TermsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({visible, onClose}) => {
  const themed = useThemedStyles(getThemedStyles);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, themed.container]}>
        <View style={[styles.header, themed.header]}>
          <Text style={[styles.headerTitle, themed.headerTitle]}>
            Terms of Use
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, themed.closeBtnText]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            1. Student Academic Companion
          </Text>
          <Text style={[styles.bodyText, themed.bodyText]}>
            LAFINA is an offline-first academic scheduling and study companion
            designed for students. It is not an official university portal and
            does not replace official USTP enrollment, grading, or announcement
            channels.
          </Text>

          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            2. Local Data &amp; Cloud Sync
          </Text>
          <Text style={[styles.bodyText, themed.bodyText]}>
            Your schedules, tasks, reminders, and notes are stored locally on
            your device first. Creating a cloud account lets you back up and
            synchronize your personal records across sessions.
          </Text>

          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            3. Handbook References
          </Text>
          <Text style={[styles.bodyText, themed.bodyText]}>
            Student handbook answers cite the bundled USTP Student Handbook
            edition. Always verify time-sensitive academic policies against the
            latest official university notices.
          </Text>

          <Text style={[styles.sectionTitle, themed.sectionTitle]}>
            4. Account Responsibility
          </Text>
          <Text style={[styles.bodyText, themed.bodyText]}>
            Keep your account credentials secure. You can sign out or delete
            your local data at any time from Profile Settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  closeBtnText: {
    fontFamily: Fonts.body,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 6,
  },
  bodyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  container: {
    backgroundColor: colors.background,
  },
  header: {
    borderBottomColor: colors.border,
  },
  headerTitle: {
    color: colors.textPrimary,
  },
  closeBtnText: {
    color: colors.primary,
  },
  sectionTitle: {
    color: colors.textPrimary,
  },
  bodyText: {
    color: colors.textSecondary,
  },
});
