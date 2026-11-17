import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  OFFLINE_ENGINE_UNAVAILABLE_MESSAGE,
  OFFLINE_MODEL_CATALOG,
  cancelModelDownload,
  downloadOfflineModel,
  getAllModelsStatus,
  getDeviceAiRecommendation,
  getSelectedOfflineModelId,
  setSelectedOfflineModelId,
} from '../../../ai/nlu';
import type {
  DeviceAiRecommendation,
  DownloadableOfflineModelId,
  ModelStatus,
  OfflineModelId,
  OfflineModelPreset,
} from '../../../ai/nlu';
import {
  useOfflineModelEngine,
  useSharedModelDownload,
} from '../../hooks/useOfflineModels';
import {
  Card,
  Notice,
  OnboardingPage,
  SecondaryButton,
  Tag,
  TagRow,
  onboardingStyles,
  useOnboardingTokens,
} from './onboardingUi';

export interface OfflineModelStepProps {
  userId: string;
  headLabel: string;
  onBack?: () => void;
  backLabel?: string;
  progress: {count: number; active: number};
  onContinue: () => void;
}

const formatMb = (bytes: number): number =>
  Math.max(1, Math.round(bytes / (1024 * 1024)));

export const OfflineModelStep: React.FC<OfflineModelStepProps> = ({
  userId,
  headLabel,
  onBack,
  backLabel,
  progress,
  onContinue,
}) => {
  const t = useOnboardingTokens();
  const engineAvailable = useOfflineModelEngine();
  const engineReady = engineAvailable === true;
  const sharedDownload = useSharedModelDownload();
  const downloadingModelId = sharedDownload?.modelId ?? null;
  const downloadProgress = sharedDownload?.progress ?? null;

  const [selectedModelId, setSelectedModelId] = useState<OfflineModelId>(() =>
    getSelectedOfflineModelId(userId),
  );
  const [modelsStatus, setModelsStatus] = useState<Record<string, ModelStatus>>(
    {},
  );
  const [recommendation, setRecommendation] =
    useState<DeviceAiRecommendation | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const refreshModels = useCallback(async () => {
    try {
      const [allStatuses, currentSelection] = await Promise.all([
        getAllModelsStatus(userId),
        Promise.resolve(getSelectedOfflineModelId(userId)),
      ]);
      const rec = await getDeviceAiRecommendation(allStatuses);
      if (!mounted.current) return;
      const map: Record<string, ModelStatus> = {};
      for (const item of allStatuses) {
        if (item.modelId) map[item.modelId] = item;
      }
      setModelsStatus(map);
      setSelectedModelId(currentSelection);
      setRecommendation(rec);
    } catch {
      // Leave current state intact if hardware/disk probe fails.
    }
  }, [userId]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels, downloadingModelId]);

  const startBackgroundDownload = (modelId: DownloadableOfflineModelId) => {
    if (!engineReady || downloadingModelId !== null) return;
    setDownloadError(null);
    // Intentionally fire-and-forget so the user can proceed while it downloads.
    void downloadOfflineModel(modelId, undefined, userId)
      .then(() => {
        if (mounted.current) {
          void refreshModels();
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err || '');
        if (/cancel/i.test(message)) return;
        if (mounted.current) {
          setDownloadError(
            message ||
              'Download failed. You can still continue and try again in Profile > Preferences.',
          );
        }
      });
  };

  const handleSelectModel = (modelId: OfflineModelId) => {
    setSelectedOfflineModelId(modelId, userId);
    setSelectedModelId(modelId);
  };

  const orderedPresets = useMemo<readonly OfflineModelPreset[]>(() => {
    if (!recommendation) return OFFLINE_MODEL_CATALOG;
    const recId = recommendation.recommendedModelId;
    const rec = OFFLINE_MODEL_CATALOG.filter(p => p.id === recId);
    const rest = OFFLINE_MODEL_CATALOG.filter(p => p.id !== recId);
    return [...rec, ...rest];
  }, [recommendation]);

  const recommendedPreset = recommendation
    ? OFFLINE_MODEL_CATALOG.find(
        p => p.id === recommendation.recommendedModelId,
      ) ?? null
    : null;
  const recommendedStatus = recommendation
    ? modelsStatus[recommendation.recommendedModelId]
    : undefined;
  const canQuickDownloadRecommended = Boolean(
    engineReady &&
      recommendedPreset &&
      recommendedPreset.id !== 'fast_path_only' &&
      !recommendedStatus?.isDownloaded &&
      downloadingModelId === null,
  );

  return (
    <OnboardingPage
      pageKey="ai"
      headLabel={headLabel}
      onBack={onBack}
      backLabel={backLabel}
      progress={progress}
      scrollable
      title="Choose your offline AI."
      copy="Downloads run in the background — you can continue right away while it finishes."
      error={downloadError}
      note={
        downloadingModelId
          ? 'Downloading in the background — continue now and it will finish while you set up your COR.'
          : 'You can switch or download models anytime in Profile > Preferences.'
      }
      primary={
        canQuickDownloadRecommended && recommendedPreset
          ? {
              label: `Download ${recommendedPreset.shortLabel} & continue`,
              onPress: () => {
                startBackgroundDownload(
                  recommendedPreset.id as DownloadableOfflineModelId,
                );
                onContinue();
              },
              testID: 'onboarding-ai-download-continue',
            }
          : {
              label: 'Continue',
              onPress: onContinue,
              testID: 'onboarding-continue',
            }
      }
      secondary={
        canQuickDownloadRecommended
          ? {
              label: 'Continue without downloading',
              onPress: onContinue,
              testID: 'onboarding-continue',
            }
          : undefined
      }
      testID="onboarding-ai"
    >
      {engineAvailable === null ? (
        <Notice text="Checking on-device AI support…" />
      ) : !engineReady ? (
        <Notice text={OFFLINE_ENGINE_UNAVAILABLE_MESSAGE} />
      ) : null}

      {recommendation ? (
        <Card testID="onboarding-ai-recommendation">
          <View style={styles.recHeader}>
            <Text style={[onboardingStyles.strong, {color: t.ink}]}>
              {recommendation.headline}
            </Text>
            <Tag label="Recommended" tone="good" />
          </View>
          <Text style={[onboardingStyles.small, {color: t.muted}]}>
            {recommendation.specSummary}
          </Text>
          <Text style={[onboardingStyles.small, {color: t.ink}]}>
            {recommendation.reason}
          </Text>
        </Card>
      ) : null}

      {orderedPresets.map(preset => {
        const isFastPath = preset.id === 'fast_path_only';
        const status = modelsStatus[preset.id];
        const isDownloaded = isFastPath || Boolean(status?.isDownloaded);
        const isSelected = selectedModelId === preset.id;
        const isRecommended = recommendation?.recommendedModelId === preset.id;
        const assessment = recommendation?.assessments[preset.id];
        const isDownloadingThis = downloadingModelId === preset.id;
        const isAnotherDownloading =
          downloadingModelId !== null && !isDownloadingThis;
        const downloadableId = isFastPath
          ? null
          : (preset.id as DownloadableOfflineModelId);
        const approxMb = formatMb(preset.approximateSizeBytes);
        const percent = downloadProgress?.percent ?? 0;

        return (
          <Card key={preset.id} testID={`onboarding-ai-card-${preset.id}`}>
            <View style={styles.cardTop}>
              <View style={onboardingStyles.flex1}>
                <Text style={[onboardingStyles.strong, {color: t.ink}]}>
                  {preset.shortLabel}
                  <Text style={[onboardingStyles.small, {color: t.muted}]}>
                    {isFastPath ? ' · Built-in' : ` · ~${approxMb} MB`}
                  </Text>
                </Text>
              </View>
              <TagRow>
                {isRecommended ? <Tag label="Recommended" tone="good" /> : null}
                {isDownloadingThis ? (
                  <Tag label={`Downloading ${percent}%`} tone="neutral" />
                ) : isSelected && isDownloaded ? (
                  <Tag label="Active" tone="good" />
                ) : isDownloaded && !isFastPath ? (
                  <Tag label="Ready" tone="good" />
                ) : null}
              </TagRow>
            </View>

            <Text style={[onboardingStyles.small, {color: t.muted}]}>
              {preset.description}
            </Text>

            {assessment?.note && !isRecommended ? (
              <Text style={[onboardingStyles.small, {color: t.mark}]}>
                {assessment.note}
              </Text>
            ) : null}

            {isDownloadingThis ? (
              <View
                style={styles.progressWrap}
                testID={`onboarding-ai-progress-${preset.id}`}
              >
                <View style={[styles.progressTrack, {backgroundColor: t.line}]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${percent}%`,
                        backgroundColor: t.accent,
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressFooter}>
                  <Text style={[onboardingStyles.small, {color: t.muted}]}>
                    {formatMb(downloadProgress?.bytesWritten ?? 0)} /{' '}
                    {formatMb(
                      downloadProgress?.contentLength ||
                        preset.approximateSizeBytes,
                    )}{' '}
                    MB
                  </Text>
                  <SecondaryButton
                    label="Cancel"
                    onPress={() => void cancelModelDownload()}
                    testID={`onboarding-ai-cancel-${preset.id}`}
                    style={styles.compactButton}
                  />
                </View>
              </View>
            ) : isFastPath ? (
              !isSelected ? (
                <SecondaryButton
                  label="Use Fast-Path Only"
                  onPress={() => handleSelectModel('fast_path_only')}
                  testID="onboarding-ai-select-fast_path_only"
                  style={styles.compactButton}
                />
              ) : null
            ) : isDownloaded ? (
              !isSelected ? (
                <SecondaryButton
                  label={`Use ${preset.shortLabel}`}
                  disabled={!engineReady}
                  onPress={() => handleSelectModel(preset.id)}
                  testID={`onboarding-ai-select-${preset.id}`}
                  style={styles.compactButton}
                />
              ) : null
            ) : (
              <SecondaryButton
                label={`Download (~${approxMb} MB)`}
                disabled={!engineReady || isAnotherDownloading}
                onPress={() =>
                  downloadableId && startBackgroundDownload(downloadableId)
                }
                testID={`onboarding-ai-download-${preset.id}`}
                style={styles.compactButton}
              />
            )}
          </Card>
        );
      })}
    </OnboardingPage>
  );
};

const styles = StyleSheet.create({
  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  progressWrap: {gap: 6, marginTop: 4},
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactButton: {
    minHeight: 38,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
