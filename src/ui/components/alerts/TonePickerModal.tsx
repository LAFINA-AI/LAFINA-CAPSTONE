import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  FolderOpen,
  Music,
  Play,
  Square,
  VolumeX,
} from 'lucide-react-native';
import {ToolSheet} from '../tools';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../../theme';
import {
  defaultToneLabelForKind,
  FALLBACK_BUNDLED_TONES,
  listBundledTones,
  pickSystemTone,
  previewTone,
  resolveToneTitle,
  stopTonePreview,
} from '../../../scheduler/soundPicker';
import type {
  BundledToneOption,
  SoundPickerKind,
} from '../../../scheduler/soundPicker';

export interface TonePickerModalProps {
  visible: boolean;
  kind: SoundPickerKind;
  selectedUri: string | null;
  selectedTitle?: string | null;
  allowSilent?: boolean;
  title?: string;
  onSelect: (uri: string | null, title: string) => void;
  onClose: () => void;
}

export const TonePickerModal: React.FC<TonePickerModalProps> = ({
  visible,
  kind,
  selectedUri,
  selectedTitle,
  allowSilent = false,
  title,
  onSelect,
  onClose,
}) => {
  const {colors, isModern, modernPalette} = useTheme();
  const accent = isModern ? modernPalette.accent : colors.blue;
  const surfaceBg = isModern ? modernPalette.surface : colors.inputBg;
  const borderCol = isModern ? modernPalette.border : colors.border;

  const [bundledTones, setBundledTones] = useState<BundledToneOption[]>(() => [
    ...FALLBACK_BUNDLED_TONES,
  ]);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [resolvedCustomTitle, setResolvedCustomTitle] = useState<string>(
    selectedTitle || 'Custom tone',
  );
  const [pickingSystem, setPickingSystem] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const defaultLabel = defaultToneLabelForKind(kind);

  const isCustomSystemUri =
    typeof selectedUri === 'string' &&
    selectedUri.startsWith('content://');

  useEffect(() => {
    if (!visible) {
      setPreviewingKey(null);
      void stopTonePreview();
      return undefined;
    }
    let active = true;
    setErrorMsg(null);
    void listBundledTones().then(items => {
      if (active) setBundledTones(items);
    });
    if (isCustomSystemUri && selectedUri) {
      if (selectedTitle) {
        setResolvedCustomTitle(selectedTitle);
      } else {
        void resolveToneTitle(selectedUri, kind).then(resolved => {
          if (active) setResolvedCustomTitle(resolved);
        });
      }
    }
    return () => {
      active = false;
      void stopTonePreview();
    };
  }, [visible, selectedUri, selectedTitle, isCustomSystemUri, kind]);

  const handleClose = useCallback(() => {
    setPreviewingKey(null);
    void stopTonePreview();
    onClose();
  }, [onClose]);

  const handleChoose = useCallback(
    (uri: string | null, label: string) => {
      setPreviewingKey(null);
      void stopTonePreview();
      onSelect(uri, label);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleTogglePreview = useCallback(
    async (key: string, uri: string | null) => {
      setErrorMsg(null);
      if (previewingKey === key) {
        setPreviewingKey(null);
        await stopTonePreview();
        return;
      }
      setPreviewingKey(key);
      const started = await previewTone(uri, kind);
      if (!started) {
        setPreviewingKey(null);
      }
    },
    [kind, previewingKey],
  );

  const handlePickFromPhone = useCallback(async () => {
    if (pickingSystem) return;
    setErrorMsg(null);
    setPreviewingKey(null);
    await stopTonePreview();
    setPickingSystem(true);
    try {
      const result = await pickSystemTone(kind, selectedUri);
      if (!result.cancelled) {
        onSelect(result.uri, result.title || defaultLabel);
        onClose();
      }
    } catch {
      setErrorMsg('Could not open the system tone picker on this device.');
    } finally {
      setPickingSystem(false);
    }
  }, [defaultLabel, kind, onClose, onSelect, pickingSystem, selectedUri]);

  const isSelected = (candidateUri: string | null): boolean => {
    if (candidateUri === null) return selectedUri === null;
    if (candidateUri === 'silent') return selectedUri === 'silent';
    if (!selectedUri) return false;
    if (selectedUri === candidateUri) return true;
    const rawPart = candidateUri.split('/raw/')[1];
    return Boolean(rawPart && selectedUri.endsWith(`/raw/${rawPart}`));
  };

  const sheetTitle =
    title ||
    (kind === 'ringtone'
      ? 'Choose Call Ringtone'
      : kind === 'notification'
      ? 'Choose Notification Sound'
      : 'Choose Alarm Sound');

  return (
    <ToolSheet visible={visible} title={sheetTitle} onClose={handleClose}>
      <View testID="tone-picker-sheet" style={styles.listWrap}>
        {/* System default */}
        <ToneRow
          testID="tone-option-default"
          previewTestID="tone-preview-default"
          label={defaultLabel}
          subtitle="Uses your phone’s current default sound"
          selected={isSelected(null)}
          previewing={previewingKey === 'default'}
          accent={accent}
          surfaceBg={surfaceBg}
          borderCol={borderCol}
          textPrimary={colors.textPrimary}
          textSecondary={colors.textSecondary}
          icon={<Music size={16} color={accent} />}
          onSelect={() => handleChoose(null, defaultLabel)}
          onPreview={() => void handleTogglePreview('default', null)}
        />

        {/* Bundled LAFINA tones */}
        <Text style={[styles.groupHeader, {color: colors.textSecondary}]}>
          LAFINA TONES
        </Text>
        {bundledTones.map(tone => {
          const key = `bundled:${tone.id}`;
          return (
            <ToneRow
              key={tone.id}
              testID={`tone-option-${tone.id}`}
              previewTestID={`tone-preview-${tone.id}`}
              label={tone.label}
              subtitle="Built-in offline tone"
              selected={isSelected(tone.uri)}
              previewing={previewingKey === key}
              accent={accent}
              surfaceBg={surfaceBg}
              borderCol={borderCol}
              textPrimary={colors.textPrimary}
              textSecondary={colors.textSecondary}
              icon={<Music size={16} color={accent} />}
              onSelect={() => handleChoose(tone.uri, tone.label)}
              onPreview={() => void handleTogglePreview(key, tone.uri)}
            />
          );
        })}

        {/* Silent option (calls and notifications only, never alarms) */}
        {allowSilent && (
          <ToneRow
            testID="tone-option-silent"
            label="Silent"
            subtitle="No sound played for this alert"
            selected={isSelected('silent')}
            previewing={false}
            accent={accent}
            surfaceBg={surfaceBg}
            borderCol={borderCol}
            textPrimary={colors.textPrimary}
            textSecondary={colors.textSecondary}
            icon={<VolumeX size={16} color={colors.textSecondary} />}
            onSelect={() => handleChoose('silent', 'Silent')}
          />
        )}

        {/* Current phone tone if picked from system */}
        {isCustomSystemUri && (
          <>
            <Text style={[styles.groupHeader, {color: colors.textSecondary}]}>
              SELECTED FROM PHONE
            </Text>
            <ToneRow
              testID="tone-option-custom-current"
              previewTestID="tone-preview-custom-current"
              label={resolvedCustomTitle}
              subtitle="Device tone"
              selected
              previewing={previewingKey === 'custom'}
              accent={accent}
              surfaceBg={surfaceBg}
              borderCol={borderCol}
              textPrimary={colors.textPrimary}
              textSecondary={colors.textSecondary}
              icon={<Music size={16} color={accent} />}
              onSelect={() => handleChoose(selectedUri, resolvedCustomTitle)}
              onPreview={() => void handleTogglePreview('custom', selectedUri)}
            />
          </>
        )}

        {/* System picker button */}
        <TouchableOpacity
          testID="tone-picker-system"
          accessibilityRole="button"
          accessibilityLabel="Choose tone from phone"
          activeOpacity={0.8}
          onPress={() => void handlePickFromPhone()}
          style={[
            styles.systemBtn,
            {backgroundColor: surfaceBg, borderColor: borderCol},
          ]}
        >
          <View style={styles.systemBtnLeft}>
            <FolderOpen size={17} color={accent} />
            <Text style={[styles.systemBtnText, {color: colors.textPrimary}]}>
              Choose from phone…
            </Text>
          </View>
          {pickingSystem ? (
            <ActivityIndicator size="small" color={accent} />
          ) : null}
        </TouchableOpacity>

        {errorMsg ? (
          <Text style={[styles.errorText, {color: colors.error}]}>
            {errorMsg}
          </Text>
        ) : null}
      </View>
    </ToolSheet>
  );
};

interface ToneRowProps {
  testID: string;
  previewTestID?: string;
  label: string;
  subtitle?: string;
  selected: boolean;
  previewing: boolean;
  accent: string;
  surfaceBg: string;
  borderCol: string;
  textPrimary: string;
  textSecondary: string;
  icon: React.ReactNode;
  onSelect: () => void;
  onPreview?: () => void;
}

const ToneRow: React.FC<ToneRowProps> = ({
  testID,
  previewTestID,
  label,
  subtitle,
  selected,
  previewing,
  accent,
  surfaceBg,
  borderCol,
  textPrimary,
  textSecondary,
  icon,
  onSelect,
  onPreview,
}) => (
  <View
    style={[
      styles.row,
      {
        backgroundColor: surfaceBg,
        borderColor: selected ? accent : borderCol,
      },
    ]}
  >
    <TouchableOpacity
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{selected, checked: selected}}
      onPress={onSelect}
      activeOpacity={0.78}
      style={styles.rowMain}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowTextCol}>
        <Text
          style={[styles.rowLabel, {color: textPrimary}]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.rowSubtitle, {color: textSecondary}]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={16} color={accent} strokeWidth={2.5} /> : null}
    </TouchableOpacity>
    {onPreview ? (
      <TouchableOpacity
        testID={previewTestID}
        accessibilityRole="button"
        accessibilityLabel={previewing ? `Stop ${label}` : `Preview ${label}`}
        onPress={onPreview}
        activeOpacity={0.78}
        style={[
          styles.previewBtn,
          {borderColor: previewing ? accent : borderCol},
        ]}
      >
        {previewing ? (
          <Square size={13} color={accent} fill={accent} />
        ) : (
          <Play size={13} color={accent} fill={accent} />
        )}
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  listWrap: {
    gap: Spacing.sm,
  },
  groupHeader: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    marginTop: 1,
  },
  previewBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemBtn: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  systemBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  systemBtnText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    marginTop: 4,
  },
});
