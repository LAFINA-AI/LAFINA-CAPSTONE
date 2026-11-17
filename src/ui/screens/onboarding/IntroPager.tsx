import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Fonts} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {getHandbookDemoExcerpt} from '../../../handbook/handbookDemo';
import {
  Card,
  LinkButton,
  Notice,
  OnboardingPage,
  PrimaryButton,
  SlimRow,
  Tag,
  TagRow,
  useAccessibleFallback,
  useOnboardingTokens,
} from './onboardingUi';

/**
 * The introduction (four pages). Demonstrations are illustrations only:
 * they create no records, never use the microphone and ask for no
 * permission. The USTP page quotes the bundled handbook with its real
 * citation and edition, and says the feature needs a completed COR setup.
 */
export interface IntroPagerProps {
  /** 'welcome' before sign-in (auth links shown); 'flow' inside setup. */
  mode: 'welcome' | 'flow';
  /** After choosing scheduling mode, the handbook demo is not offered. */
  schedulingOnly?: boolean;
  initialPage?: number;
  onFinish: () => void;
  onSkip?: () => void;
  onSignIn?: () => void;
  onCreateAccount?: () => void;
  error?: string | null;
}

const PAGE_COUNT = 4;

export const IntroPager: React.FC<IntroPagerProps> = ({
  mode,
  schedulingOnly = false,
  initialPage = 0,
  onFinish,
  onSkip,
  onSignIn,
  onCreateAccount,
  error,
}) => {
  const t = useOnboardingTokens();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const fallback = useAccessibleFallback();
  const [page, setPage] = useState(
    Math.min(Math.max(initialPage, 0), PAGE_COUNT - 1),
  );
  const [showSource, setShowSource] = useState(false);
  const demo = useRef(new Animated.Value(1)).current;
  const excerpt = getHandbookDemoExcerpt();

  useEffect(() => {
    if (reduced) {
      demo.setValue(1);
      return;
    }
    demo.setValue(0);
    const animation = Animated.timing(demo, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [page, reduced, demo]);

  // Android Back mirrors the on-screen back arrow: source page → intro,
  // later page → previous page. On the first page the screen behind decides.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showSource) {
        setShowSource(false);
        return true;
      }
      if (page > 0) {
        setPage(page - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [page, showSource]);

  if (showSource && excerpt && !schedulingOnly) {
    return (
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
            setPage(3);
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
  }

  const next = () => {
    if (page < PAGE_COUNT - 1) setPage(page + 1);
    else onFinish();
  };
  const back = page > 0 ? () => setPage(page - 1) : undefined;
  const last = page === PAGE_COUNT - 1;

  const demos = [
    <View
      key="day"
      style={[styles.demoCard, {backgroundColor: t.paper, borderColor: t.line}]}
    >
      <View style={styles.demoTop}>
        <Text style={[styles.strong, {color: t.ink}]}>
          A little clarity for today
        </Text>
        <Text style={[styles.caption, {color: t.muted}]}>EXAMPLE</Text>
      </View>
      <DemoEvent
        time={'9:00\nAM'}
        title="Software Engineering"
        detail="Room 302 · Class"
      />
      <DemoEvent
        time={'6:00\nPM'}
        title="Assignment reminder"
        detail="A gentle nudge, right on time."
      />
    </View>,
    <View
      key="say"
      style={[styles.demoCard, {backgroundColor: t.paper, borderColor: t.line}]}
    >
      <Text style={[styles.caption, {color: t.muted}]}>
        EXAMPLE · NO MIC NEEDED
      </Text>
      <View style={[styles.bubble, {backgroundColor: t.accent}]}>
        <Text style={[styles.body, {color: t.onAccent}]}>
          Remind me about my assignment tomorrow at 6 PM.
        </Text>
      </View>
      <View style={[styles.created, {borderColor: t.line}]}>
        <Text style={[styles.strong, {color: t.ink}]}>Assignment</Text>
        <Text style={[styles.small, {color: t.muted}]}>
          Tomorrow · 6:00 PM · Reminder preview
        </Text>
      </View>
    </View>,
    schedulingOnly ? (
      <View
        key="gate"
        style={[
          styles.demoCard,
          {backgroundColor: t.paper, borderColor: t.line},
        ]}
      >
        <TagRow>
          <Tag label="Scheduling mode" tone="good" />
        </TagRow>
        <SlimRow label="Calendar, tasks & reminders" value="Available" />
        <SlimRow label="USTP offline handbook" value="Unavailable" />
      </View>
    ) : (
      <View
        key="handbook"
        style={[
          styles.demoCard,
          {backgroundColor: t.paper, borderColor: t.line},
        ]}
      >
        <View style={[styles.bubble, {backgroundColor: t.accent}]}>
          <Text style={[styles.body, {color: t.onAccent}]}>
            {excerpt?.question ?? 'How does the grading system work?'}
          </Text>
        </View>
        <TagRow>
          <Tag label="USTP students · COR setup required" />
        </TagRow>
        {excerpt ? (
          <>
            <Text style={[styles.small, {color: t.ink}]} numberOfLines={4}>
              “{excerpt.quote}”
            </Text>
            <TouchableOpacity
              onPress={() => setShowSource(true)}
              accessibilityRole="button"
              accessibilityLabel={`Open source: ${excerpt.citation}`}
              style={styles.citation}
              testID="intro-handbook-citation"
            >
              <Text
                style={[styles.citationText, {color: t.accent}]}
                numberOfLines={1}
              >
                {excerpt.citation} ↗
              </Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    ),
    <View
      key="local"
      style={[styles.demoCard, {backgroundColor: t.paper, borderColor: t.line}]}
    >
      <Text style={[styles.strong, {color: t.ink}]}>Your next deadline</Text>
      <Text style={[styles.small, {color: t.muted}]}>
        Submit project proposal · Friday · 5:00 PM
      </Text>
      <View style={[styles.seal, {backgroundColor: t.goodSoft}]}>
        <Text style={[styles.small, {color: t.good}]}>
          ✓ Saved on this phone
        </Text>
      </View>
    </View>,
  ];

  const pages = [
    {
      eye: 'Meet your academic AI secretary',
      title: 'Your academic day,\norganized.',
      copy: 'Classes, deadlines, and reminders.\nA little less to keep in your head.',
    },
    {
      eye: 'A simple way to plan',
      title: 'Say it.\nPlan it.',
      copy: 'Type a request or choose to speak.\nLAFINA helps turn it into a plan.',
    },
    schedulingOnly
      ? {
          eye: 'Scheduling mode',
          title: 'Your scheduling\nspace.',
          copy: 'USTP school features are not part of this mode.',
        }
      : {
          eye: 'Your USTP handbook, with you',
          title: 'Ask anything\nabout USTP.',
          copy: 'USTP handbook answers, even offline.\nWith sources you can check.',
        },
    {
      eye: 'Start simple. Stay in control.',
      title: 'Your plans.\nOn your phone.',
      copy:
        mode === 'welcome'
          ? 'Start without an account. Sign in for sync.\nOnline AI features need internet.'
          : 'Saved on this phone first. Sign in to sync.\nOnline AI features need internet.',
    },
  ][page];

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: t.bg,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
      testID={`intro-page-${page}`}
    >
      <View style={styles.top}>
        {back ? (
          <TouchableOpacity
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Previous page"
            style={styles.topButton}
            testID="intro-back"
          >
            <Text style={[styles.topText, {color: t.ink}]}>←</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.brand} accessibilityLabel="LAFINA">
            <Text style={[styles.brandMark, {color: t.accent}]}>✦</Text>
            <Text style={[styles.brandText, {color: t.ink}]}>LAFINA</Text>
          </View>
        )}
        {mode === 'welcome' && onSignIn ? (
          <TouchableOpacity
            onPress={onSignIn}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={styles.topButton}
            testID="intro-sign-in"
          >
            <Text style={[styles.signIn, {color: t.accent}]}>Sign in</Text>
          </TouchableOpacity>
        ) : onSkip ? (
          <TouchableOpacity
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            style={styles.topButton}
            testID="intro-skip"
          >
            <Text style={[styles.skip, {color: t.muted}]}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={[styles.main, fallback && styles.mainFallback]}>
        <Animated.View
          style={[
            styles.demo,
            fallback && styles.demoFallback,
            {
              opacity: demo,
              transform: [
                {
                  translateY: demo.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
          accessibilityLabel="Example preview"
        >
          {demos[page]}
        </Animated.View>
        <Text style={[styles.eyebrow, {color: t.accent}]}>
          {pages.eye.toUpperCase()}
        </Text>
        <Text style={[styles.title, {color: t.ink}]} accessibilityRole="header">
          {pages.title}
        </Text>
        <Text style={[styles.copy, {color: t.muted}]}>{pages.copy}</Text>
        {page === 2 && !schedulingOnly ? (
          <Text style={[styles.small, {color: t.muted}]}>
            Available to USTP students after COR setup.
          </Text>
        ) : null}
        {error ? (
          <Text
            style={[styles.small, {color: t.danger}]}
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <View
          style={styles.dots}
          accessibilityLabel={`Page ${page + 1} of ${PAGE_COUNT}`}
        >
          {Array.from({length: PAGE_COUNT}, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === page && styles.dotActive,
                {backgroundColor: i === page ? t.accent : t.line},
              ]}
            />
          ))}
        </View>
        <PrimaryButton
          action={{
            label:
              last && mode === 'welcome'
                ? 'Continue without an account'
                : 'Continue',
            onPress: next,
            testID: 'intro-continue',
          }}
        />
        {mode === 'welcome' ? (
          last ? (
            onCreateAccount ? (
              <LinkButton
                action={{
                  label: 'Prefer cloud sync?',
                  onPress: onCreateAccount,
                  testID: 'intro-create-account',
                }}
                emphasis="Create an account"
              />
            ) : null
          ) : (
            <LinkButton
              action={{
                label: 'Skip introduction',
                onPress: () => setPage(PAGE_COUNT - 1),
                testID: 'intro-skip',
              }}
            />
          )
        ) : null}
      </View>
    </View>
  );
};

const DemoEvent: React.FC<{time: string; title: string; detail: string}> = ({
  time,
  title,
  detail,
}) => {
  const t = useOnboardingTokens();
  return (
    <View style={[styles.event, {borderColor: t.line}]}>
      <Text style={[styles.eventTime, {color: t.accent}]}>{time}</Text>
      <View style={styles.eventText}>
        <Text style={[styles.strong, {color: t.ink}]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.small, {color: t.muted}]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1},
  top: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topText: {fontSize: 22},
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingLeft: 6,
  },
  brandMark: {fontSize: 16},
  brandText: {
    fontFamily: Fonts.heading,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  skip: {fontFamily: Fonts.body, fontSize: 14},
  signIn: {fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600'},
  main: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  mainFallback: {justifyContent: 'flex-start'},
  demo: {minHeight: 200, justifyContent: 'center', marginBottom: 18},
  demoFallback: {minHeight: 0, marginBottom: 10},
  demoCard: {borderWidth: 1, borderRadius: 20, padding: 14, gap: 9},
  demoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  event: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  eventTime: {
    width: 40,
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '600',
  },
  eventText: {flex: 1},
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  created: {borderWidth: 1, borderRadius: 12, padding: 10, gap: 2},
  citation: {minHeight: 36, justifyContent: 'center'},
  citationText: {fontFamily: Fonts.heading, fontSize: 12, fontWeight: '600'},
  seal: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  eyebrow: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: 8,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '600',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  copy: {fontFamily: Fonts.body, fontSize: 14, lineHeight: 21},
  footer: {paddingHorizontal: 24, paddingTop: 12, gap: 4},
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
    height: 6,
  },
  dot: {width: 6, height: 6, borderRadius: 3},
  dotActive: {width: 22},
  caption: {
    fontFamily: Fonts.heading,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '600',
  },
  strong: {fontFamily: Fonts.heading, fontSize: 14, fontWeight: '600'},
  body: {fontFamily: Fonts.body, fontSize: 14, lineHeight: 20},
  small: {fontFamily: Fonts.body, fontSize: 12, lineHeight: 17},
});
