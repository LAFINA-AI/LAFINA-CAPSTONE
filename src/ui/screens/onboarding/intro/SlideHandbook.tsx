import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {HandbookDemoExcerpt} from '../../../../handbook/handbookDemo';
import {HANDBOOK_DEMO_QUESTION} from '../../../../handbook/handbookDemo';
import {Motion} from './introMotion';
import {ExternalIcon, WifiOffIcon} from './introIcons';
import {IntroColors as C, IntroShadows, em, introFont} from './introTokens';

const LINES: Array<number | 'hl'> = [100, 84, 92, 'hl', 96, 80, 60];

/**
 * Slide 3 · "Ask anything about USTP." The quote and citation come from the
 * handbook bundled with the app, never invented text.
 */
export const SlideHandbook: React.FC<{
  excerpt: HandbookDemoExcerpt | null;
  onOpenSource: () => void;
}> = ({excerpt, onOpenSource}) => (
  <View style={StyleSheet.absoluteFill}>
    <Motion
      kind="fade"
      delay={0.05}
      style={styles.docBox}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.docShadow}>
        <View style={styles.doc}>
          <View style={styles.docHead}>
            <Text style={styles.docBrand}>USTP</Text>
            <Text style={styles.docTitle}>Student Handbook</Text>
          </View>
          <View style={styles.docLines}>
            {LINES.map((line, index) =>
              line === 'hl' ? (
                <View key={index} style={[styles.docLine, {width: '76%'}]}>
                  <Motion kind="growX" delay={1.1} style={styles.docMark} />
                </View>
              ) : (
                <View
                  key={index}
                  style={[styles.docLine, {width: `${line}%`}]}
                />
              ),
            )}
          </View>
          <Motion kind="scan" style={styles.scan} />
        </View>
      </View>
    </Motion>

    <Motion kind="pop" delay={0.45} style={styles.bubble}>
      <Text style={styles.bubbleText}>
        {excerpt?.question ?? HANDBOOK_DEMO_QUESTION}
      </Text>
    </Motion>

    <Motion kind="slideup" delay={1.3} style={styles.card}>
      <Text style={styles.tag}>USTP students · COR setup required</Text>
      {excerpt ? (
        <>
          <Motion kind="fade" delay={1.6}>
            <Text style={styles.quote}>“{excerpt.quote}”</Text>
          </Motion>
          <Motion kind="fade" delay={1.9} style={styles.citationBox}>
            <Pressable
              onPress={onOpenSource}
              accessibilityRole="button"
              accessibilityLabel={`Open source: ${excerpt.citation}`}
              hitSlop={{top: 12, bottom: 12, left: 8, right: 8}}
              style={({pressed}) => [
                styles.citation,
                pressed && styles.pressed,
              ]}
              testID="intro-handbook-citation"
            >
              <Text style={styles.citationText}>{excerpt.citation}</Text>
              <ExternalIcon size={13} color={C.brand} />
            </Pressable>
          </Motion>
        </>
      ) : null}
    </Motion>

    <Motion kind="pop" delay={2.3} style={styles.offlineBox}>
      <Motion kind="float" style={styles.offline}>
        <WifiOffIcon size={14} color={C.white} />
        <Text style={styles.offlineText}>Works offline</Text>
      </Motion>
    </Motion>
  </View>
);

const styles = StyleSheet.create({
  docBox: {position: 'absolute', left: 30, top: 10},
  docShadow: {
    width: 150,
    height: 180,
    borderRadius: 14,
    transform: [{rotate: '-6deg'}],
    boxShadow: IntroShadows.doc,
  },
  doc: {
    flex: 1,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    overflow: 'hidden',
  },
  docHead: {
    height: 40,
    backgroundColor: C.lavender,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  docBrand: {
    ...introFont(11, 700),
    color: C.brandInk,
    letterSpacing: em(11, 0.08),
  },
  docTitle: {...introFont(10), color: C.brandInk},
  docLines: {paddingVertical: 10, paddingHorizontal: 12, gap: 9},
  docLine: {height: 6, borderRadius: 3, backgroundColor: C.line},
  docMark: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 5,
    backgroundColor: C.lilac,
    transformOrigin: '0% 50%',
  },
  // top: 44 inside the 1 px border in the prototype → 43 from the border box.
  scan: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 43,
    height: 2,
    backgroundColor: C.brand,
    boxShadow: IntroShadows.scan,
  },
  bubble: {
    position: 'absolute',
    right: 28,
    top: 34,
    width: 200,
    backgroundColor: C.brand,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 16,
    transformOrigin: '100% 100%',
  },
  bubbleText: {...introFont(15), lineHeight: 21.75, color: C.white},
  card: {
    position: 'absolute',
    left: 28,
    top: 150,
    width: 334,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 22,
    boxShadow: IntroShadows.cardStrong,
    padding: 16,
  },
  tag: {
    ...introFont(12, 500),
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: C.lavender,
    color: C.brandInk,
  },
  quote: {...introFont(14), lineHeight: 21, color: C.ink, marginTop: 10},
  citationBox: {marginTop: 10, alignSelf: 'flex-start'},
  citation: {flexDirection: 'row', alignItems: 'center', gap: 4},
  citationText: {...introFont(13, 500), color: C.brand},
  pressed: {opacity: 0.7},
  offlineBox: {position: 'absolute', right: 18, top: 134},
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.ink,
    boxShadow: IntroShadows.darkPill,
  },
  offlineText: {...introFont(12, 500), color: C.white},
});
