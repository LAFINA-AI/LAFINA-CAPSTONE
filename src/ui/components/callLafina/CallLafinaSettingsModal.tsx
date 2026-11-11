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
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  Globe,
  Headphones,
  Sliders,
  Square,
  Volume2,
  X,
  Type,
  Vibrate,
} from 'lucide-react-native';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {useTheme} from '../../contexts/ThemeContext';
import {useThemedStyles} from '../../theme/createThemedStyles';
import type {ThemeColors} from '../../contexts/ThemeContext';
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

export const CallLafinaSettingsModal: React.FC<
  CallLafinaSettingsModalProps
> = ({userId, visible, isCallActive = false, onClose, onSettingsChanged}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);

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

  // Load voices when modal opens
  useEffect(() => {
    if (!visible) return;
    setSettings(getCallLafinaSettings(userId));

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

    return () => {
      ctrl.abort();
      if (activeProvider.current) {
        void activeProvider.current.stopSpeech?.();
        void activeProvider.current.dispose?.();
        activeProvider.current = null;
      }
    };
  }, [visible, userId]);

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      testID="call-lafina-settings-modal"
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, themed.modalContent]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Sliders size={20} color={colors.primary} />
              <Text
                style={[styles.modalTitle, themed.primaryText]}
                testID="call-settings-title"
              >
                Call Lafina Settings
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              testID="call-settings-close"
              style={styles.closeButton}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Active Call Notice */}
          {isCallActive && (
            <View
              style={[
                styles.activeCallNotice,
                {backgroundColor: colors.primary + '15'},
              ]}
              testID="call-active-notice"
            >
              <Text
                style={[styles.activeCallNoticeText, {color: colors.primary}]}
              >
                Voice changes apply to the next call. Language and style are
                provider requests; support and pronunciation require evaluation.
                Voice preview is disabled during calls.
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            {/* Section: Language Selection */}
            <View
              style={styles.sectionContainer}
              testID="call-settings-section-language"
            >
              <View style={styles.sectionHeader}>
                <Globe size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, themed.primaryText]}>
                  Requested spoken language
                </Text>
              </View>
              <Text style={themed.secondaryText}>
                Language quality has not been evaluated on a phone.
              </Text>
              <View style={styles.chipsRow}>
                {(['en', 'fil', 'taglish', 'ceb'] as CallLafinaLanguage[]).map(
                  lang => {
                    const isSelected = settings.language === lang;
                    return (
                      <TouchableOpacity
                        key={lang}
                        style={[
                          styles.chip,
                          themed.chip,
                          isSelected && {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          },
                        ]}
                        onPress={() => handleLanguageSelect(lang)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select language ${LANGUAGE_LABELS[lang]}`}
                        testID={`lang-option-${lang}`}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            themed.primaryText,
                            isSelected && {color: '#FFFFFF', fontWeight: '700'},
                          ]}
                        >
                          {LANGUAGE_LABELS[lang]}
                        </Text>
                      </TouchableOpacity>
                    );
                  },
                )}
              </View>
            </View>

            {/* Section: Response Style (Verbosity & Pacing) */}
            <View
              style={styles.sectionContainer}
              testID="call-settings-section-style"
            >
              <View style={styles.sectionHeader}>
                <Headphones size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, themed.primaryText]}>
                  Response Style & Pacing
                </Text>
              </View>

              <Text style={[styles.subLabel, themed.secondaryText]}>
                Response Length
              </Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    themed.chip,
                    settings.verbosity === 'brief' && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => handleVerbositySelect('brief')}
                  accessibilityRole="button"
                  testID="style-brief"
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.primaryText,
                      settings.verbosity === 'brief' && {
                        color: '#FFFFFF',
                        fontWeight: '700',
                      },
                    ]}
                  >
                    Concise (1-2 sentences)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.chip,
                    themed.chip,
                    settings.verbosity === 'detailed' && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => handleVerbositySelect('detailed')}
                  accessibilityRole="button"
                  testID="style-detailed"
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.primaryText,
                      settings.verbosity === 'detailed' && {
                        color: '#FFFFFF',
                        fontWeight: '700',
                      },
                    ]}
                  >
                    Detailed
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.subLabel, themed.secondaryText]}>
                Speaking Pace
              </Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    themed.chip,
                    settings.pacing === 'normal' && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => handlePacingSelect('normal')}
                  accessibilityRole="button"
                  testID="pace-normal"
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.primaryText,
                      settings.pacing === 'normal' && {
                        color: '#FFFFFF',
                        fontWeight: '700',
                      },
                    ]}
                  >
                    Normal
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.chip,
                    themed.chip,
                    settings.pacing === 'slow' && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => handlePacingSelect('slow')}
                  accessibilityRole="button"
                  testID="pace-slow"
                >
                  <Text
                    style={[
                      styles.chipText,
                      themed.primaryText,
                      settings.pacing === 'slow' && {
                        color: '#FFFFFF',
                        fontWeight: '700',
                      },
                    ]}
                  >
                    Relaxed / Step-by-Step
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Section: Subtitle Accessibility & Captions */}
            <View
              style={styles.sectionContainer}
              testID="call-settings-section-accessibility"
            >
              <View style={styles.sectionHeader}>
                <Type size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, themed.primaryText]}>
                  Captions & Subtitles
                </Text>
              </View>
              <View style={styles.chipsRow}>
                {(
                  [
                    'standard',
                    'large',
                    'extra_large',
                  ] as CallLafinaCaptionSize[]
                ).map(sz => {
                  const isSelected = settings.captionSize === sz;
                  const label =
                    sz === 'standard'
                      ? 'Standard'
                      : sz === 'large'
                      ? 'Large'
                      : 'Extra Large';
                  return (
                    <TouchableOpacity
                      key={sz}
                      style={[
                        styles.chip,
                        themed.chip,
                        isSelected && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => handleCaptionSelect(sz)}
                      accessibilityRole="button"
                      testID={`caption-${sz}`}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          themed.primaryText,
                          isSelected && {color: '#FFFFFF', fontWeight: '700'},
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Section: Haptics & Feedback */}
            <View
              style={styles.sectionContainer}
              testID="call-settings-section-haptics"
            >
              <View style={styles.sectionHeader}>
                <Vibrate size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, themed.primaryText]}>
                  Haptics & Cues
                </Text>
              </View>

              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, themed.primaryText]}>
                  Call Connected Haptics
                </Text>
                <Switch
                  value={settings.callConnectedHaptics}
                  onValueChange={handleToggleConnHaptics}
                  testID="toggle-conn-haptics"
                  thumbColor="#FFFFFF"
                  trackColor={{false: colors.border, true: colors.primary}}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, themed.primaryText]}>
                  Call Ended Haptics
                </Text>
                <Switch
                  value={settings.callEndHaptics}
                  onValueChange={handleToggleEndHaptics}
                  testID="toggle-end-haptics"
                  thumbColor="#FFFFFF"
                  trackColor={{false: colors.border, true: colors.primary}}
                />
              </View>

              <View style={styles.toggleRow}>
                <View>
                  <Text style={[styles.toggleLabel, themed.primaryText]}>
                    Tool Call Audio Cue
                  </Text>
                  <Text style={[styles.toggleHelp, themed.secondaryText]}>
                    Subtle chime when a planner tool runs (default OFF)
                  </Text>
                </View>
                <Switch
                  value={settings.toolAudioCue}
                  onValueChange={handleToggleToolAudio}
                  testID="toggle-tool-audio"
                  thumbColor="#FFFFFF"
                  trackColor={{false: colors.border, true: colors.primary}}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleLabel, themed.primaryText]}>
                    Start in Call on Chat Open
                  </Text>
                  <Text style={[styles.toggleHelp, themed.secondaryText]}>
                    Open Call Lafina automatically when opening Chat (foreground
                    only, requires mic permission)
                  </Text>
                </View>
                <Switch
                  value={settings.startWithCallLafina}
                  onValueChange={handleToggleStartWithCall}
                  testID="toggle-start-with-call"
                  thumbColor="#FFFFFF"
                  trackColor={{false: colors.border, true: colors.primary}}
                />
              </View>
            </View>

            {/* Section: ElevenLabs Voice Catalog & Preview */}
            <View
              style={styles.sectionContainer}
              testID="call-settings-section-voice"
            >
              <View style={styles.sectionHeader}>
                <Volume2 size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, themed.primaryText]}>
                  Voice Selection (ElevenLabs)
                </Text>
              </View>

              {loadingVoices && (
                <Text
                  style={[styles.statusNote, themed.secondaryText]}
                  testID="voices-loading-note"
                >
                  Loading voices…
                </Text>
              )}

              {voiceLoadError && (
                <Text
                  style={[styles.statusNote, {color: colors.error}]}
                  testID="voices-error-note"
                >
                  {voiceLoadError}
                </Text>
              )}

              <View style={styles.voiceList}>
                {voices.map(voice => {
                  const isSelected = settings.voiceId === voice.id;
                  const isPreviewing = previewingVoiceId === voice.id;

                  return (
                    <View
                      key={voice.id}
                      style={[
                        styles.voiceItem,
                        themed.itemContainer,
                        isSelected && {borderColor: colors.primary},
                      ]}
                      testID={`voice-row-${voice.id}`}
                    >
                      <View style={styles.voiceInfo}>
                        <Text style={[styles.voiceName, themed.primaryText]}>
                          {voice.name}
                        </Text>
                        <Text style={[styles.voiceMeta, themed.secondaryText]}>
                          {[voice.gender, voice.language]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>

                      <View style={styles.voiceActions}>
                        {isPreviewing ? (
                          <TouchableOpacity
                            style={[
                              styles.previewButton,
                              {backgroundColor: colors.error},
                            ]}
                            onPress={stopPreview}
                            accessibilityRole="button"
                            accessibilityLabel={`Stop previewing ${voice.name}`}
                            testID={`voice-stop-${voice.id}`}
                          >
                            <Square size={12} color="#FFFFFF" />
                            <Text style={styles.previewButtonText}>Stop</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.previewButton,
                              {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                                borderWidth: 1,
                              },
                            ]}
                            disabled={isCallActive}
                            onPress={() => handlePreviewVoice(voice)}
                            accessibilityRole="button"
                            accessibilityLabel={`Preview ${voice.name}`}
                            testID={`voice-preview-${voice.id}`}
                          >
                            <Volume2 size={12} color={colors.textPrimary} />
                            <Text
                              style={[
                                styles.previewButtonText,
                                themed.primaryText,
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
                              : {backgroundColor: colors.primary},
                          ]}
                          onPress={() => handleSelectVoice(voice)}
                          accessibilityRole="button"
                          accessibilityLabel={`Select ${voice.name}`}
                          testID={`voice-select-${voice.id}`}
                        >
                          {isSelected && <Check size={12} color="#FFFFFF" />}
                          <Text style={styles.selectButtonText}>
                            {isSelected ? 'Selected' : 'Select'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    modalContent: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    primaryText: {
      color: colors.textPrimary,
    },
    secondaryText: {
      color: colors.textSecondary,
    },
    chip: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
    },
    itemContainer: {
      backgroundColor: colors.inputBg,
      borderColor: colors.border,
    },
  });

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Layout.borderRadiusCard,
    borderTopRightRadius: Layout.borderRadiusCard,
    borderTopWidth: 1,
    maxHeight: '85%',
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  modalTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
  },
  closeButton: {
    padding: Spacing.xs,
  },
  activeCallNotice: {
    padding: Spacing.sm,
    borderRadius: Layout.borderRadiusButton,
    marginBottom: Spacing.sm,
  },
  activeCallNoticeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  scrollView: {
    marginBottom: Spacing.md,
  },
  sectionContainer: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  subLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    marginTop: Spacing.xs,
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  toggleLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
  toggleHelp: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  toggleInfo: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  statusNote: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    marginVertical: Spacing.xs,
  },
  voiceList: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: Layout.borderRadiusCard,
    borderWidth: 1,
  },
  voiceInfo: {
    flex: 1,
  },
  voiceName: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  voiceMeta: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
  },
  voiceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Layout.borderRadiusButton,
  },
  previewButtonText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Layout.borderRadiusButton,
  },
  selectButtonText: {
    color: '#FFFFFF',
    fontFamily: Fonts.body,
    fontSize: FontSize.caption,
    fontWeight: '600',
  },
});
