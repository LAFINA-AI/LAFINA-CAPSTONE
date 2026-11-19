import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {HandbookDemoExcerpt} from '../../../../handbook/handbookDemo';
import {EASE, Motion, useIntroReducedMotion} from './introMotion';
import {ArrowRightIcon, BackIcon, Sparkle} from './introIcons';
import {ScaledCanvas, useFitScale} from './introLayout';
import {
  IntroColors as C,
  IntroShadows,
  SLIDE_STAGE_HEIGHT,
  em,
  introFont,
} from './introTokens';
import {SlideDay} from './SlideDay';
import {SlideSay} from './SlideSay';
import {SlideHandbook} from './SlideHandbook';
import {SlidePhone} from './SlidePhone';

export type SlideNumber = 1 | 2 | 3 | 4;

const COPY: Record<
  SlideNumber,
  {eye: string; title: string; body: string; note?: string}
> = {
  1: {
    eye: 'MEET YOUR ACADEMIC AI SECRETARY',
    title: 'Your academic day, organized.',
    body: 'Classes, deadlines, and reminders. A little less to keep in your head.',
  },
  2: {
    eye: 'A SIMPLE WAY TO PLAN',
    title: 'Say it. Plan it.',
    body: 'Type a request or choose to speak. LAFINA helps turn it into a plan.',
  },
  3: {
    eye: 'YOUR USTP HANDBOOK, WITH YOU',
    title: 'Ask anything about USTP.',
    body: 'Handbook answers, even offline. With sources you can check.',
    note: 'Available to USTP students after COR setup.',
  },
  4: {
    eye: 'START SIMPLE. STAY IN CONTROL.',
    title: 'Your plans. On your phone.',
    body: 'Start without an account. Sign in for sync. Online AI features need internet.',
  },
};

/** Inside setup the student is already signed in. */
const FLOW_LAST_BODY =
  'Saved on this phone first. Sign in to sync. Online AI features need internet.';

export interface IntroSlidesProps {
  screen: SlideNumber;
  mode: 'welcome' | 'flow';
  excerpt: HandbookDemoExcerpt | null;
  error?: string | null;
  errorColor: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onOpenSource: () => void;
  onSignIn?: () => void;
  onCreateAccount?: () => void;
}

