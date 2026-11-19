import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Motion} from './introMotion';
import {BellIcon, Sparkle} from './introIcons';
import {
  IntroColors as C,
  IntroShadows,
  em,
  formatIntroToday,
  introFont,
} from './introTokens';

type Marker = 'now' | 'teal' | 'open';

const ROWS: Array<{
  time: string;
  title: string;
  detail: string;
  marker: Marker;
  delay: number;
  bell?: boolean;
}> = [
  {
    time: '9:00\nAM',
    title: 'Software Engineering',
    detail: 'Room 302 · Class',
    marker: 'now',
    delay: 0.45,
  },
  {
    time: '1:00\nPM',
    title: 'Study block',
    detail: 'Library · Focus time',
    marker: 'teal',
    delay: 0.7,
  },
  {
    time: '6:00\nPM',
    title: 'Assignment reminder',
    detail: 'A gentle nudge, right on time.',
    marker: 'open',
    delay: 0.95,
    bell: true,
  },
];

/** Slide 1 · "Your academic day, organized." */
export const SlideDay: React.FC = () => {
  // Today's real date; read once per showing of the slide.
  const [today] = useState(() => formatIntroToday());
  return (
    <View style={StyleSheet.absoluteFill}>
      <Motion
        kind="fade"
        style={styles.backdrop}
        importantForAccessibility="no-hide-descendants"
      />
      <Motion kind="slideup" style={styles.card}>
        <View style={styles.cardHead}>
          <View>
            <Text style={styles.today}>Today</Text>
            <Text style={styles.date} testID="intro-day-date">
              {today}
            </Text>
          </View>
          <Motion kind="pop" delay={1.4} style={styles.planned}>
            <Sparkle size={12} color={C.brandInk} />
            <Text style={styles.plannedText}>3 planned</Text>
          </Motion>
        </View>
        <View>
          <Motion
            kind="growY"
            delay={0.35}
            style={styles.rail}
            importantForAccessibility="no-hide-descendants"
          />
          {ROWS.map(row => (
            <Motion
              key={row.title}
              kind="up"
              delay={row.delay}
              style={styles.row}
            >
              <Text style={styles.time}>{row.time}</Text>
              <View style={styles.markerBox}>
                {row.marker === 'now' ? (
                  <Motion
                    kind="pulse"
                    style={styles.pulse}
                    importantForAccessibility="no-hide-descendants"
                  />
                ) : null}
                <View style={[styles.marker, markerStyles[row.marker]]} />
              </View>
              <View style={styles.rowText}>
                <View style={styles.titleLine}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  {row.bell ? (
                    <Motion kind="ring" style={styles.bell}>
                      <BellIcon size={16} color={C.brand} />
                    </Motion>
                  ) : null}
                </View>
                <Text style={styles.rowDetail}>{row.detail}</Text>
              </View>
            </Motion>
          ))}
        </View>
      </Motion>

      <Motion kind="slideup" delay={1.8} style={styles.noticeBox}>
        <Motion kind="float" style={styles.notice}>
          <View style={styles.noticeIcon}>
            <Sparkle size={18} color={C.white} />
          </View>
          <View style={styles.noticeText}>
            <Text style={styles.noticeLabel}>LAFINA · now</Text>
            <Text style={styles.noticeBody}>
              Software Engineering in 15 min · Room 302
            </Text>
          </View>
        </Motion>
      </Motion>
    </View>
  );
};

const markerStyles = StyleSheet.create({
  now: {backgroundColor: C.brand},
  teal: {backgroundColor: C.teal},
  open: {backgroundColor: C.white, borderWidth: 2, borderColor: C.brand},
});

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 55,
    top: 40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: C.lavender,
  },
  card: {
    position: 'absolute',
    left: 28,
    top: 16,
    width: 334,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 24,
    boxShadow: IntroShadows.card,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  today: {...introFont(16, 600), color: C.ink},
  date: {...introFont(12), color: C.muted, marginTop: 2},
  planned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: C.lavender,
  },
  plannedText: {...introFont(12, 500), color: C.brandInk},
  rail: {
    position: 'absolute',
    left: 66,
    top: 18,
    bottom: 34,
    width: 2,
    backgroundColor: C.rail,
    transformOrigin: '50% 0%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 10,
  },
  time: {
    ...introFont(13, 500),
    width: 46,
    lineHeight: 16.9,
    color: C.brand,
  },
  markerBox: {
    width: 14,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    left: 2,
    top: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.brand,
  },
  marker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    boxShadow: IntroShadows.halo,
  },
  rowText: {flex: 1, minWidth: 0},
  titleLine: {flexDirection: 'row', alignItems: 'center', gap: 8},
  rowTitle: {...introFont(15, 500), color: C.ink},
  rowDetail: {...introFont(13), color: C.muted, marginTop: 3},
  bell: {width: 16, height: 16, transformOrigin: '50% 8%'},
  noticeBox: {position: 'absolute', left: 44, top: 282, width: 302},
  // Light notification (owner request: not black or dark).
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    boxShadow: IntroShadows.notice,
  },
  noticeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: {flexShrink: 1, minWidth: 0},
  noticeLabel: {
    ...introFont(11),
    color: C.muted,
    letterSpacing: em(11, 0.04),
  },
  noticeBody: {...introFont(13), color: C.ink, marginTop: 2},
});
