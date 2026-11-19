import React from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Motion} from './introMotion';
import {
  ArrowRightIcon,
  BookIcon,
  CalendarIcon,
  DashedCircle,
  MicIcon,
  Sparkle,
} from './introIcons';
import {ScaledCanvas, useFitScale} from './introLayout';
import {
  IntroColors as C,
  WELCOME_HERO_HEIGHT,
  em,
  introFont,
} from './introTokens';

/** Screen 0 of the introduction: the purple welcome. */
export const IntroWelcome: React.FC<{
  onGetStarted: () => void;
  onHaveAccount?: () => void;
}> = ({onGetStarted, onHaveAccount}) => {
  const insets = useSafeAreaInsets();
  const fit = useFitScale(WELCOME_HERO_HEIGHT);
  return (
    <View
      style={[
        styles.root,
        {paddingTop: insets.top, paddingBottom: insets.bottom},
      ]}
      testID="intro-welcome"
    >
      <StatusBar barStyle="light-content" backgroundColor={C.brand} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        bounces={false}
        showsVerticalScrollIndicator={false}
        onLayout={fit.onRoomLayout}
      >
        <ScaledCanvas height={WELCOME_HERO_HEIGHT} scale={fit.scale}>
          <WelcomeHero />
        </ScaledCanvas>

        <View style={styles.center} onLayout={fit.onOtherLayout('text')}>
          <View
            style={styles.word}
            accessible
            accessibilityRole="header"
            accessibilityLabel="LAFINA"
          >
            {'LAFINA'.split('').map((letter, index) => (
              <Motion
                key={`${letter}${index}`}
                kind="up"
                delay={0.55 + index * 0.07}
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.letter}>{letter}</Text>
              </Motion>
            ))}
          </View>
          <Motion kind="up" delay={1.05}>
            <Text style={styles.tagline}>Your academic AI secretary</Text>
          </Motion>
          <Motion kind="fade" delay={1.3} style={styles.pill}>
            <Text style={styles.pillText}>Made for USTP students</Text>
          </Motion>
        </View>

        <Motion
          kind="up"
          delay={1.45}
          style={styles.footer}
          onLayout={fit.onOtherLayout('footer')}
        >
          <Pressable
            onPress={onGetStarted}
            accessibilityRole="button"
            accessibilityLabel="Get started"
            style={({pressed}) => [styles.primary, pressed && styles.pressed]}
            testID="intro-get-started"
          >
            <Text style={styles.primaryText}>Get started</Text>
            <ArrowRightIcon size={18} color={C.brandDeep} />
          </Pressable>
          {onHaveAccount ? (
            <Pressable
              onPress={onHaveAccount}
              accessibilityRole="button"
              style={({pressed}) => [
                styles.secondary,
                pressed && styles.pressed,
              ]}
              testID="intro-have-account"
            >
              <Text style={styles.secondaryText}>
                I already have an account
              </Text>
            </Pressable>
          ) : null}
        </Motion>
      </ScrollView>
    </View>
  );
};

const ORBIT_ICONS = [
  // Positions are relative to the circle's inner edge in the prototype
  // (inside its 1.5 px border), so 1.5 is added here.
  {key: 'calendar', left: 101.5, top: -18.5, Icon: CalendarIcon},
  {key: 'mic', left: 205.5, top: 161.5, Icon: MicIcon},
  {key: 'book', left: -2.5, top: 161.5, Icon: BookIcon},
];

const TWINKLES = [
  {left: 92, top: 96, size: 16, delay: 0.9},
  {left: 300, top: 112, size: 22, delay: 1.4},
  {left: 320, top: 360, size: 12, delay: 0.4},
  {left: 58, top: 330, size: 14, delay: 1.9},
];

const WelcomeHero: React.FC = () => (
  <View
    style={StyleSheet.absoluteFill}
    importantForAccessibility="no-hide-descendants"
  >
    <Motion kind="fade" delay={0.7} style={styles.orbitBox}>
      <Motion kind="orbit" style={styles.orbit}>
        <View style={StyleSheet.absoluteFill}>
          <DashedCircle size={240} color={C.whiteLine} strokeWidth={1.5} />
        </View>
        {ORBIT_ICONS.map(({key, left, top, Icon}) => (
          <View key={key} style={[styles.orbitSlot, {left, top}]}>
            <Motion kind="orbitRev" style={styles.orbitIcon}>
              <Icon size={18} color={C.white} />
            </Motion>
          </View>
        ))}
      </Motion>
    </Motion>
    <Motion kind="starIn" style={styles.star}>
      <Motion kind="breathe" style={styles.starInner}>
        <Sparkle size={96} color={C.white} />
      </Motion>
    </Motion>
    {TWINKLES.map(({left, top, size, delay}) => (
      <Motion
        key={`${left}-${top}`}
        kind="twinkle"
        delay={delay}
        style={{position: 'absolute', left, top, width: size, height: size}}
      >
        <Sparkle size={size} color={C.white} />
      </Motion>
    ))}
  </View>
);

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.brand},
  flex: {flex: 1},
  content: {flexGrow: 1},
  center: {alignItems: 'center'},
  word: {
    marginTop: 8,
    flexDirection: 'row',
    paddingLeft: em(44, 0.14),
  },
  letter: {
    ...introFont(44, 700),
    color: C.white,
    marginRight: em(44, 0.14),
  },
  tagline: {
    ...introFont(18),
    marginTop: 12,
    color: C.whiteText,
  },
  pill: {
    marginTop: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.whiteSoft,
  },
  pillText: {...introFont(13), color: C.white},
  footer: {
    marginTop: 'auto',
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 8,
  },
  primary: {
    height: 56,
    borderRadius: 18,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryText: {...introFont(17, 600), color: C.brandDeep},
  secondary: {height: 48, alignItems: 'center', justifyContent: 'center'},
  secondaryText: {...introFont(15), color: C.white},
  pressed: {opacity: 0.85},
  orbitBox: {
    position: 'absolute',
    left: 75,
    top: 120,
    width: 240,
    height: 240,
  },
  orbit: {position: 'absolute', left: 0, top: 0, width: 240, height: 240},
  orbitSlot: {position: 'absolute', width: 40, height: 40},
  orbitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.orbitFill,
    borderWidth: 1,
    borderColor: C.whiteLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {position: 'absolute', left: 147, top: 192, width: 96, height: 96},
  starInner: {width: 96, height: 96},
});
