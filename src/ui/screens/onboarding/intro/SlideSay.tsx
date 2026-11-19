import React from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {EASE, Motion, useKeyframeValue} from './introMotion';
import {
  BellIcon,
  CalendarIcon,
  ClockIcon,
  DrawCheck,
  FileIcon,
  MicIcon,
  Sparkle,
} from './introIcons';
import {IntroColors as C, IntroShadows, em, introFont} from './introTokens';

/**
 * The request appears word by word (class `w`); "tomorrow" and "6 PM" get
 * a highlight sweep (class `hl`). Words sit in a wrapping row so each can
 * fade on its own; the 4 dp column gap stands in for the spaces.
 */
const WORDS: Array<{
  text: string;
  delay: number;
  hl?: number;
  tail?: {text: string; delay: number};
}> = [
  {text: 'Remind', delay: 0.35},
  {text: 'me', delay: 0.45},
  {text: 'about', delay: 0.55},
  {text: 'my', delay: 0.65},
  {text: 'assignment', delay: 0.75},
  {text: 'tomorrow', delay: 0.9, hl: 1.55},
  {text: 'at', delay: 1.0},
  {text: '6 PM', delay: 1.1, hl: 1.75, tail: {text: '.', delay: 1.15}},
];

const BAR_DELAYS = [0, 0.15, 0.3, 0.45, 0.6];

const CHIPS = [
  {label: 'Tomorrow', Icon: CalendarIcon, delay: 2.45},
  {label: '6:00 PM', Icon: ClockIcon, delay: 2.6},
  {label: 'Nudge 1 hr early', Icon: BellIcon, delay: 2.75},
];

const Word: React.FC<{text: string; delay: number}> = ({text, delay}) => (
  <Motion kind="word" delay={delay}>
    <Text style={styles.word}>{text}</Text>
  </Motion>
);

const Highlight: React.FC<{delay: number; children: React.ReactNode}> = ({
  delay,
  children,
}) => {
  const sweep = useKeyframeValue(
    [
      [0, 0],
      [1, 100],
    ],
    {duration: 450, easing: EASE, delay: delay * 1000, native: false},
  );
  return (
    <View style={styles.hl}>
      <Animated.View
        style={[
          styles.hlFill,
          {
            width: sweep.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
      {children}
    </View>
  );
};

/** Slide 2 · "Say it. Plan it." */
export const SlideSay: React.FC = () => (
  <View style={StyleSheet.absoluteFill}>
    <Motion kind="fade" style={styles.eyebrowBox}>
      <Text style={styles.eyebrow}>EXAMPLE · NO MIC NEEDED</Text>
    </Motion>

    <Motion
      kind="pop"
      delay={0.15}
      style={styles.bubble}
      accessible
      accessibilityLabel="Remind me about my assignment tomorrow at 6 PM."
    >
      {WORDS.map(({text, delay, hl, tail}) => {
        const word = <Word text={text} delay={delay} />;
        const unit = hl ? <Highlight delay={hl}>{word}</Highlight> : word;
        return tail ? (
          <View key={text} style={styles.unit}>
            {unit}
            <Word text={tail.text} delay={tail.delay} />
          </View>
        ) : (
          <React.Fragment key={text}>{unit}</React.Fragment>
        );
      })}
    </Motion>

    <Motion kind="up" delay={1.0} style={styles.micBox}>
      <View style={styles.micPill}>
        <View style={styles.micWrap}>
          <Motion
            kind="pulse"
            style={styles.micPulse}
            importantForAccessibility="no-hide-descendants"
          />
          <View style={styles.micCircle}>
            <MicIcon size={16} color={C.brand} />
          </View>
        </View>
        <View
          style={styles.bars}
          importantForAccessibility="no-hide-descendants"
        >
          {BAR_DELAYS.map(delay => (
            <Motion key={delay} kind="bar" delay={delay} style={styles.bar} />
          ))}
        </View>
        <Text style={styles.micText}>or just say it</Text>
      </View>
    </Motion>

    <Motion kind="fade" delay={1.9} style={styles.gotIt}>
      <Motion kind="spin" style={styles.spin}>
        <Sparkle size={14} color={C.brand} />
      </Motion>
      <Text style={styles.gotItText}>Got it</Text>
    </Motion>

    <Motion kind="slideup" delay={2.1} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <FileIcon size={20} color={C.brand} />
        </View>
        <View>
          <Text style={styles.cardTitle}>Assignment</Text>
          <Text style={styles.cardSub}>Reminder preview</Text>
        </View>
      </View>
      <View style={styles.chips}>
        {CHIPS.map(({label, Icon, delay}) => (
          <Motion key={label} kind="pop" delay={delay} style={styles.chip}>
            <Icon size={14} color={C.brand} />
            <Text style={styles.chipText}>{label}</Text>
          </Motion>
        ))}
      </View>
      <View style={styles.added}>
        <Motion kind="pop" delay={3.0} style={styles.addedIcon}>
          <DrawCheck size={14} color={C.white} delay={3.2} />
        </Motion>
        <Motion kind="fade" delay={3.1}>
          <Text style={styles.addedText}>Added to your plan</Text>
        </Motion>
      </View>
    </Motion>
  </View>
);

const styles = StyleSheet.create({
  eyebrowBox: {position: 'absolute', left: 28, top: 0},
  eyebrow: {
    ...introFont(11, 600),
    letterSpacing: em(11, 0.14),
    color: C.muted,
  },
  bubble: {
    position: 'absolute',
    right: 28,
    top: 26,
    width: 290,
    backgroundColor: C.brand,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 4,
    transformOrigin: '100% 100%',
  },
  word: {...introFont(16), lineHeight: 24, color: C.white},
  unit: {flexDirection: 'row'},
  hl: {
    borderRadius: 6,
    overflow: 'hidden',
    paddingHorizontal: 3,
    marginHorizontal: -3,
  },
  hlFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: C.highlight,
  },
  micBox: {position: 'absolute', left: 28, top: 118},
  micPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
  },
  micWrap: {width: 32, height: 32},
  micPulse: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.lilac,
  },
  micCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {flexDirection: 'row', alignItems: 'center', gap: 3, height: 18},
  bar: {width: 3, height: 18, borderRadius: 2, backgroundColor: C.brand},
  micText: {...introFont(13), color: C.muted},
  gotIt: {
    position: 'absolute',
    right: 28,
    top: 128,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spin: {width: 14, height: 14},
  gotItText: {...introFont(13, 500), color: C.brandInk},
  card: {
    position: 'absolute',
    left: 28,
    top: 170,
    width: 334,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 22,
    boxShadow: IntroShadows.card,
    padding: 16,
  },
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: 12},
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {...introFont(17, 600), color: C.ink},
  cardSub: {...introFont(12), color: C.muted, marginTop: 2},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.chip,
  },
  chipText: {...introFont(13), color: C.ink},
  added: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  addedIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedText: {...introFont(13, 500), color: C.greenInk},
});
