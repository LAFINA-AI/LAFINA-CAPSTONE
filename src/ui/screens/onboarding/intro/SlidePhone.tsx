import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Motion} from './introMotion';
import {
  CheckIcon,
  CloudIcon,
  DashedCircle,
  DrawCheck,
  MarchingPath,
  ShieldIcon,
} from './introIcons';
import {
  IntroColors as C,
  IntroShadows,
  FRAME_WIDTH,
  SLIDE_STAGE_HEIGHT,
  introDeadlineWeekday,
  introFont,
} from './introTokens';

const SKELETON = [
  {width: '60%', color: C.line},
  {width: '85%', color: C.chip},
  {width: '70%', color: C.chip},
] as const;

/** Slide 4 · "Your plans. On your phone." */
export const SlidePhone: React.FC = () => {
  // The sample deadline is relative to today (two days ahead).
  const [weekday] = useState(() => introDeadlineWeekday());
  return (
    <View style={StyleSheet.absoluteFill}>
      <Motion
        kind="fade"
        style={styles.backdrop}
        importantForAccessibility="no-hide-descendants"
      />
      <Motion
        kind="fade"
        delay={1.8}
        style={styles.link}
        importantForAccessibility="no-hide-descendants"
      >
        <MarchingPath
          d="M277 104 C 318 104 344 104 344 88"
          color={C.march}
          width={FRAME_WIDTH}
          height={SLIDE_STAGE_HEIGHT}
        />
      </Motion>

      <Motion
        kind="fade"
        style={styles.phone}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.notch} />
        <View style={styles.skeleton}>
          {SKELETON.map(line => (
            <View
              key={line.width}
              style={[
                styles.skeletonLine,
                {width: line.width, backgroundColor: line.color},
              ]}
            />
          ))}
        </View>
      </Motion>

      <Motion kind="drop" delay={0.35} style={styles.cardBox}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your next deadline</Text>
          <Text style={styles.cardBody}>
            {`Submit project proposal · ${weekday} · 5:00 PM`}
          </Text>
          <View style={styles.saved}>
            <DrawCheck size={14} color={C.greenInk} delay={1.05} />
            <Motion kind="fade" delay={1.0}>
              <Text style={styles.savedText}>Saved on this phone</Text>
            </Motion>
          </View>
        </View>
      </Motion>

      <Motion kind="pop" delay={1.4} style={styles.shieldBox}>
        <Motion
          kind="pulse"
          delay={1.9}
          style={styles.shieldPulse}
          importantForAccessibility="no-hide-descendants"
        />
        <View
          style={styles.shield}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Private to you"
        >
          <ShieldIcon size={22} color={C.white} />
        </View>
      </Motion>

      <Motion kind="fade" delay={1.8} style={styles.cloudBox}>
        <View style={styles.cloud}>
          <View style={StyleSheet.absoluteFill}>
            <DashedCircle
              size={56}
              color={C.dashed}
              strokeWidth={1.5}
              fill={C.paper}
            />
          </View>
          <CloudIcon size={24} color={C.cloud} />
        </View>
      </Motion>
      <Motion kind="fade" delay={1.9} style={styles.syncBox}>
        <Text style={styles.syncText}>Sync is optional</Text>
      </Motion>

      <Motion kind="pop" delay={2.1} style={styles.noSignupBox}>
        <Motion kind="float" style={styles.noSignup}>
          <CheckIcon size={13} color={C.green} />
          <Text style={styles.noSignupText}>No sign-up needed</Text>
        </Motion>
      </Motion>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 65,
    top: 40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: C.lavender,
  },
  link: {position: 'absolute', left: 0, top: 0},
  phone: {
    position: 'absolute',
    left: 115,
    top: 12,
    width: 160,
    height: 300,
    borderRadius: 32,
    backgroundColor: C.paper,
    borderWidth: 1.5,
    borderColor: C.phoneEdge,
    boxShadow: IntroShadows.phone,
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  notch: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.line,
    alignSelf: 'center',
    marginBottom: 18,
  },
  skeleton: {gap: 8},
  skeletonLine: {height: 8, borderRadius: 4},
  cardBox: {position: 'absolute', left: 55, top: 112, width: 280},
  card: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    boxShadow: IntroShadows.drop,
    padding: 16,
  },
  cardTitle: {...introFont(15, 600), color: C.ink},
  cardBody: {
    ...introFont(13),
    color: C.muted,
    marginTop: 6,
    lineHeight: 18.85,
  },
  saved: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: C.greenSoft,
  },
  savedText: {...introFont(13, 500), color: C.greenInk},
  shieldBox: {
    position: 'absolute',
    left: 171,
    top: 270,
    width: 48,
    height: 48,
  },
  shieldPulse: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.lilac,
  },
  shield: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.brand,
    borderWidth: 3,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudBox: {
    position: 'absolute',
    right: 18,
    top: 24,
    width: 56,
    alignItems: 'center',
  },
  cloud: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBox: {position: 'absolute', right: 8, top: 86, width: 76},
  syncText: {
    ...introFont(11),
    lineHeight: 14.3,
    color: C.muted,
    textAlign: 'center',
  },
  noSignupBox: {position: 'absolute', left: 18, top: 52},
  noSignup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    boxShadow: IntroShadows.lightPill,
  },
  noSignupText: {...introFont(12, 500), color: C.ink},
});
