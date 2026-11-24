import React from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Camera,
  Dices,
  RotateCcw,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react-native';
import {Fonts, Shadows} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {CharacterAvatar} from './CharacterAvatar';
import {DefaultProfileAvatar} from './DefaultProfileAvatar';

export interface ProfileAvatarModalProps {
  visible: boolean;
  photoSource: {uri: string} | null;
  avatarSeed: string | null;
  isGuest: boolean;
  onClose: () => void;
  onUseCharacter: () => void;
  onChoosePhoto: () => void;
  onRemovePhoto: () => void;
  onResetToDefault: () => void;
}

export const ProfileAvatarModal: React.FC<ProfileAvatarModalProps> = ({
  visible,
  photoSource,
  avatarSeed,
  isGuest,
  onClose,
  onUseCharacter,
  onChoosePhoto,
  onRemovePhoto,
  onResetToDefault,
}) => {
  const {colors, isDarkMode, isModern, modernPalette} = useTheme();
  const insets = useSafeAreaInsets();
  const {width, height} = useWindowDimensions();
  const safeWidth = width > 0 ? width : 360;
  const safeHeight = height > 0 ? height : 640;
  const verticalInset = Math.max(insets.top, 16) + Math.max(insets.bottom, 16);
  const maxCardWidth = Math.min(safeWidth - 32, 440);
  const maxCardHeight = Math.max(280, Math.min(safeHeight - verticalInset - 24, 620));
  const hasPhoto = Boolean(photoSource);
  const hasCharacter = Boolean(avatarSeed);
  const isDefault = !hasPhoto && !hasCharacter;

  const sheetBg = isModern ? modernPalette.card : colors.cardBg;
  const surfaceBg = isModern ? modernPalette.surface : colors.background;
  const borderColor = isModern ? modernPalette.border : colors.border;
  const titleColor = isModern ? modernPalette.text : colors.textPrimary;
  const mutedColor = isModern ? modernPalette.muted : colors.textSecondary;
  const accentColor = isModern ? modernPalette.accent : colors.primary;
  const dangerColor = colors.error;

  const privacyNote = isGuest
    ? 'Sign in later to sync a character avatar across your devices. Photos from your phone stay on this device only.'
    : 'Character avatars sync across your devices. Photos from your phone stay on this device only and are never uploaded.';

  const characterTitle = hasPhoto
    ? 'Use Character Avatar'
    : hasCharacter
    ? 'New Random Character'
    : 'Use Character Avatar';

  const characterSubtitle = isGuest
    ? 'Pick a generated character avatar'
    : 'Syncs across your devices';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close profile picture options"
        />
        <View
          accessibilityViewIsModal
          testID="profile-avatar-modal"
          style={[
            styles.card,
            Shadows.card,
            {
              width: '100%',
              maxWidth: maxCardWidth,
              maxHeight: maxCardHeight,
              backgroundColor: sheetBg,
              borderColor,
            },
          ]}
        >
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.header}>
              <Text style={[styles.title, {color: titleColor}]}>
                Profile Picture
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeButton, {backgroundColor: surfaceBg}]}
                testID="profile-avatar-modal-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <View style={styles.previewRow}>
              <View
                style={[
                  styles.previewCircle,
                  {
                    borderColor: isDefault ? borderColor : accentColor,
                    backgroundColor: surfaceBg,
                  },
                ]}
              >
                {photoSource ? (
                  <Image
                    source={photoSource}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                ) : avatarSeed ? (
                  <CharacterAvatar
                    seed={avatarSeed}
                    size={76}
                    testID="profile-avatar-modal-character"
                  />
                ) : (
                  <DefaultProfileAvatar
                    size={76}
                    isDarkMode={isDarkMode}
                    testID="profile-avatar-modal-default"
                  />
                )}
              </View>
              <Text style={[styles.privacyNote, {color: mutedColor}]}>
                {privacyNote}
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onUseCharacter}
                activeOpacity={0.8}
                testID="profile-avatar-action-character"
                style={[
                  styles.actionRow,
                  {backgroundColor: surfaceBg, borderColor},
                ]}
                accessibilityRole="button"
              >
                <View
                  style={[
                    styles.actionIconBox,
                    {backgroundColor: `${accentColor}1A`},
                  ]}
                >
                  <Dices size={18} color={accentColor} />
                </View>
                <View style={styles.actionText}>
                  <Text style={[styles.actionTitle, {color: titleColor}]}>
                    {characterTitle}
                  </Text>
                  <Text style={[styles.actionSubtitle, {color: mutedColor}]}>
                    {characterSubtitle}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onChoosePhoto}
                activeOpacity={0.8}
                testID="profile-avatar-action-photo"
                style={[
                  styles.actionRow,
                  {backgroundColor: surfaceBg, borderColor},
                ]}
                accessibilityRole="button"
              >
                <View
                  style={[
                    styles.actionIconBox,
                    {backgroundColor: `${accentColor}1A`},
                  ]}
                >
                  <Camera size={18} color={accentColor} />
                </View>
                <View style={styles.actionText}>
                  <Text style={[styles.actionTitle, {color: titleColor}]}>
                    {hasPhoto ? 'Choose New Photo' : 'Choose Photo from Phone'}
                  </Text>
                  <Text style={[styles.actionSubtitle, {color: mutedColor}]}>
                    Saved on this phone only
                  </Text>
                </View>
              </TouchableOpacity>

              {hasPhoto && (
                <TouchableOpacity
                  onPress={onRemovePhoto}
                  activeOpacity={0.8}
                  testID="profile-avatar-action-remove-photo"
                  style={[
                    styles.actionRow,
                    {backgroundColor: surfaceBg, borderColor},
                  ]}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      styles.actionIconBox,
                      {backgroundColor: `${dangerColor}18`},
                    ]}
                  >
                    <Trash2 size={18} color={dangerColor} />
                  </View>
                  <View style={styles.actionText}>
                    <Text style={[styles.actionTitle, {color: dangerColor}]}>
                      Remove Phone Photo
                    </Text>
                    <Text style={[styles.actionSubtitle, {color: mutedColor}]}>
                      {hasCharacter
                        ? 'Return to your character avatar'
                        : 'Return to the default person icon'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {!isDefault && (
                <TouchableOpacity
                  onPress={onResetToDefault}
                  activeOpacity={0.8}
                  testID="profile-avatar-action-reset"
                  style={[
                    styles.actionRow,
                    {backgroundColor: surfaceBg, borderColor},
                  ]}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      styles.actionIconBox,
                      {backgroundColor: `${mutedColor}1A`},
                    ]}
                  >
                    {hasPhoto ? (
                      <RotateCcw size={18} color={mutedColor} />
                    ) : (
                      <UserIcon size={18} color={mutedColor} />
                    )}
                  </View>
                  <View style={styles.actionText}>
                    <Text style={[styles.actionTitle, {color: titleColor}]}>
                      Use Default Avatar
                    </Text>
                    <Text style={[styles.actionSubtitle, {color: mutedColor}]}>
                      Reset to the neutral person icon
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              testID="profile-avatar-action-cancel"
              style={[styles.cancelButton, {borderColor}]}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, {color: mutedColor}]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 18, 28, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    flexShrink: 1,
  },
  scrollBody: {
    flexShrink: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
    fontSize: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  previewCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  privacyNote: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: Fonts.heading,
    fontWeight: '600',
    fontSize: 15,
  },
  actionSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.heading,
    fontWeight: '600',
    fontSize: 14,
  },
});
