import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  Cloud,
  Cpu,
  Download,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { getDeviceAiRecommendation } from '../../../ai/nlu/deviceSpecs';
import {
  cancelModelDownload,
  deleteOfflineModel,
  downloadOfflineModel,
  getOfflineModelPreset,
  OFFLINE_ENGINE_UNAVAILABLE_MESSAGE,
  setSelectedOfflineModelId,
} from '../../../ai/nlu/modelManager';
import type {
  DeviceAiRecommendation,
  DownloadableOfflineModelId,
  ModelStatus,
  OfflineModelId,
} from '../../../ai/nlu/types';
import { useTheme } from '../../contexts/ThemeContext';
import {
  useOfflineModelEngine,
  useSharedModelDownload,
} from '../../hooks/useOfflineModels';
import { Fonts, FontSize, Spacing } from '../../theme';
import { ModernShadows } from '../../theme/modern';
import { ToolSheet } from '../tools/ToolSheet';

export interface ChatEngineSheetProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  isOnlineMode: boolean;
  onToggleOnline: () => void | Promise<void>;
  selectedModelId: OfflineModelId;
  modelsStatus: ModelStatus[];
  onModelsUpdated: () => void | Promise<void>;
  deviceRecommendation?: DeviceAiRecommendation | null;
}

