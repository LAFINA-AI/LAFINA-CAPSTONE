import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path, Rect} from 'react-native-svg';
import {
  AlarmClock,
  CalendarDays,
  Check,
  CheckSquare,
  FileText,
  House,
  Layers,
  Phone,
  Sparkles,
  User,
  X,
} from 'lucide-react-native';
import {Fonts, Layout, ModernLayout, Shadows} from '../theme';
import {useTheme} from '../contexts/ThemeContext';
import {useThemedStyles} from '../theme/createThemedStyles';
import type {ThemeColors} from '../contexts/ThemeContext';
import {useReducedMotion} from '../hooks/useReducedMotion';
import type {TabType} from '../components/CustomTabBar';
import type {TourAnchor, TourStep} from './tourSteps';
import {measureInWindow, measureTourTarget} from './tourTargets';
import type {ScreenRect} from './tourTargets';

interface ProductTourProps {
  steps: TourStep[];
  onNavigate: (tab: TabType) => void;
  onStepChange?: (step: TourStep, index: number) => void;
  onFinish: (completed: boolean) => void;
  /** Shown before the step count, e.g. "Walkthrough". */
  label?: string;
}

const PADDING = 6;
const RADIUS = 16;
const GAP = 14;
const MARGIN = 16;
const EDGE_PAD = 4;
const RETRY_DELAYS_MS = [60, 140, 240] as const;
export const MOVE_MS = 260;

const CHAPTER_LABELS: Record<TabType, string> = {
  dashboard: 'Home',
  calendar: 'Schedule',
  chat: 'AI',
  notes: 'Tools',
  profile: 'Profile',
};

export const spotlightPath = (
  width: number,
  height: number,
  hole: ScreenRect | null,
): string => {
  const outer = `M0 0H${width}V${height}H0Z`;
  if (!hole) return outer;
  const {x, y, width: w, height: h} = hole;
  const r = Math.max(0, Math.min(RADIUS, w / 2, h / 2));
  return (
    `${outer}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}` +
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
};

export const computeCardLayout = (
  hole: ScreenRect | null,
  area: {width: number; height: number},
  cardHeight: number,
  bottomMargin: number = MARGIN,
): {top: number; maxHeight: number} => {
  const safeHeight = Math.max(240, area.height || 640);
  const fullRoom = Math.max(200, safeHeight - MARGIN - bottomMargin);
  if (!hole) {
    const capped = Math.min(cardHeight, fullRoom);
    const centered = MARGIN + Math.max(0, (fullRoom - capped) / 2);
    return {
      top: Math.max(
        MARGIN,
        Math.min(safeHeight - bottomMargin - capped, centered),
      ),
      maxHeight: fullRoom,
    };
  }
  const spaceBelow = safeHeight - bottomMargin - (hole.y + hole.height + GAP);
  const spaceAbove = hole.y - GAP - MARGIN;
  const useBelow = spaceBelow >= cardHeight || spaceBelow >= spaceAbove;
  const available = Math.min(fullRoom, useBelow ? spaceBelow : spaceAbove);
  const room = Math.min(fullRoom, Math.max(120, available));
  const usedHeight = Math.min(cardHeight, room);
  const rawTop = useBelow
    ? hole.y + hole.height + GAP
    : hole.y - GAP - usedHeight;
  const highest = Math.max(MARGIN, safeHeight - bottomMargin - usedHeight);
  return {
    top: Math.min(highest, Math.max(MARGIN, rawTop)),
    maxHeight: room,
  };
};

export const placeCard = (
  hole: ScreenRect | null,
  area: {width: number; height: number},
  cardHeight: number,
  bottomMargin: number = MARGIN,
): number => computeCardLayout(hole, area, cardHeight, bottomMargin).top;

const lerp = (from: ScreenRect, to: ScreenRect, t: number): ScreenRect => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  width: from.width + (to.width - from.width) * t,
  height: from.height + (to.height - from.height) * t,
});

const SCROLLABLE_ANCHORS = new Set<TourAnchor>([
  'home-actions',
  'profile-floating-row',
]);

const sameRect = (a: ScreenRect, b: ScreenRect): boolean =>
  Math.abs(a.x - b.x) < 2 &&
  Math.abs(a.y - b.y) < 2 &&
  Math.abs(a.width - b.width) < 2 &&
  Math.abs(a.height - b.height) < 2;

const isVisibleInArea = (
  target: ScreenRect,
  origin: ScreenRect,
  area: {width: number; height: number},
  bottomClearance: number = 0,
): boolean => {
  if (area.width <= 0 || area.height <= 0) return false;
  const rx = target.x - origin.x;
  const ry = target.y - origin.y;
  const maxBottom =
    bottomClearance > 0 ? area.height - bottomClearance : area.height + 6;
  return (
    rx + target.width > 0 &&
    rx < area.width &&
    ry >= -4 &&
    ry + target.height <= maxBottom
  );
};

