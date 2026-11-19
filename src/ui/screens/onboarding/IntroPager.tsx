import React, {useEffect, useState} from 'react';
import {BackHandler, StyleSheet, Text} from 'react-native';
import {Fonts} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {getHandbookDemoExcerpt} from '../../../handbook/handbookDemo';
import {
  Card,
  Notice,
  OnboardingPage,
  useOnboardingTokens,
} from './onboardingUi';
import {ReducedMotionContext} from './intro/introMotion';
import {IntroWelcome} from './intro/IntroWelcome';
import {IntroSlides} from './intro/IntroSlides';
import type {SlideNumber} from './intro/IntroSlides';

/**
 * The introduction, built from docs/design/onboarding/LAFINA Introduction.html:
 * a welcome (screen 0, before sign-in only) and four slides. The slides'
 * demonstrations are illustrations only: they create no records, never use
 * the microphone and ask for no permission. The USTP slide quotes the
 * bundled handbook with its real citation and edition.
 *
 * Navigation follows the prototype: Get started → 1, Continue → next,
 * Back → previous (never before 1), Skip → 4. In the setup flow (already
 * signed in) there is no welcome and Skip finishes the introduction.
 */
export interface IntroPagerProps {
  /** 'welcome' before sign-in (welcome + auth links); 'flow' inside setup. */
  mode: 'welcome' | 'flow';
  onFinish: () => void;
  onSkip?: () => void;
  onSignIn?: () => void;
  onCreateAccount?: () => void;
  error?: string | null;
}

type Screen = 0 | SlideNumber;

export const IntroPager: React.FC<IntroPagerProps> = ({
  mode,
  onFinish,
  onSkip,
  onSignIn,
  onCreateAccount,
  error,
}) => {
  const t = useOnboardingTokens();
  const reduced = useReducedMotion();
  const welcome = mode === 'welcome';
  const [screen, setScreen] = useState<Screen>(welcome ? 0 : 1);
  const [showSource, setShowSource] = useState(false);
  const [excerpt] = useState(getHandbookDemoExcerpt);

  // Android Back: source view → slide; slide → previous slide; the first
  // slide → welcome (before sign-in). Otherwise the screen behind decides.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSource) {
        setShowSource(false);
        return true;
      }
      if (screen > 1) {
        setScreen((screen - 1) as Screen);
        return true;
      }
      if (screen === 1 && welcome) {
        setScreen(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen, showSource, welcome]);

  let content: React.ReactNode;
  if (showSource && excerpt) {
    content = (
      <OnboardingPage
        pageKey="intro-source"
        headLabel="Handbook source"
        onBack={() => setShowSource(false)}
        title="A source you can check."
        copy={excerpt.edition}
        primary={{
          label: 'Back to introduction',
          onPress: () => setShowSource(false),
          testID: 'intro-source-back',
        }}
        secondary={{
          label: 'Continue introduction',
          onPress: () => {
            setShowSource(false);
            setScreen(4);
          },
        }}
      >
        <Card testID="intro-source-excerpt">
          <Text style={[styles.caption, {color: t.muted}]}>
            {`${excerpt.chapter} · ${excerpt.pageLabel}`.toUpperCase()}
          </Text>
          <Text style={[styles.strong, {color: t.ink}]}>{excerpt.section}</Text>
          <Text style={[styles.body, {color: t.ink}]}>“{excerpt.quote}”</Text>
        </Card>
        <Notice text="Quoted from the handbook bundled with LAFINA. Check newer university notices for updates." />
      </OnboardingPage>
    );
  } else if (screen === 0) {
    content = (
      <IntroWelcome
        onGetStarted={() => setScreen(1)}
        onHaveAccount={onSignIn}
      />
    );
  } else {
    content = (
      <IntroSlides
        screen={screen}
        mode={mode}
        excerpt={excerpt}
        error={error}
        errorColor={t.danger}
        onNext={() =>
          screen < 4 ? setScreen((screen + 1) as Screen) : onFinish()
        }
        onBack={() => setScreen(Math.max(1, screen - 1) as Screen)}
        onSkip={() => (welcome ? setScreen(4) : (onSkip ?? onFinish)())}
        onOpenSource={() => setShowSource(true)}
        onSignIn={onSignIn}
        onCreateAccount={onCreateAccount}
      />
    );
  }

  return (
    <ReducedMotionContext.Provider value={reduced}>
      {content}
    </ReducedMotionContext.Provider>
  );
};

const styles = StyleSheet.create({
  caption: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
  strong: {fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600'},
  body: {fontFamily: Fonts.body, fontSize: 14, lineHeight: 20},
});
