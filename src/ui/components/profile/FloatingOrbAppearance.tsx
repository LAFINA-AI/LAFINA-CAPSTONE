import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Switch, Text, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Spacing} from '../../theme';
import {
  DEFAULT_ORB_CUSTOMIZATION,
  ORB_COLOR_CHOICES,
  ORB_OPACITY_CHOICES,
  floatingAssistantNative,
} from '../../../utils/floatingAssistantNative';
import type {
  OrbCustomization,
  OrbSize,
  OrbStyle,
} from '../../../utils/floatingAssistantNative';

export const ORB_LOOK_COPY = {
  saveFailed: 'That change could not be saved. Try again.',
  handleHint:
    'Tap the bar or swipe it toward the middle to open Quick Chat. Press and hold, then drag, to move it.',
  bubbleHint:
    'Tap the bubble to open Quick Chat. Drag it to move it, or onto the X to hide it.',
  locked: 'Position locked: the button opens Quick Chat but does not move.',
} as const;

/** Sizes in dp, matching `OrbMetrics` in FloatingOrbRules.kt. */
const HANDLE_SIZE: Record<OrbSize, {height: number; bar: number}> = {
  small: {height: 64, bar: 4},
  medium: {height: 88, bar: 6},
  large: {height: 112, bar: 8},
};
const BUBBLE_SIZE: Record<OrbSize, number> = {small: 40, medium: 48, large: 56};

const isLight = (hex: string): boolean => {
  const value = parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(value)) return false;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
};

/** A plain-language description of the look, also the preview's label. */
export const describeOrbLook = (look: OrbCustomization): string => {
  const kind = look.style === 'handle' ? 'Edge bar' : 'Bubble';
  const parts = [
    `${kind}, ${look.size}, ${look.side} side`,
    `${look.idleOpacity}% visible when idle`,
  ];
  if (look.style === 'bubble' && look.tuckWhenIdle) parts.push('tucks away');
  if (look.lockPosition) parts.push('position locked');
  return parts.join(', ');
};

interface PreviewProps {
  look: OrbCustomization;
  fill: string;
}

/** What the button looks like while idle, on a stand-in screen edge. */
export const OrbPreview: React.FC<PreviewProps> = ({look, fill}) => {
  const {colors} = useTheme();
  const light = isLight(fill);
  const outline = light ? 'rgba(0,0,0,0.43)' : 'rgba(255,255,255,0.9)';
  const opacity = look.idleOpacity / 100;
  const sideStyle = look.side === 'right' ? {right: 2} : {left: 2};
  let mark: React.ReactNode;
  if (look.style === 'handle') {
    const {height, bar} = HANDLE_SIZE[look.size];
    mark = (
      <View
        testID="floating-look-preview-handle"
        style={[
          styles.previewHandle,
          sideStyle,
          {
            width: bar,
            height: height - 8,
            borderRadius: bar / 2,
            backgroundColor: fill,
            borderColor: outline,
            opacity,
            marginTop: -(height - 8) / 2,
          },
        ]}
      />
    );
  } else {
    const disc = BUBBLE_SIZE[look.size];
    const offset = look.tuckWhenIdle ? -disc / 2 : 8;
    mark = (
      <View
        testID="floating-look-preview-bubble"
        style={[
          styles.previewBubble,
          look.side === 'right' ? {right: offset} : {left: offset},
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            backgroundColor: fill,
            borderColor: outline,
            opacity,
            marginTop: -disc / 2,
          },
        ]}
      >
        <Text
          style={[
            styles.previewGlyph,
            {color: light ? '#202124' : '#FFFFFF', fontSize: disc * 0.5},
          ]}
        >
          L
        </Text>
      </View>
    );
  }
  return (
    <View
      testID="floating-look-preview"
      accessible
      accessibilityLabel={`Preview: ${describeOrbLook(look)}`}
      style={[
        styles.preview,
        {borderColor: colors.border, backgroundColor: colors.inputBg},
      ]}
    >
      <View style={[styles.previewLine, {backgroundColor: colors.border}]} />
      <View
        style={[
          styles.previewLine,
          styles.previewLineShort,
          {backgroundColor: colors.border},
        ]}
      />
      <View style={[styles.previewLine, {backgroundColor: colors.border}]} />
      {mark}
    </View>
  );
};