const toSpotlightHole = (
  target: ScreenRect,
  origin: ScreenRect,
  area: {width: number; height: number},
): ScreenRect => {
  const rawX = target.x - origin.x - PADDING;
  const rawY = target.y - origin.y - PADDING;
  const rawW = target.width + PADDING * 2;
  const rawH = target.height + PADDING * 2;
  const x = Math.max(EDGE_PAD, rawX);
  const y = Math.max(EDGE_PAD, rawY);
  const maxW = Math.max(12, area.width - EDGE_PAD - x);
  const maxH = Math.max(12, area.height - EDGE_PAD - y);
  return {
    x,
    y,
    width: Math.min(rawW - (x - rawX), maxW),
    height: Math.min(rawH - (y - rawY), maxH),
  };
};

const renderStepIcon = (step: TourStep, color: string) => {
  if (step.id.includes('calls')) return <Phone size={15} color={color} />;
  if (step.notesSubTab === 'alarms')
    return <AlarmClock size={15} color={color} />;
  if (step.notesSubTab === 'todo')
    return <CheckSquare size={15} color={color} />;
  if (step.notesSubTab === 'notes') return <FileText size={15} color={color} />;
  if (step.id.includes('floating')) return <Layers size={15} color={color} />;

  const section = step.section ?? step.tab;
  switch (section) {
    case 'dashboard':
      return <House size={15} color={color} />;
    case 'calendar':
      return <CalendarDays size={15} color={color} />;
    case 'chat':
      return <Sparkles size={15} color={color} />;
    case 'notes':
      return <FileText size={15} color={color} />;
    case 'profile':
      return <User size={15} color={color} />;
    default:
      return <Sparkles size={15} color={color} />;
  }
};