/** Screens 1–4 of the introduction. */
export const IntroSlides: React.FC<IntroSlidesProps> = ({
  screen,
  mode,
  excerpt,
  error,
  errorColor,
  onNext,
  onBack,
  onSkip,
  onOpenSource,
  onSignIn,
  onCreateAccount,
}) => {
  const insets = useSafeAreaInsets();
  const fit = useFitScale(SLIDE_STAGE_HEIGHT);
  const last = screen === 4;
  const welcome = mode === 'welcome';
  const copy = COPY[screen];
  const body = last && !welcome ? FLOW_LAST_BODY : copy.body;

  return (
    <View
      style={[
        styles.root,
        {paddingTop: insets.top, paddingBottom: insets.bottom},
      ]}
      testID={`intro-page-${screen}`}
    >
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View style={styles.header}>
        {screen === 1 ? (
          <Motion
            key="brand"
            kind="fade"
            style={styles.brand}
            accessible
            accessibilityLabel="LAFINA"
          >
            <Sparkle size={22} color={C.brand} />
            <Text style={styles.brandText}>LAFINA</Text>
          </Motion>
        ) : (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({pressed}) => [styles.back, pressed && styles.pressedSoft]}
            testID="intro-back"
          >
            <BackIcon size={24} color={C.ink} />
          </Pressable>
        )}
        {welcome && onSignIn ? (
          <Pressable
            onPress={onSignIn}
            accessibilityRole="button"
            style={({pressed}) => [styles.signIn, pressed && styles.pressed]}
            testID="intro-sign-in"
          >
            <Text style={styles.signInText}>Sign in</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        bounces={false}
        showsVerticalScrollIndicator={false}
        onLayout={fit.onRoomLayout}
      >
        <ScaledCanvas
          key={`stage-${screen}`}
          height={SLIDE_STAGE_HEIGHT}
          scale={fit.scale}
          testID="intro-stage"
        >
          {screen === 1 ? <SlideDay /> : null}
          {screen === 2 ? <SlideSay /> : null}
          {screen === 3 ? (
            <SlideHandbook excerpt={excerpt} onOpenSource={onOpenSource} />
          ) : null}
          {screen === 4 ? <SlidePhone /> : null}
        </ScaledCanvas>

        <View
          key={`copy-${screen}`}
          style={styles.copy}
          onLayout={fit.onOtherLayout('copy')}
        >
          <Motion kind="up">
            <Text style={styles.eyebrow}>{copy.eye}</Text>
          </Motion>
          <Motion kind="up" delay={0.08}>
            <Text style={styles.title} accessibilityRole="header">
              {copy.title}
            </Text>
          </Motion>
          <Motion kind="up" delay={0.16}>
            <Text style={styles.body}>{body}</Text>
          </Motion>
          {copy.note ? (
            <Motion kind="up" delay={0.22}>
              <Text style={styles.note}>{copy.note}</Text>
            </Motion>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {error ? (
          <Text
            style={[styles.error, {color: errorColor}]}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Page ${screen} of 4`}
        >
          {[1, 2, 3, 4].map(i => (
            <Dot
              key={i}
              state={i === screen ? 'active' : i < screen ? 'done' : 'todo'}
            />
          ))}
        </View>
        <Pressable
          onPress={onNext}
          accessibilityRole="button"
          style={({pressed}) => [styles.cta, pressed && styles.pressed]}
          testID="intro-continue"
        >
          <Text style={styles.ctaText}>
            {last && welcome ? 'Continue without an account' : 'Continue'}
          </Text>
          <ArrowRightIcon size={18} color={C.white} />
        </Pressable>
        {!last ? (
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            style={({pressed}) => [styles.skip, pressed && styles.pressed]}
            testID="intro-skip"
          >
            <Text style={styles.skipText}>Skip introduction</Text>
          </Pressable>
        ) : welcome && onCreateAccount ? (
          <View style={styles.account}>
            <Text style={styles.skipText}>Prefer cloud sync?</Text>
            <Pressable
              onPress={onCreateAccount}
              accessibilityRole="button"
              hitSlop={{top: 12, bottom: 12, left: 6, right: 6}}
              style={({pressed}) => pressed && styles.pressed}
              testID="intro-create-account"
            >
              <Text style={styles.accountText}>Create an account</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.account} />
        )}
      </View>
    </View>
  );
};

type DotState = 'active' | 'done' | 'todo';
const DOT: Record<DotState, {width: number; color: string}> = {
  active: {width: 28, color: C.brand},
  done: {width: 6, color: C.dotDone},
  todo: {width: 6, color: C.dotTodo},
};

const DOT_TIMING = {
  duration: 350,
  easing: EASE,
  isInteraction: false,
} as const;

/**
 * Progress dot; width and colour transition over .35s ease (CSS
 * `transition`). The colour change is a cross-fade of the new colour over
 * the old one, which is the same as interpolating between them.
 */
const Dot: React.FC<{state: DotState}> = ({state}) => {
  const reduced = useIntroReducedMotion();
  const target = DOT[state];
  const width = useRef(new Animated.Value(target.width)).current;
  // The colour under the fade; becomes the target once the fade ends.
  const [base, setBase] = useState(target.color);

  useEffect(() => {
    if (reduced) {
      width.setValue(target.width);
      return;
    }
    const animation = Animated.timing(width, {
      ...DOT_TIMING,
      toValue: target.width,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, target.width, width]);

  return (
    <Animated.View style={[styles.dot, {width, backgroundColor: base}]}>
      {base !== target.color ? (
        <DotFade
          key={target.color}
          color={target.color}
          reduced={reduced}
          onDone={() => setBase(target.color)}
        />
      ) : null}
    </Animated.View>
  );
};

const DotFade: React.FC<{
  color: string;
  reduced: boolean;
  onDone: () => void;
}> = ({color, reduced, onDone}) => {
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (reduced) {
      done.current();
      return;
    }
    const animation = Animated.timing(opacity, {
      ...DOT_TIMING,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start(({finished}) => {
      if (finished) done.current();
    });
    return () => animation.stop();
  }, [reduced, opacity]);
  return (
    <Animated.View
      style={[styles.dotFade, {backgroundColor: color, opacity}]}
    />
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  flex: {flex: 1},
  content: {flexGrow: 1},
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 12,
  },
  brand: {flexDirection: 'row', alignItems: 'center', gap: 8},
  brandText: {
    ...introFont(20, 700),
    letterSpacing: em(20, 0.08),
    color: C.ink,
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: -12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signIn: {height: 44, paddingHorizontal: 12, justifyContent: 'center'},
  signInText: {...introFont(16, 500), color: C.brand},
  copy: {paddingTop: 10, paddingHorizontal: 28},
  eyebrow: {
    ...introFont(12, 600),
    letterSpacing: em(12, 0.14),
    color: C.brand,
    marginBottom: 12,
  },
  title: {
    ...introFont(34, 600),
    lineHeight: 38.08,
    letterSpacing: em(34, -0.02),
    color: C.ink,
  },
  body: {...introFont(16), lineHeight: 24, color: C.body, marginTop: 14},
  note: {...introFont(13), color: C.muted, marginTop: 6},
  footer: {paddingHorizontal: 24, paddingBottom: 16, gap: 14},
  error: {...introFont(13), lineHeight: 18, textAlign: 'center'},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: 6},
  dot: {height: 6, borderRadius: 3},
  dotFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 3,
  },
  cta: {
    height: 56,
    borderRadius: 18,
    backgroundColor: C.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    boxShadow: IntroShadows.cta,
  },
  ctaText: {...introFont(17, 500), color: C.white},
  skip: {height: 44, alignItems: 'center', justifyContent: 'center'},
  skipText: {...introFont(15), color: C.body},
  account: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  accountText: {...introFont(15, 600), color: C.ink},
  pressed: {opacity: 0.85},
  pressedSoft: {backgroundColor: C.chip},
});