function formatApproxMb(bytes: number): string {
  if (!bytes || bytes <= 0) {
    return '0 MB';
  }
  return `~${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatExactMb(bytes: number): string {
  if (!bytes || bytes <= 0) {
    return '0 MB';
  }
  const mb = bytes / (1024 * 1024);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export const ChatEngineSheet: React.FC<ChatEngineSheetProps> = ({
  visible,
  onClose,
  userId,
  isOnlineMode,
  onToggleOnline,
  selectedModelId,
  modelsStatus,
  onModelsUpdated,
  deviceRecommendation,
}) => {
  const { colors, isModern, modernPalette } = useTheme();
  const engineAvailable = useOfflineModelEngine();
  const sharedDownload = useSharedModelDownload();
  const downloadingModelId = sharedDownload?.modelId ?? null;
  const downloadProgress = sharedDownload?.progress ?? null;
  // Downloads and "use this model" stay off until the engine is confirmed.
  const engineReady = engineAvailable === true;
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const mountedRef = React.useRef(true);
  const [fallbackRecommendation, setFallbackRecommendation] =
    useState<DeviceAiRecommendation | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible || deviceRecommendation !== undefined) {
      return;
    }
    let cancelled = false;
    void getDeviceAiRecommendation(modelsStatus)
      .then(rec => {
        if (!cancelled) {
          setFallbackRecommendation(rec);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, deviceRecommendation, modelsStatus]);

  const effectiveRecommendation =
    deviceRecommendation === undefined
      ? fallbackRecommendation
      : deviceRecommendation;
  const recommendedPreset = effectiveRecommendation
    ? getOfflineModelPreset(effectiveRecommendation.recommendedModelId)
    : null;
  const recommendedStatus = effectiveRecommendation
    ? modelsStatus.find(
        item => item.modelId === effectiveRecommendation.recommendedModelId,
      )
    : undefined;
  const recommendedIsFastPath =
    effectiveRecommendation?.recommendedModelId === 'fast_path_only';
  const recommendedReadyAndActive = Boolean(
    effectiveRecommendation &&
      selectedModelId === effectiveRecommendation.recommendedModelId &&
      (recommendedIsFastPath || recommendedStatus?.isDownloaded),
  );
  const isDownloadingRecommended = Boolean(
    effectiveRecommendation &&
      downloadingModelId === effectiveRecommendation.recommendedModelId,
  );

  const orderedModels = useMemo(() => {
    const downloadable = modelsStatus.filter(
      item => item.modelId !== 'fast_path_only',
    );
    const fastPath = modelsStatus.filter(
      item => item.modelId === 'fast_path_only',
    );
    return [...downloadable, ...fastPath];
  }, [modelsStatus]);

  const accent = isModern ? modernPalette.accent : colors.primary;
  const softViolet = isModern
    ? modernPalette.softViolet
    : colors.primary + '16';
  const cardSurface = isModern ? modernPalette.bg : colors.cardBg;
  const elevatedSurface = isModern ? modernPalette.card : colors.surface;
  const textPrimary = isModern ? modernPalette.text : colors.textPrimary;
  const textSecondary = isModern ? modernPalette.muted : colors.textSecondary;
  const borderColor = isModern ? modernPalette.border : colors.border;
  const successColor = colors.success;

  const handleSelectModel = async (modelId: OfflineModelId) => {
    setSelectedOfflineModelId(modelId, userId);
    await onModelsUpdated();
  };

  const handleDownloadAndLoad = async (model: ModelStatus) => {
    const modelId = model.modelId;
    if (
      !modelId ||
      modelId === 'fast_path_only' ||
      downloadingModelId ||
      !engineReady
    ) {
      return;
    }
    const downloadableId = modelId as DownloadableOfflineModelId;

    try {
      // Selects the model for this student on completion (not on cancel).
      await downloadOfflineModel(downloadableId, undefined, userId);
      // A cancelled or failed download throws above, so this runs only for a
      // complete, verified file.
      setSelectedOfflineModelId(downloadableId, userId);
      await onModelsUpdated();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!/cancel|abort/i.test(msg)) {
        Alert.alert(
          'Download Failed',
          /already downloading|Not enough free storage|incomplete|too small|llama engine/i.test(
            msg,
          )
            ? msg
            : `Could not download ${model.modelName}. Check your connection and storage, then try again.`,
        );
      }
    }
  };

  const handleCancelDownload = async () => {
    await cancelModelDownload();
  };

  const handleToggleMode = async (targetOnline: boolean) => {
    if (togglingOnline || isOnlineMode === targetOnline) {
      return;
    }
    setTogglingOnline(true);
    try {
      await onToggleOnline();
    } catch {
      // Handled by caller
    } finally {
      if (mountedRef.current) {
        setTogglingOnline(false);
      }
    }
  };

  const handleDeleteModel = (model: ModelStatus) => {
    const modelId = model.modelId;
    if (!modelId || modelId === 'fast_path_only') {
      return;
    }
    const downloadableId = modelId as DownloadableOfflineModelId;
    Alert.alert(
      'Remove Offline Model?',
      `Delete ${model.modelName} from device storage to free up space? You can re-download it anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyModelId(downloadableId);
            try {
              await deleteOfflineModel(downloadableId, userId);
              await onModelsUpdated();
            } catch (error) {
              console.warn('[ChatEngineSheet] Failed to delete offline model:', error);
              Alert.alert(
                'Could Not Remove Model',
                'Could not delete this offline model right now. Try again.',
              );
            } finally {
              if (mountedRef.current) {
                setBusyModelId(null);
              }
            }
          },
        },
      ],
    );
  };

  return (
    <ToolSheet
      visible={visible}
      title="AI Engine & Offline Models"
      onClose={onClose}
    >
      <View testID="chat-engine-sheet">
        <Text style={[styles.introText, { color: textSecondary }]}>
          Switch between Online Cloud AI and on-device offline models for local
          scheduling, reminders, notes, and private assistance.
        </Text>

        {/* Connection Mode Switcher */}
        <View
          style={[
            styles.modeCard,
            {
              backgroundColor: cardSurface,
              borderColor,
            },
          ]}
          testID="chat-engine-mode-card"
        >
          <View style={styles.modeHeader}>
            <View style={styles.modeTitleRow}>
              {isOnlineMode ? (
                <Cloud size={17} color={successColor} />
              ) : (
                <Cpu size={17} color={accent} />
              )}
              <Text style={[styles.modeTitle, { color: textPrimary }]}>
                {isOnlineMode ? 'Online Cloud AI Active' : 'Offline AI Active'}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isOnlineMode
                    ? successColor + '1F'
                    : softViolet,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: isOnlineMode ? successColor : accent },
                ]}
              >
                {isOnlineMode ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.segmentTrack,
              { backgroundColor: elevatedSurface, borderColor },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                isOnlineMode && { backgroundColor: accent },
              ]}
              disabled={togglingOnline}
              onPress={() => {
                void handleToggleMode(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Switch to Online Mode"
              testID="chat-engine-select-online"
            >
              <Cloud
                size={14}
                color={isOnlineMode ? '#FFFFFF' : textSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: isOnlineMode ? '#FFFFFF' : textSecondary },
                ]}
              >
                Online AI
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                !isOnlineMode && { backgroundColor: accent },
              ]}
              disabled={togglingOnline}
              onPress={() => {
                void handleToggleMode(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Switch to Offline Mode"
              testID="chat-engine-select-offline"
            >
              <Cpu
                size={14}
                color={!isOnlineMode ? '#FFFFFF' : textSecondary}
              />
              <Text
                style={[
                  styles.segmentText,
                  { color: !isOnlineMode ? '#FFFFFF' : textSecondary },
                ]}
              >
                Offline Mode
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {effectiveRecommendation && recommendedPreset && (
          <View
            style={[
              styles.recommendCard,
              {
                backgroundColor: softViolet,
                borderColor: accent + '55',
              },
            ]}
            testID="chat-engine-recommendation-card"
          >
            <View style={styles.recommendHeaderRow}>
              <View style={styles.recommendTitleRow}>
                <Sparkles size={14} color={accent} />
                <Text style={[styles.recommendEyebrow, { color: accent }]}>
                  Recommended For Your Phone
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: cardSurface }]}>
                <Text
                  style={[styles.specSummaryText, { color: textPrimary }]}
                  testID="chat-engine-device-specs"
                >
                  {effectiveRecommendation.specs.isDetected
                    ? effectiveRecommendation.specSummary
                    : 'Auto Fit'}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.recommendModelTitle, { color: textPrimary }]}
              testID="chat-engine-recommended-model"
            >
              {recommendedPreset.name}
            </Text>

            {effectiveRecommendation.specs.isDetected && (
              <Text
                style={[styles.recommendDeviceLabel, { color: textSecondary }]}
              >
                {effectiveRecommendation.specs.deviceLabel}
              </Text>
            )}

            <Text style={[styles.recommendReason, { color: textSecondary }]}>
              {effectiveRecommendation.reason}
            </Text>

            {recommendedReadyAndActive ? (
              <View
                style={[
                  styles.recommendActivePill,
                  { backgroundColor: successColor + '1F' },
                ]}
                testID="chat-engine-recommended-active"
              >
                <Check size={14} color={successColor} />
                <Text
                  style={[styles.recommendActiveText, { color: successColor }]}
                >
                  Active Recommended Model
                </Text>
              </View>
            ) : recommendedIsFastPath || recommendedStatus?.isDownloaded ? (
              <TouchableOpacity
                style={[styles.recommendActionBtn, { backgroundColor: accent }]}
                onPress={() => {
                  void handleSelectModel(
                    effectiveRecommendation.recommendedModelId,
                  );
                }}
                disabled={Boolean(busyModelId)}
                accessibilityRole="button"
                testID="chat-engine-use-recommended"
              >
                <Check size={15} color="#FFFFFF" />
                <Text style={styles.recommendActionText}>
                  Use {recommendedPreset.shortLabel}
                </Text>
              </TouchableOpacity>
            ) : recommendedStatus ? (
              <TouchableOpacity
                style={[
                  styles.recommendActionBtn,
                  {
                    backgroundColor: accent,
                    opacity: downloadingModelId || !engineReady ? 0.55 : 1,
                  },
                ]}
                onPress={() => {
                  void handleDownloadAndLoad(recommendedStatus);
                }}
                disabled={
                  Boolean(downloadingModelId) ||
                  Boolean(busyModelId) ||
                  !engineReady
                }
                accessibilityRole="button"
                testID="chat-engine-download-recommended"
              >
                <Download size={15} color="#FFFFFF" />
                <Text style={styles.recommendActionText}>
                  {isDownloadingRecommended
                    ? `Downloading ${recommendedPreset.shortLabel}…`
                    : `Download & Use ${recommendedPreset.shortLabel}`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Downloadable & Local Models Section */}
        <View style={styles.sectionHeaderRow}>
          <Sparkles size={14} color={accent} />
          <Text style={[styles.sectionLabel, { color: textSecondary }]}>
            On-Device Offline Models
          </Text>
        </View>

        {engineAvailable === false && (
          <View
            style={[
              styles.engineNotice,
              { backgroundColor: colors.warning + '1A', borderColor: colors.warning + '55' },
            ]}
            testID="chat-engine-unavailable-notice"
          >
            <Text style={[styles.engineNoticeText, { color: textPrimary }]}>
              {OFFLINE_ENGINE_UNAVAILABLE_MESSAGE}
            </Text>
          </View>
        )}

        <View style={styles.modelsList}>
          {orderedModels.map(model => {
            const modelId = model.modelId ?? 'fast_path_only';
            const approxBytes = model.approximateSizeBytes ?? 0;
            const ramGb = model.recommendedRamGb ?? 0;
            const isSelected = modelId === selectedModelId;
            const isFastPath = modelId === 'fast_path_only';
            const assessment = effectiveRecommendation?.assessments?.[modelId];
            const isDownloadingThis = downloadingModelId === modelId;
            const otherDownloadActive =
              Boolean(downloadingModelId) && !isDownloadingThis;
            const isBusy = busyModelId === modelId;
            const percent = Math.min(
              100,
              Math.max(0, Math.round(downloadProgress?.percent ?? 0)),
            );

            return (
              <View
                key={modelId}
                style={[
                  styles.modelCard,
                  isModern && ModernShadows.subtle,
                  {
                    backgroundColor: elevatedSurface,
                    borderColor: isSelected ? accent : borderColor,
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
                testID={`chat-model-card-${modelId}`}
              >
                <View style={styles.modelTopRow}>
                  <Text style={[styles.modelName, { color: textPrimary }]}>
                    {model.modelName}
                  </Text>
                  <Text style={[styles.modelSize, { color: textSecondary }]}>
                    {isFastPath ? 'Built-in' : formatApproxMb(approxBytes)}
                  </Text>
                </View>

                <View style={styles.badgeRow}>
                  {assessment?.isRecommended && (
                    <View
                      style={[
                        styles.badgeChip,
                        { backgroundColor: accent + '26' },
                      ]}
                      testID={`chat-model-recommended-${modelId}`}
                    >
                      <Text style={[styles.badgeText, { color: accent }]}>
                        Recommended
                      </Text>
                    </View>
                  )}
                  {isSelected && (
                    <View
                      style={[
                        styles.badgeChip,
                        {
                          backgroundColor:
                            isFastPath || model.isDownloaded
                              ? successColor + '1F'
                              : softViolet,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              isFastPath || model.isDownloaded
                                ? successColor
                                : accent,
                          },
                        ]}
                      >
                        {!isFastPath && !model.isDownloaded
                          ? 'Selected · Needs Download'
                          : isOnlineMode
                            ? 'Offline Default'
                            : 'Active Offline Model'}
                      </Text>
                    </View>
                  )}
                  {!isFastPath && model.isDownloaded && !isSelected && (
                    <View
                      style={[
                        styles.badgeChip,
                        { backgroundColor: successColor + '1A' },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: successColor }]}>
                        Downloaded · {formatExactMb(model.fileSizeBytes)}
                      </Text>
                    </View>
                  )}
                  {ramGb > 0 && (
                    <View
                      style={[
                        styles.badgeChip,
                        { backgroundColor: cardSurface },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: textSecondary }]}>
                        {ramGb}GB+ RAM
                      </Text>
                    </View>
                  )}
                  {assessment && !assessment.isRecommended && assessment.note && (
                    <View
                      style={[
                        styles.badgeChip,
                        {
                          backgroundColor:
                            assessment.tier === 'unsupported'
                              ? colors.red + '1A'
                              : assessment.tier === 'tight_fit'
                                ? colors.warning + '22'
                                : cardSurface,
                        },
                      ]}
                      testID={`chat-model-compat-${modelId}`}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              assessment.tier === 'unsupported'
                                ? colors.red
                                : assessment.tier === 'tight_fit'
                                  ? colors.warning
                                  : textSecondary,
                          },
                        ]}
                      >
                        {assessment.note}
                      </Text>
                    </View>
                  )}
                </View>

                {!!model.description && (
                  <Text style={[styles.modelDesc, { color: textSecondary }]}>
                    {model.description}
                  </Text>
                )}

                {isDownloadingThis ? (
                  <View style={styles.progressBlock}>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: softViolet },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: accent,
                            width: `${Math.max(4, percent)}%`,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.progressMetaRow}>
                      <Text
                        style={[styles.progressLabel, { color: textPrimary }]}
                      >
                        Downloading… {percent}%
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.cancelDownloadBtn,
                          { borderColor: colors.red },
                        ]}
                        onPress={() => {
                          void handleCancelDownload();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel ${model.modelName} download`}
                        testID={`chat-model-cancel-${modelId}`}
                      >
                        <X size={13} color={colors.red} />
                        <Text
                          style={[
                            styles.cancelDownloadText,
                            { color: colors.red },
                          ]}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : isFastPath ? (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: isSelected ? softViolet : cardSurface,
                        borderWidth: 1,
                        borderColor: isSelected ? accent : borderColor,
                      },
                    ]}
                    onPress={() => {
                      void handleSelectModel('fast_path_only');
                    }}
                    disabled={isSelected}
                    accessibilityRole="button"
                    testID={`chat-model-action-${modelId}`}
                  >
                    {isSelected && <Check size={16} color={accent} />}
                    <Text
                      style={[
                        styles.actionButtonText,
                        { color: isSelected ? accent : textPrimary },
                      ]}
                    >
                      {isSelected ? 'Selected' : 'Use Fast-Path Only'}
                    </Text>
                  </TouchableOpacity>
                ) : model.isDownloaded ? (
                  <View style={styles.downloadedActions}>
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.useModelButton,
                        {
                          backgroundColor: isSelected ? softViolet : accent,
                          borderWidth: isSelected ? 1 : 0,
                          borderColor: accent,
                        },
                      ]}
                      onPress={() => {
                        void handleSelectModel(modelId);
                      }}
                      disabled={isSelected || isBusy || !engineReady}
                      accessibilityRole="button"
                      testID={`chat-model-action-${modelId}`}
                    >
                      {isSelected && <Check size={16} color={accent} />}
                      <Text
                        style={[
                          styles.actionButtonText,
                          { color: isSelected ? accent : '#FFFFFF' },
                        ]}
                      >
                        {isSelected
                          ? isOnlineMode
                            ? 'Selected Offline Model'
                            : 'Active'
                          : 'Use This Model'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.deleteModelBtn,
                        {
                          borderColor: colors.red + '55',
                          backgroundColor: colors.red + '10',
                        },
                      ]}
                      onPress={() => handleDeleteModel(model)}
                      disabled={isBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${model.modelName}`}
                      testID={`chat-model-delete-${modelId}`}
                    >
                      <Trash2 size={16} color={colors.red} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      {
                        backgroundColor: accent,
                        opacity: otherDownloadActive || !engineReady ? 0.55 : 1,
                      },
                    ]}
                    onPress={() => {
                      void handleDownloadAndLoad(model);
                    }}
                    disabled={otherDownloadActive || isBusy || !engineReady}
                    accessibilityRole="button"
                    testID={`chat-model-action-${modelId}`}
                  >
                    <Download size={16} color="#FFFFFF" />
                    <Text
                      style={[styles.actionButtonText, { color: '#FFFFFF' }]}
                    >
                      {engineAvailable === false
                        ? 'Not Available On This Build'
                        : 'Download & Load'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </ToolSheet>
  );
};