export const ProductTour: React.FC<ProductTourProps> = ({
  steps,
  onNavigate,
  onStepChange,
  onFinish,
  label,
}) => {
  const {colors, isDarkMode, isModern, modernPalette, modernShadows} =
    useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [area, setArea] = useState({width: 0, height: 0});
  const [hole, setHole] = useState<ScreenRect | null>(null);
  const [cardHeight, setCardHeight] = useState(280);

  const containerRef = useRef<View>(null);
  const shownHole = useRef<ScreenRect | null>(null);
  const move = useRef(new Animated.Value(1)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const safeIndex = Math.max(0, Math.min(index, Math.max(0, steps.length - 1)));
  const step = steps[safeIndex];
  const isLast = safeIndex >= steps.length - 1;
  const bottomMargin = Math.max(MARGIN, insets.bottom + 12);
  const tabClearance = Math.max(insets.bottom, 12) + 74;
  const accentColor = isModern ? modernPalette.accent : colors.blue;
  const softAccentBg = isModern
    ? modernPalette.softViolet
    : colors.blue + (isDarkMode ? '28' : '14');
  const surfaceBg = isModern ? modernPalette.surface : colors.inputBg;

  const chapters = useMemo(() => {
    const seen = new Set<TabType>();
    const list: Array<{tab: TabType; label: string; firstIndex: number}> = [];
    steps.forEach((item, idx) => {
      const tab = item.section ?? item.tab;
      if (!tab || seen.has(tab)) return;
      seen.add(tab);
      list.push({
        tab,
        label: item.sectionLabel ?? CHAPTER_LABELS[tab],
        firstIndex: idx,
      });
    });
    return list;
  }, [steps]);

  const activeChapterTab = step ? step.section ?? step.tab : undefined;

  const showHole = useCallback((next: ScreenRect | null) => {
    shownHole.current = next;
    setHole(next);
  }, []);

  const moveHole = useCallback(
    (next: ScreenRect | null) => {
      const from = shownHole.current;
      move.stopAnimation();
      move.removeAllListeners();
      if (!from || !next || reduceMotion) {
        showHole(next);
        return;
      }
      move.setValue(0);
      move.addListener(({value}) => showHole(lerp(from, next, value)));
      Animated.timing(move, {
        toValue: 1,
        duration: MOVE_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
        isInteraction: false,
      }).start(() => {
        move.removeAllListeners();
        showHole(next);
      });
    },
    [move, reduceMotion, showHole],
  );

  useEffect(() => () => move.removeAllListeners(), [move]);

  // Synchronize active tab and screen sub-state whenever the step changes.
  useEffect(() => {
    if (!step) return;
    if (step.tab) onNavigate(step.tab);
    onStepChange?.(step, safeIndex);
  }, [step, safeIndex, onNavigate, onStepChange]);

  // Measure target anchor (retrying briefly while newly visited tabs/scroll views settle).
  useEffect(() => {
    if (!step || area.width <= 0 || area.height <= 0) return undefined;
    let cancelled = false;
    let second = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const tryResolveAnchor = async (
      anchor: TourAnchor | undefined,
      origin: ScreenRect,
    ) => {
      if (!anchor) return null;
      const target = await measureTourTarget(anchor);
      const clearance = SCROLLABLE_ANCHORS.has(anchor) ? tabClearance : 0;
      if (!target || !isVisibleInArea(target, origin, area, clearance)) {
        return null;
      }
      return toSpotlightHole(target, origin, area);
    };

    const measureAttempt = async (attempt: number): Promise<void> => {
      if (cancelled) return;
      const origin = await measureInWindow(containerRef.current);
      if (cancelled) return;
      if (!origin) {
        moveHole(null);
        return;
      }
      const primaryHole = await tryResolveAnchor(step.anchor, origin);
      if (cancelled) return;
      if (primaryHole || !step.anchor) {
        moveHole(primaryHole);
        if (primaryHole && step.anchor && SCROLLABLE_ANCHORS.has(step.anchor)) {
          const anchor = step.anchor;
          settleTimer = setTimeout(() => {
            void (async () => {
              if (cancelled) return;
              const settledOrigin = await measureInWindow(containerRef.current);
              if (cancelled || !settledOrigin) return;
              const settledHole = await tryResolveAnchor(anchor, settledOrigin);
              if (
                !cancelled &&
                settledHole &&
                !sameRect(settledHole, primaryHole)
              ) {
                moveHole(settledHole);
              }
            })();
          }, 120);
        }
        return;
      }
      if (attempt < RETRY_DELAYS_MS.length) {
        timer = setTimeout(() => {
          void measureAttempt(attempt + 1);
        }, RETRY_DELAYS_MS[attempt]);
        return;
      }
      const fallbackHole = await tryResolveAnchor(step.fallbackAnchor, origin);
      if (!cancelled) moveHole(fallbackHole);
    };

    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        void measureAttempt(0);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      if (timer) clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [step, area, moveHole, tabClearance]);

  useEffect(() => {
    cardOpacity.stopAnimation();
    cardOpacity.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  }, [safeIndex, cardOpacity, reduceMotion]);

  const close = useCallback(
    (completed: boolean) => onFinish(completed),
    [onFinish],
  );
  const back = useCallback(
    () => setIndex(current => Math.max(0, current - 1)),
    [],
  );
  const next = useCallback(() => {
    if (safeIndex >= steps.length - 1) close(true);
    else setIndex(safeIndex + 1);
  }, [safeIndex, steps.length, close]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (safeIndex > 0) back();
        else close(false);
        return true;
      },
    );
    return () => subscription.remove();
  }, [safeIndex, back, close]);

  if (!step) return null;

  const {top: cardTop, maxHeight: cardMaxHeight} = computeCardLayout(
    hole,
    area,
    cardHeight,
    bottomMargin,
  );
  const progressRatio = steps.length > 0 ? (safeIndex + 1) / steps.length : 1;

  return (
    <View
      ref={containerRef}
      style={styles.root}
      onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        setArea(current =>
          current.width === width && current.height === height
            ? current
            : {width, height},
        );
      }}
      accessibilityViewIsModal
      testID="product-tour"
    >
      {area.width > 0 && (
        <Svg
          width={area.width}
          height={area.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path
            d={spotlightPath(area.width, area.height, hole)}
            fill={colors.overlay}
            fillRule="evenodd"
          />
          {hole && (
            <Rect
              x={hole.x}
              y={hole.y}
              width={hole.width}
              height={hole.height}
              rx={Math.min(RADIUS, hole.width / 2, hole.height / 2)}
              fill="none"
              stroke={isModern ? modernPalette.accent : colors.white}
              strokeOpacity={0.9}
              strokeWidth={2}
            />
          )}
        </Svg>
      )}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => undefined}
        accessible={false}
      />

      <Animated.View
        style={[
          styles.card,
          isModern ? modernShadows.floating : Shadows.micButton,
          themed.card,
          isModern && {
            borderRadius: ModernLayout.borderRadiusCard,
            borderWidth: 1,
            borderColor: modernPalette.border,
          },
          !isModern && {
            borderWidth: 1,
            borderColor: colors.border,
          },
          {top: cardTop, maxHeight: cardMaxHeight, opacity: cardOpacity},
        ]}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          if (Math.abs(height - cardHeight) > 2) setCardHeight(height);
        }}
        accessibilityLiveRegion="polite"
      >
        <View
          style={[styles.progressTrack, {backgroundColor: surfaceBg}]}
          testID="product-tour-progress"
        >
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: accentColor,
                width: `${Math.round(progressRatio * 100)}%`,
              },
            ]}
          />
        </View>

        <View style={styles.head}>
          <View style={[styles.iconBadge, {backgroundColor: softAccentBg}]}>
            {renderStepIcon(step, accentColor)}
          </View>
          <Text
            style={[styles.stepCount, themed.muted, {color: accentColor}]}
            numberOfLines={1}
          >
            {label ? `${label.toUpperCase()} · ` : ''}
            {safeIndex + 1} of {steps.length}
          </Text>
          <TouchableOpacity
            onPress={() => close(false)}
            style={styles.closeButton}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            accessibilityRole="button"
            accessibilityLabel="Skip the walkthrough"
            testID="product-tour-close"
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {chapters.length >= 2 && (
          <View
            style={styles.chaptersRow}
            accessibilityRole="tablist"
            testID="product-tour-chapters"
          >
            {chapters.map(chapter => {
              const active = activeChapterTab === chapter.tab;
              return (
                <TouchableOpacity
                  key={chapter.tab}
                  onPress={() => setIndex(chapter.firstIndex)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{selected: active}}
                  accessibilityLabel={`Jump to ${chapter.label}`}
                  testID={`product-tour-chapter-${chapter.tab}`}
                  style={[
                    styles.chapterChip,
                    {
                      backgroundColor: active ? softAccentBg : surfaceBg,
                      borderColor: active ? accentColor : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chapterText,
                      {color: active ? accentColor : colors.textSecondary},
                      active && styles.chapterTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {chapter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={[styles.title, themed.title]} accessibilityRole="header">
          {step.title}
        </Text>

        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.body, themed.body]}>{step.body}</Text>

          {step.highlights && step.highlights.length > 0 && (
            <View style={styles.highlightsList}>
              {step.highlights.map(item => (
                <View
                  key={item.label}
                  style={[
                    styles.highlightItem,
                    {
                      backgroundColor: surfaceBg,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.highlightBullet,
                      {backgroundColor: softAccentBg},
                    ]}
                  >
                    <Check size={11} color={accentColor} strokeWidth={3} />
                  </View>
                  <View style={styles.highlightCopy}>
                    <Text style={[styles.highlightLabel, themed.title]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.highlightDetail, themed.body]}>
                      {item.detail}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {step.tip ? (
            <View
              style={[
                styles.tipBox,
                {
                  backgroundColor: softAccentBg,
                  borderColor: accentColor + '35',
                },
              ]}
            >
              <Sparkles size={13} color={accentColor} style={styles.tipIcon} />
              <Text style={[styles.tipText, themed.title]}>{step.tip}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => close(false)}
            accessibilityRole="button"
            style={styles.skip}
            testID="product-tour-skip"
          >
            <Text style={[styles.skipText, themed.muted]}>Skip</Text>
          </TouchableOpacity>
          <View style={styles.spacer} />
          {safeIndex > 0 && (
            <TouchableOpacity
              onPress={back}
              style={[
                styles.button,
                styles.ghostButton,
                themed.ghostButton,
                isModern && {borderRadius: ModernLayout.borderRadiusPill},
              ]}
              accessibilityRole="button"
              testID="product-tour-back"
            >
              <Text style={[styles.buttonText, themed.title]}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={next}
            style={[
              styles.button,
              isModern && {borderRadius: ModernLayout.borderRadiusPill},
              {backgroundColor: accentColor},
            ]}
            accessibilityRole="button"
            testID="product-tour-next"
          >
            <Text style={[styles.buttonText, {color: colors.white}]}>
              {isLast ? 'Get started' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 30,
  },
  card: {
    position: 'absolute',
    left: MARGIN,
    right: MARGIN,
    borderRadius: Layout.borderRadiusCard,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  closeButton: {
    padding: 4,
    marginRight: -4,
  },
  chaptersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chapterChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chapterText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '600',
  },
  chapterTextActive: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  scrollBody: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 2,
    gap: 10,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 13.5,
    lineHeight: 19,
  },
  highlightsList: {
    gap: 7,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  highlightBullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  highlightCopy: {
    flex: 1,
    gap: 1,
  },
  highlightLabel: {
    fontFamily: Fonts.heading,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  highlightDetail: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  tipIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  tipText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  skip: {
    paddingVertical: 8,
    paddingRight: 8,
  },
  skipText: {
    fontFamily: Fonts.body,
    fontSize: 14,
  },
  spacer: {
    flex: 1,
  },
  button: {
    minWidth: 76,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: Layout.borderRadiusButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

const getThemedStyles = (colors: ThemeColors) => ({
  card: {backgroundColor: colors.cardBg},
  title: {color: colors.textPrimary},
  body: {color: colors.textSecondary},
  muted: {color: colors.textSecondary},
  ghostButton: {borderColor: colors.border},
});