interface ChoiceRowProps<T extends string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<{value: T; label: string}>;
  onChange: (value: T) => void;
  testIdPrefix: string;
}

function ChoiceRow<T extends string | number>({
  label,
  value,
  options,
  onChange,
  testIdPrefix,
}: ChoiceRowProps<T>): React.ReactElement {
  const {colors} = useTheme();
  return (
    <View style={styles.choiceBlock}>
      <Text style={[styles.choiceLabel, {color: colors.textSecondary}]}>
        {label}
      </Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {options.map(option => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{selected}}
              accessibilityLabel={`${label}: ${option.label}`}
              testID={`${testIdPrefix}-${option.value}`}
              style={[
                styles.choice,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  {color: selected ? colors.textOnPrimary : colors.textPrimary},
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const STYLE_OPTIONS: ReadonlyArray<{value: OrbStyle; label: string}> = [
  {value: 'handle', label: 'Edge bar'},
  {value: 'bubble', label: 'Bubble'},
];
const SIZE_OPTIONS: ReadonlyArray<{value: OrbSize; label: string}> = [
  {value: 'small', label: 'Small'},
  {value: 'medium', label: 'Medium'},
  {value: 'large', label: 'Large'},
];
const SIDE_OPTIONS: ReadonlyArray<{
  value: OrbCustomization['side'];
  label: string;
}> = [
  {value: 'left', label: 'Left'},
  {value: 'right', label: 'Right'},
];
const OPACITY_OPTIONS = ORB_OPACITY_CHOICES.map(value => ({
  value: value as number,
  label: `${value}%`,
}));

interface FloatingOrbAppearanceProps {
  visible: boolean;
}

/**
 * Profile → Floating LAFINA → Look and feel: style, size, side, idle
 * opacity, colour, tuck, full screen and position lock, with a live preview.
 * Saved on this phone (like the button's position), not synced.
 */
export const FloatingOrbAppearance: React.FC<FloatingOrbAppearanceProps> = ({
  visible,
}) => {
  const {colors} = useTheme();
  const [look, setLook] = useState<OrbCustomization>({
    ...DEFAULT_ORB_CUSTOMIZATION,
  });
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    void floatingAssistantNative.getOrbCustomization().then(saved => {
      if (mounted.current) setLook(saved);
    });
    // The theme colour is what "App theme" draws.
    void floatingAssistantNative.setOrbAppearance(colors.primary);
  }, [visible, colors.primary]);

  const change = useCallback(
    async (changes: Partial<OrbCustomization>) => {
      setNotice('');
      const previous = look;
      setLook(current => ({...current, ...changes}));
      const saved = await floatingAssistantNative.setOrbCustomization(changes);
      if (!mounted.current) return;
      if (saved) {
        setLook(saved);
      } else {
        setLook(previous);
        setNotice(ORB_LOOK_COPY.saveFailed);
      }
    },
    [look],
  );

  const reset = async () => {
    setNotice('');
    const saved = await floatingAssistantNative.resetOrbCustomization();
    if (!mounted.current) return;
    if (saved) setLook(saved);
    else setNotice(ORB_LOOK_COPY.saveFailed);
  };

  const fill = look.color === 'theme' ? colors.primary : look.color;

  return (
    <View testID="floating-look">
      <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>
        Look and feel
      </Text>
      <OrbPreview look={look} fill={fill} />
      <Text
        style={[styles.note, {color: colors.textSecondary}]}
        testID="floating-look-hint"
      >
        {look.lockPosition
          ? ORB_LOOK_COPY.locked
          : look.style === 'handle'
          ? ORB_LOOK_COPY.handleHint
          : ORB_LOOK_COPY.bubbleHint}
      </Text>

      <ChoiceRow
        label="Style"
        value={look.style}
        options={STYLE_OPTIONS}
        onChange={style => void change({style})}
        testIdPrefix="floating-look-style"
      />
      <ChoiceRow
        label="Size"
        value={look.size}
        options={SIZE_OPTIONS}
        onChange={size => void change({size})}
        testIdPrefix="floating-look-size"
      />
      <ChoiceRow
        label="Side"
        value={look.side}
        options={SIDE_OPTIONS}
        onChange={side => void change({side})}
        testIdPrefix="floating-look-side"
      />
      <ChoiceRow
        label="Visible when idle"
        value={look.idleOpacity}
        options={OPACITY_OPTIONS}
        onChange={idleOpacity => void change({idleOpacity})}
        testIdPrefix="floating-look-opacity"
      />

      <View style={styles.choiceBlock}>
        <Text style={[styles.choiceLabel, {color: colors.textSecondary}]}>
          Colour
        </Text>
        <View style={styles.choices} accessibilityRole="radiogroup">
          {ORB_COLOR_CHOICES.map(choice => {
            const selected = look.color === choice.value;
            const swatch =
              choice.value === 'theme' ? colors.primary : choice.value;
            return (
              <TouchableOpacity
                key={choice.value}
                onPress={() => void change({color: choice.value})}
                accessibilityRole="radio"
                accessibilityState={{selected}}
                accessibilityLabel={`Colour: ${choice.label}`}
                testID={`floating-look-color-${choice.value.replace('#', '')}`}
                style={[
                  styles.swatchTarget,
                  {borderColor: selected ? colors.primary : 'transparent'},
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    {backgroundColor: swatch, borderColor: colors.border},
                  ]}
                >
                  {choice.value === 'theme' ? (
                    <Text
                      style={[
                        styles.swatchLabel,
                        {color: isLight(swatch) ? '#202124' : '#FFFFFF'},
                      ]}
                    >
                      A
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {look.style === 'bubble' ? (
        <View style={styles.switchRow}>
          <Text style={[styles.label, {color: colors.textPrimary}]}>
            Tuck into the edge when idle
          </Text>
          <Switch
            value={look.tuckWhenIdle}
            onValueChange={tuckWhenIdle => void change({tuckWhenIdle})}
            accessibilityLabel="Tuck into the edge when idle"
            testID="floating-look-tuck"
            trackColor={{false: colors.switchTrackOff, true: colors.red}}
            thumbColor={colors.switchThumb}
          />
        </View>
      ) : null}
      <View style={styles.switchRow}>
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Hide in full-screen apps
        </Text>
        <Switch
          value={look.hideInFullscreen}
          onValueChange={hideInFullscreen => void change({hideInFullscreen})}
          accessibilityLabel="Hide in full-screen apps"
          testID="floating-look-fullscreen"
          trackColor={{false: colors.switchTrackOff, true: colors.red}}
          thumbColor={colors.switchThumb}
        />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Lock position
        </Text>
        <Switch
          value={look.lockPosition}
          onValueChange={lockPosition => void change({lockPosition})}
          accessibilityLabel="Lock position"
          testID="floating-look-lock"
          trackColor={{false: colors.switchTrackOff, true: colors.red}}
          thumbColor={colors.switchThumb}
        />
      </View>

      {notice ? (
        <Text
          style={[styles.note, {color: colors.error}]}
          testID="floating-look-notice"
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => void reset()}
        accessibilityRole="button"
        testID="floating-look-reset"
        style={styles.row}
      >
        <Text style={[styles.label, {color: colors.textPrimary}]}>
          Reset look
        </Text>
        <Text style={{color: colors.textSecondary}}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  note: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  preview: {
    height: 140,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 28,
    marginBottom: Spacing.sm,
  },
  previewLine: {
    height: 8,
    borderRadius: 4,
    marginVertical: 6,
    width: '80%',
    alignSelf: 'center',
  },
  previewLineShort: {
    width: '55%',
  },
  previewHandle: {
    position: 'absolute',
    top: '50%',
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewBubble: {
    position: 'absolute',
    top: '50%',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewGlyph: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  choiceBlock: {
    marginBottom: Spacing.sm,
  },
  choiceLabel: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: Spacing.xs,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  choice: {
    minHeight: 40,
    minWidth: 56,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  choiceText: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  swatchTarget: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
  },
  switchRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    flex: 1,
  },
});
