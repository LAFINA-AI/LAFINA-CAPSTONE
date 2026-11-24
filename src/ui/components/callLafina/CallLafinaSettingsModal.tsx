/**
 * Call Lafina 2.0 Settings Modal (Phase 12, F-050..F-053, F-067, F-070).
 *
 * Provides a dedicated, accessible configuration surface for:
 * - ElevenLabs voice selection and exclusive preview playback (P12-01, P12-02).
 * - Language selection: English, Filipino, Taglish, Cebuano (P12-04, P12-05).
 * - Spoken response style (verbosity) and pacing (P12-03).
 * - Subtitle/caption size accessibility (P12-06).
 * - Call connected and end haptics toggles (F-067).
 * - Subtle tool-call audio cue toggle (F-070, P12-07).
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Check,
  Globe,
  Headphones,
  Info,
  Play,
  RefreshCw,
  Sliders,
  Square,
  Type,
  Vibrate,
  Volume2,
  X,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Fonts, FontSize, Layout, ModernLayout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {
  getCallLafinaSettings,
  saveCallLafinaSettings,
  LANGUAGE_LABELS,
} from '../../../cloud/voiceConversation/callLafinaSettingsStore';
import type {
  CallLafinaCaptionSize,
  CallLafinaLanguage,
  CallLafinaPacing,
  CallLafinaSettings,
  CallLafinaVerbosity,
} from '../../../cloud/voiceConversation/callLafinaSettingsStore';
import {localSettingsStore} from '../../../storage/localSettingsStore';
import {loadOnlineVoices} from '../../../cloud/onlineVoiceService';
import type {OnlineVoiceOption} from '../../../cloud/onlineVoiceService';
import {createCallSpeechProvider} from '../../../cloud/speechService';
import type {CallSpeechProvider} from '../../../scheduler/speechProvider';

export interface CallLafinaSettingsModalProps {
  userId: string;
  visible: boolean;
  isCallActive?: boolean;
  onClose: () => void;
  onSettingsChanged?: (newSettings: CallLafinaSettings) => void;
}

export const PREVIEW_SAMPLE_TEXT =
  'Hello! This is Lafina, speaking with your chosen voice.';

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  fil: 'Filipino',
};

const LANGUAGE_OPTIONS: readonly CallLafinaLanguage[] = [
  'en',
  'fil',
  'taglish',
  'ceb',
];

const CAPTION_OPTIONS: ReadonlyArray<{
  value: CallLafinaCaptionSize;
  label: string;
}> = [
  {value: 'standard', label: 'Standard'},
  {value: 'large', label: 'Large'},
  {value: 'extra_large', label: 'Extra Large'},
];

function formatVoiceMeta(voice: OnlineVoiceOption): string {
  const genderLabel = voice.gender
    ? voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)
    : null;
  const langLabel = voice.language
    ? LANGUAGE_DISPLAY_NAMES[voice.language] ?? voice.language.toUpperCase()
    : null;
  return [genderLabel, langLabel].filter(Boolean).join(' · ');
}

interface SectionCardProps {
  testID: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  cardBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  cardRadius: number;
  shadowStyle?: object;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  testID,
  icon,
  iconBg,
  title,
  subtitle,
  rightSlot,
  cardBg,
  borderColor,
  textPrimary,
  textSecondary,
  cardRadius,
  shadowStyle,
  children,
}) => (
  <View
    style={[
      styles.sectionCard,
      shadowStyle,
      {
        backgroundColor: cardBg,
        borderColor,
        borderRadius: cardRadius,
      },
    ]}
    testID={testID}
  >
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionIconBadge, {backgroundColor: iconBg}]}>
          {icon}
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={[styles.sectionTitle, {color: textPrimary}]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.sectionSubtitle, {color: textSecondary}]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightSlot}
    </View>
    {children}
  </View>
);

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  testID: string;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  selectedValue: T;
  onSelect: (value: T) => void;
  trackBg: string;
  borderColor: string;
  activeBg: string;
  textPrimary: string;
}

function SegmentedControl<T extends string>({
  options,
  selectedValue,
  onSelect,
  trackBg,
  borderColor,
  activeBg,
  textPrimary,
}: SegmentedControlProps<T>) {
  return (
    <View
      style={[styles.segmentTrack, {backgroundColor: trackBg, borderColor}]}
    >
      {options.map(option => {
        const isSelected = selectedValue === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.segmentBtn,
              isSelected && [
                styles.segmentBtnActive,
                {backgroundColor: activeBg},
              ],
            ]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{selected: isSelected}}
            testID={option.testID}
          >
            <Text
              style={[
                styles.segmentText,
                {color: isSelected ? '#FFFFFF' : textPrimary},
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface ToggleRowProps {
  label: string;
  help?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  testID: string;
  textPrimary: string;
  textSecondary: string;
  thumbColor: string;
  trackOffColor: string;
  accentColor: string;
  dividerColor?: string;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  help,
  value,
  onValueChange,
  testID,
  textPrimary,
  textSecondary,
  thumbColor,
  trackOffColor,
  accentColor,
  dividerColor,
}) => (
  <View
    style={[
      styles.toggleRow,
      dividerColor
        ? {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: dividerColor,
          }
        : null,
    ]}
  >
    <View style={styles.toggleInfo}>
      <Text style={[styles.toggleLabel, {color: textPrimary}]}>{label}</Text>
      {help ? (
        <Text style={[styles.toggleHelp, {color: textSecondary}]}>{help}</Text>
      ) : null}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      testID={testID}
      thumbColor={thumbColor}
      trackColor={{false: trackOffColor, true: accentColor}}
    />
  </View>
);

// Memoized: the call screen re-renders during a call; a closed settings
// sheet has nothing to redraw.
export const CallLafinaSettingsModal: React.FC<CallLafinaSettingsModalProps> =
  React.memo(function CallLafinaSettingsModalView({
    userId,
    visible,
    isCallActive = false,
    onClose,
    onSettingsChanged,
  }: CallLafinaSettingsModalProps) {
    const {colors, isModern, modernPalette, modernShadows} = useTheme();
    const insets = useSafeAreaInsets();

    const [settings, setSettings] = useState<CallLafinaSettings>(() =>
      getCallLafinaSettings(userId),
    );
    const [voices, setVoices] = useState<OnlineVoiceOption[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [voiceLoadError, setVoiceLoadError] = useState<string | null>(null);
    const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
      null,
    );

    const activeProvider = useRef<CallSpeechProvider | null>(null);
    const abortCtrl = useRef<AbortController | null>(null);

    const fetchVoices = useCallback(() => {
      abortCtrl.current?.abort();
      const ctrl = new AbortController();
      abortCtrl.current = ctrl;
      setLoadingVoices(true);
      setVoiceLoadError(null);

      loadOnlineVoices(userId, ctrl.signal)
        .then(res => {
          if (!ctrl.signal.aborted) {
            setVoices(res);
            setLoadingVoices(false);
          }
        })
        .catch(err => {
          if (!ctrl.signal.aborted) {
            setVoiceLoadError(err.message || 'Could not load online voices.');
            setLoadingVoices(false);
          }
        });

      return ctrl;
    }, [userId]);

    useEffect(() => {
      if (!visible) return;
      setSettings(getCallLafinaSettings(userId));
      const ctrl = fetchVoices();

      return () => {
        ctrl.abort();
        if (activeProvider.current) {
          void activeProvider.current.stopSpeech?.();
          void activeProvider.current.dispose?.();
          activeProvider.current = null;
        }
      };
    }, [visible, userId, fetchVoices]);

    const stopPreview = useCallback(() => {
      if (activeProvider.current) {
        void activeProvider.current.stopSpeech?.();
        void activeProvider.current.dispose?.();
        activeProvider.current = null;
      }
      setPreviewingVoiceId(null);
    }, []);

    useEffect(() => {
      if (isCallActive) stopPreview();
    }, [isCallActive, stopPreview]);

    const handlePreviewVoice = useCallback(
      async (voice: OnlineVoiceOption) => {
        if (isCallActive) return;
        stopPreview();
        setPreviewingVoiceId(voice.id);

        let provider: CallSpeechProvider | null = null;
        try {
          provider = createCallSpeechProvider(userId, {
            getVoiceId: () => voice.id,
            isOnlineMode: () =>
              localSettingsStore.get(userId, 'chat.onlineMode') === 'true',
          });
          activeProvider.current = provider;

          await provider.speakText(PREVIEW_SAMPLE_TEXT);
        } catch {
          setVoiceLoadError('Voice preview could not play. Please try again.');
        } finally {
          if (activeProvider.current === provider) {
            setPreviewingVoiceId(null);
            activeProvider.current = null;
          }
          void provider?.dispose?.();
        }
      },
      [userId, stopPreview, isCallActive],
    );

    const updateSettings = useCallback(
      (patch: Partial<CallLafinaSettings>) => {
        try {
          const updated = saveCallLafinaSettings(userId, patch);
          setSettings(updated);
          onSettingsChanged?.(updated);
          setVoiceLoadError(null);
        } catch {
          setVoiceLoadError('Could not save this setting. Please try again.');
        }
      },
      [userId, onSettingsChanged],
    );

    const handleSelectVoice = (voice: OnlineVoiceOption) => {
      stopPreview();
      updateSettings({voiceId: voice.id, voiceName: voice.name});
    };
    const handleLanguageSelect = (language: CallLafinaLanguage) =>
      updateSettings({language});
    const handleVerbositySelect = (verbosity: CallLafinaVerbosity) =>
      updateSettings({verbosity});
    const handlePacingSelect = (pacing: CallLafinaPacing) =>
      updateSettings({pacing});
    const handleCaptionSelect = (captionSize: CallLafinaCaptionSize) =>
      updateSettings({captionSize});
    const handleToggleConnHaptics = (callConnectedHaptics: boolean) =>
      updateSettings({callConnectedHaptics});
    const handleToggleEndHaptics = (callEndHaptics: boolean) =>
      updateSettings({callEndHaptics});
    const handleToggleToolAudio = (toolAudioCue: boolean) =>
      updateSettings({toolAudioCue});
    const handleToggleStartWithCall = (startWithCallLafina: boolean) =>
      updateSettings({startWithCallLafina});

    const handleClose = () => {
      stopPreview();
      onClose();
    };

    // Theme tokens supporting both Modern and Classic Light/Dark modes
    const accent = isModern ? modernPalette.accent : colors.primary;
    const sheetBg = isModern ? modernPalette.bg : colors.background;
    const cardBg = isModern ? modernPalette.card : colors.cardBg;
    const subSurfaceBg = isModern ? modernPalette.surface : colors.inputBg;
    const borderColor = isModern ? modernPalette.border : colors.border;
    const textPrimary = isModern ? modernPalette.text : colors.textPrimary;
    const textSecondary = isModern ? modernPalette.muted : colors.textSecondary;
    const softAccentBg = isModern
      ? modernPalette.softViolet
      : colors.primary + '16';
    const blueSoftBg = isModern ? modernPalette.blueSoft : colors.blue + '16';
    const blueInk = isModern ? modernPalette.blueInk : colors.blue;
    const lilacSoftBg = isModern ? modernPalette.lilac : colors.primary + '16';
    const lilacInk = isModern ? modernPalette.lilacInk : colors.primary;
    const mintSoftBg = isModern ? modernPalette.mint : colors.success + '18';
    const mintInk = isModern ? modernPalette.mintInk : colors.success;
    const peachSoftBg = isModern ? modernPalette.peach : colors.warning + '18';
    const peachInk = isModern ? modernPalette.peachInk : colors.warning;
    const dangerSoftBg = isModern
      ? modernPalette.dangerSoft
      : colors.error + '14';
    const dangerColor = isModern ? modernPalette.danger : colors.error;
    const sheetRadius = isModern
      ? ModernLayout.borderRadiusSheet
      : Layout.borderRadiusCard;
    const cardRadius = isModern ? 20 : Layout.borderRadiusCard;
    const cardShadow = isModern ? modernShadows.subtle : undefined;
    const bottomSafePad = Math.max(insets.bottom, Spacing.lg);

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleClose}
        testID="call-lafina-settings-modal"
      >
        <View style={[styles.modalOverlay, {backgroundColor: colors.overlay}]}>
          <Pressable
            style={styles.dismissArea}
            onPress={handleClose}
            accessibilityLabel="Close settings"
          />

          <View
            style={[
              styles.sheet,
              isModern ? modernShadows.floating : undefined,
              {
                backgroundColor: sheetBg,
                borderColor,
                borderTopLeftRadius: sheetRadius,
                borderTopRightRadius: sheetRadius,
              },
            ]}
          >
            {/* Handle & Header */}
            <View
              style={[styles.headerContainer, {borderBottomColor: borderColor}]}
            >
              <View
                style={[styles.dragHandle, {backgroundColor: borderColor}]}
              />
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <View
                    style={[
                      styles.headerIconPill,
                      {backgroundColor: softAccentBg},
                    ]}
                  >
                    <Sliders size={18} color={accent} />
                  </View>
                  <View style={styles.headerTitleCol}>
                    <Text
                      style={[styles.modalTitle, {color: textPrimary}]}
                      testID="call-settings-title"
                    >
                      Call Lafina Settings
                    </Text>
                    <Text
                      style={[styles.modalSubtitle, {color: textSecondary}]}
                      numberOfLines={1}
                    >
                      Voice, language & call behavior
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close settings"
                  testID="call-settings-close"
                  hitSlop={8}
                  style={[
                    styles.closeButton,
                    {backgroundColor: subSurfaceBg, borderColor},
                  ]}
                >
                  <X size={18} color={textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                {paddingBottom: bottomSafePad},
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/* Active Call Notice */}
              {isCallActive && (
                <View
                  style={[
                    styles.activeCallNotice,
                    {
                      backgroundColor: softAccentBg,
                      borderColor: accent + '35',
                    },
                  ]}
                  testID="call-active-notice"
                >
                  <View
                    style={[
                      styles.noticeIconWrap,
                      {backgroundColor: accent + '1F'},
                    ]}
                  >
                    <Info size={15} color={accent} />
                  </View>
                  <Text
                    style={[styles.activeCallNoticeText, {color: textPrimary}]}
                  >
                    Voice changes apply to the next call. Language and style are
                    provider requests; support and pronunciation require
                    evaluation. Voice preview is disabled during calls.
                  </Text>
                </View>
              )}

              {/* Section: Language Selection */}
              <SectionCard
                testID="call-settings-section-language"
                icon={<Globe size={16} color={blueInk} />}
                iconBg={blueSoftBg}
                title="Requested spoken language"
                subtitle="Language quality has not been evaluated on a phone."
                rightSlot={
                  <View
                    style={[styles.headerBadge, {backgroundColor: blueSoftBg}]}
                  >
                    <Text style={[styles.headerBadgeText, {color: blueInk}]}>
                      {LANGUAGE_LABELS[settings.language].split(' ')[0]}
                    </Text>
                  </View>
                }
                cardBg={cardBg}
                borderColor={borderColor}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                cardRadius={cardRadius}
                shadowStyle={cardShadow}
              >
                <View style={styles.languageGrid}>
                  {LANGUAGE_OPTIONS.map(lang => {
                    const isSelected = settings.language === lang;
                    return (
                      <TouchableOpacity
                        key={lang}
                        style={[
                          styles.languageTile,
                          {
                            backgroundColor: isSelected ? accent : subSurfaceBg,
                            borderColor: isSelected ? accent : borderColor,
                          },
                        ]}
                        onPress={() => handleLanguageSelect(lang)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Select language ${LANGUAGE_LABELS[lang]}`}
                        accessibilityState={{selected: isSelected}}
                        testID={`lang-option-${lang}`}
                      >
                        <Text
                          style={[
                            styles.languageTileText,
                            {color: isSelected ? '#FFFFFF' : textPrimary},
                            isSelected && styles.boldText,
                          ]}
                          numberOfLines={1}
                        >
                          {LANGUAGE_LABELS[lang]}
                        </Text>
                        {isSelected ? (
                          <Check size={14} color="#FFFFFF" />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SectionCard>

              {/* Section: Response Style (Verbosity & Pacing) */}
              <SectionCard
                testID="call-settings-section-style"
                icon={<Headphones size={16} color={lilacInk} />}
                iconBg={lilacSoftBg}
                title="Response Style & Pacing"
                subtitle="Tune answer depth and spoken rhythm"
                cardBg={cardBg}
                borderColor={borderColor}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                cardRadius={cardRadius}
                shadowStyle={cardShadow}
              >
                <View style={styles.controlGroup}>
                  <Text style={[styles.subLabel, {color: textSecondary}]}>
                    Response Length
                  </Text>
                  <SegmentedControl<CallLafinaVerbosity>
                    options={[
                      {
                        value: 'brief',
                        label: 'Concise (1-2 sentences)',
                        testID: 'style-brief',
                      },
                      {
                        value: 'detailed',
                        label: 'Detailed',
                        testID: 'style-detailed',
                      },
                    ]}
                    selectedValue={settings.verbosity}
                    onSelect={handleVerbositySelect}
                    trackBg={subSurfaceBg}
                    borderColor={borderColor}
                    activeBg={accent}
                    textPrimary={textPrimary}
                  />
                </View>

                <View style={styles.controlGroup}>
                  <Text style={[styles.subLabel, {color: textSecondary}]}>
                    Speaking Pace
                  </Text>
                  <SegmentedControl<CallLafinaPacing>
                    options={[
                      {
                        value: 'normal',
                        label: 'Normal',
                        testID: 'pace-normal',
                      },
                      {
                        value: 'slow',
                        label: 'Relaxed / Step-by-Step',
                        testID: 'pace-slow',
                      },
                    ]}
                    selectedValue={settings.pacing}
                    onSelect={handlePacingSelect}
                    trackBg={subSurfaceBg}
                    borderColor={borderColor}
                    activeBg={accent}
                    textPrimary={textPrimary}
                  />
                </View>
              </SectionCard>

              {/* Section: Subtitle Accessibility & Captions */}
              <SectionCard
                testID="call-settings-section-accessibility"
                icon={<Type size={16} color={mintInk} />}
                iconBg={mintSoftBg}
                title="Captions & Subtitles"
                subtitle="Adjust live transcript text size during calls"
                cardBg={cardBg}
                borderColor={borderColor}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                cardRadius={cardRadius}
                shadowStyle={cardShadow}
              >
                <SegmentedControl<CallLafinaCaptionSize>
                  options={CAPTION_OPTIONS.map(opt => ({
                    value: opt.value,
                    label: opt.label,
                    testID: `caption-${opt.value}`,
                  }))}
                  selectedValue={settings.captionSize}
                  onSelect={handleCaptionSelect}
                  trackBg={subSurfaceBg}
                  borderColor={borderColor}
                  activeBg={accent}
                  textPrimary={textPrimary}
                />
              </SectionCard>

              {/* Section: Haptics & Feedback */}
              <SectionCard
                testID="call-settings-section-haptics"
                icon={<Vibrate size={16} color={peachInk} />}
                iconBg={peachSoftBg}
                title="Haptics & Cues"
                subtitle="Tactile feedback, cues & call launch"
                cardBg={cardBg}
                borderColor={borderColor}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                cardRadius={cardRadius}
                shadowStyle={cardShadow}
              >
                <ToggleRow
                  label="Call Connected Haptics"
                  help="Subtle vibration when a call connects"
                  value={settings.callConnectedHaptics}
                  onValueChange={handleToggleConnHaptics}
                  testID="toggle-conn-haptics"
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  thumbColor={colors.switchThumb}
                  trackOffColor={colors.switchTrackOff}
                  accentColor={accent}
                  dividerColor={borderColor}
                />
                <ToggleRow
                  label="Call Ended Haptics"
                  help="Subtle vibration when a call ends"
                  value={settings.callEndHaptics}
                  onValueChange={handleToggleEndHaptics}
                  testID="toggle-end-haptics"
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  thumbColor={colors.switchThumb}
                  trackOffColor={colors.switchTrackOff}
                  accentColor={accent}
                  dividerColor={borderColor}
                />
                <ToggleRow
                  label="Tool Call Audio Cue"
                  help="Subtle chime when a planner tool runs (default OFF)"
                  value={settings.toolAudioCue}
                  onValueChange={handleToggleToolAudio}
                  testID="toggle-tool-audio"
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  thumbColor={colors.switchThumb}
                  trackOffColor={colors.switchTrackOff}
                  accentColor={accent}
                  dividerColor={borderColor}
                />
                <ToggleRow
                  label="Start in Call on Chat Open"
                  help="Open Call Lafina automatically when opening Chat (foreground only, requires mic permission)"
                  value={settings.startWithCallLafina}
                  onValueChange={handleToggleStartWithCall}
                  testID="toggle-start-with-call"
                  textPrimary={textPrimary}
                  textSecondary={textSecondary}
                  thumbColor={colors.switchThumb}
                  trackOffColor={colors.switchTrackOff}
                  accentColor={accent}
                />
              </SectionCard>

              {/* Section: ElevenLabs Voice Catalog & Preview */}
              <SectionCard
                testID="call-settings-section-voice"
                icon={<Volume2 size={16} color={accent} />}
                iconBg={softAccentBg}
                title="Voice"
                subtitle={
                  settings.voiceName
                    ? `Active: ${settings.voiceName}`
                    : 'Choose and preview an online voice'
                }
                rightSlot={
                  !loadingVoices ? (
                    <TouchableOpacity
                      onPress={fetchVoices}
                      accessibilityRole="button"
                      accessibilityLabel="Reload online voices"
                      style={[
                        styles.reloadIconBtn,
                        {backgroundColor: subSurfaceBg, borderColor},
                      ]}
                      hitSlop={6}
                    >
                      <RefreshCw size={14} color={textSecondary} />
                    </TouchableOpacity>
                  ) : null
                }
                cardBg={cardBg}
                borderColor={borderColor}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                cardRadius={cardRadius}
                shadowStyle={cardShadow}
              >
                {loadingVoices && (
                  <View
                    style={[
                      styles.loadingBanner,
                      {backgroundColor: subSurfaceBg},
                    ]}
                  >
                    <ActivityIndicator size="small" color={accent} />
                    <Text
                      style={[styles.statusNote, {color: textSecondary}]}
                      testID="voices-loading-note"
                    >
                      Loading voices…
                    </Text>
                  </View>
                )}

                {voiceLoadError && (
                  <View
                    style={[
                      styles.errorBanner,
                      {
                        backgroundColor: dangerSoftBg,
                        borderColor: dangerColor + '33',
                      },
                    ]}
                  >
                    <AlertCircle size={15} color={dangerColor} />
                    <Text
                      style={[styles.errorBannerText, {color: dangerColor}]}
                      testID="voices-error-note"
                    >
                      {voiceLoadError}
                    </Text>
                    <TouchableOpacity
                      onPress={fetchVoices}
                      style={[
                        styles.retryChip,
                        {borderColor: dangerColor + '55'},
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Retry loading voices"
                    >
                      <Text
                        style={[styles.retryChipText, {color: dangerColor}]}
                      >
                        Retry
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {voices.length > 0 && (
                  <View style={styles.voiceList}>
                    {voices.map(voice => {
                      const isSelected = settings.voiceId === voice.id;
                      const isPreviewing = previewingVoiceId === voice.id;
                      const metaText = formatVoiceMeta(voice);

                      return (
                        <View
                          key={voice.id}
                          style={[
                            styles.voiceItem,
                            {
                              backgroundColor: isSelected
                                ? softAccentBg
                                : subSurfaceBg,
                              borderColor: isSelected ? accent : borderColor,
                            },
                          ]}
                          testID={`voice-row-${voice.id}`}
                        >
                          <View style={styles.voiceInfo}>
                            <Text
                              style={[styles.voiceName, {color: textPrimary}]}
                              numberOfLines={1}
                            >
                              {voice.name}
                            </Text>
                            {metaText ? (
                              <Text
                                style={[
                                  styles.voiceMeta,
                                  {color: textSecondary},
                                ]}
                                numberOfLines={1}
                              >
                                {metaText}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.voiceActions}>
                            {isPreviewing ? (
                              <TouchableOpacity
                                style={[
                                  styles.previewButton,
                                  {
                                    backgroundColor: dangerColor,
                                    borderColor: dangerColor,
                                  },
                                ]}
                                onPress={stopPreview}
                                accessibilityRole="button"
                                accessibilityLabel={`Stop previewing ${voice.name}`}
                                testID={`voice-stop-${voice.id}`}
                              >
                                <Square size={11} color="#FFFFFF" />
                                <Text style={styles.previewButtonTextLight}>
                                  Stop
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[
                                  styles.previewButton,
                                  {
                                    backgroundColor: cardBg,
                                    borderColor,
                                  },
                                  isCallActive && styles.disabledButton,
                                ]}
                                disabled={isCallActive}
                                onPress={() => handlePreviewVoice(voice)}
                                accessibilityRole="button"
                                accessibilityLabel={`Preview ${voice.name}`}
                                testID={`voice-preview-${voice.id}`}
                              >
                                <Play size={11} color={textPrimary} />
                                <Text
                                  style={[
                                    styles.previewButtonText,
                                    {color: textPrimary},
                                  ]}
                                >
                                  Preview
                                </Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity
                              style={[
                                styles.selectButton,
                                isSelected
                                  ? {backgroundColor: colors.success}
                                  : {backgroundColor: accent},
                              ]}
                              onPress={() => handleSelectVoice(voice)}
                              accessibilityRole="button"
                              accessibilityLabel={`Select ${voice.name}`}
                              testID={`voice-select-${voice.id}`}
                            >
                              {isSelected && (
                                <Check size={12} color="#FFFFFF" />
                              )}
                              <Text style={styles.selectButtonText}>
                                {isSelected ? 'Selected' : 'Select'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {!loadingVoices && !voiceLoadError && voices.length === 0 && (
                  <Text style={[styles.statusNote, {color: textSecondary}]}>
                    No voices available right now. Tap reload to check again.
                  </Text>
                )}
              </SectionCard>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  });

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  headerContainer: {
    paddingTop: 10,
    paddingHorizontal: Spacing.md,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  headerIconPill: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: 12,
  },
  activeCallNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  noticeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  activeCallNoticeText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  sectionCard: {
    borderWidth: 1,
    padding: 15,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  sectionIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  sectionSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  headerBadgeText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  reloadIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageTile: {
    width: '48.5%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  languageTileText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '500',
  },
  boldText: {
    fontWeight: '700',
  },
  controlGroup: {
    gap: 6,
  },
  subLabel: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  segmentBtnActive: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentText: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  toggleInfo: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleHelp: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  statusNote: {
    fontFamily: Fonts.body,
    fontSize: 13,
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  retryChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  retryChipText: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
  },
  voiceList: {
    gap: 8,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  voiceInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  voiceName: {
    fontFamily: Fonts.heading,
    fontSize: 14.5,
    fontWeight: '700',
  },
  voiceMeta: {
    fontFamily: Fonts.body,
    fontSize: 12,
  },
  voiceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.45,
  },
  previewButtonText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
  previewButtonTextLight: {
    color: '#FFFFFF',
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '700',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  selectButtonText: {
    color: '#FFFFFF',
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '700',
  },
});