const styles = StyleSheet.create({
  introText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  modeCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 10,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modeTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
  },
  segmentText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  recommendCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 6,
  },
  recommendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  recommendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recommendEyebrow: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  specSummaryText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  recommendModelTitle: {
    fontFamily: Fonts.heading,
    fontSize: 15.5,
    fontWeight: '700',
    marginTop: 2,
  },
  recommendDeviceLabel: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '600',
  },
  recommendReason: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
  },
  recommendActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 4,
  },
  recommendActiveText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  recommendActionBtn: {
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 4,
  },
  recommendActionText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionLabel: {
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  engineNotice: {
    borderRadius: 14,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  engineNoticeText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
  },
  modelsList: {
    gap: 12,
    paddingBottom: Spacing.md,
  },
  modelCard: {
    borderRadius: 20,
    padding: 15,
    gap: 8,
  },
  modelTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  modelName: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 15.5,
    fontWeight: '700',
    lineHeight: 20,
  },
  modelSize: {
    fontFamily: Fonts.body,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
  },
  modelDesc: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18.5,
  },
  actionButton: {
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 4,
  },
  actionButtonText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  downloadedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  useModelButton: {
    flex: 1,
    marginTop: 0,
  },
  deleteModelBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBlock: {
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  cancelDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cancelDownloadText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
});
