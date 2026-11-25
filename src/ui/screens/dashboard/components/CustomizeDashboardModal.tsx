import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  FileText,
  Gauge,
  LayoutList,
  Plus,
  RotateCcw,
  Smile,
  Sparkles,
  Timer,
  X,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_META,
  HOME_QUICK_ACTIONS,
  MAX_HOME_QUICK_ACTIONS,
  MIN_HOME_QUICK_ACTIONS,
  UP_NEXT_CARD_STYLES,
  UP_NEXT_CARD_TONES,
  type DashboardConfig,
  type DashboardPresetId,
  type DashboardScheduleFilter,
  type DashboardWidgetId,
  type HomeDensityMode,
  type HomeQuickActionId,
  type MinFreeGapMinutes,
  type UpNextCardStyleId,
  type UpNextCardToneId,
} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {
  Fonts,
  FontSize,
  Layout,
  ModernLayout,
  Shadows,
  Spacing,
} from '../../../theme';
import {mixColors} from '../../../theme/colorMix';
import {useThemedStyles} from '../../../theme/createThemedStyles';
import {UpNextHeroCard, type HomeHeroModel} from './modern';

interface CustomizeDashboardModalProps {
  visible: boolean;
  config: DashboardConfig;
  previewHero?: HomeHeroModel | null;
  ustpEnabled?: boolean;
  onClose: () => void;
  onApplyPreset: (presetId: DashboardPresetId) => void;
  onMoveWidget: (id: DashboardWidgetId, direction: 'up' | 'down') => void;
  onToggleWidget: (id: DashboardWidgetId) => void;
  onChangeMinGap: (minutes: MinFreeGapMinutes) => void;
  onChangeDefaultFilter: (filter: DashboardScheduleFilter) => void;
  onChangeUpNextStyle?: (style: UpNextCardStyleId) => void;
  onChangeUpNextTone?: (tone: UpNextCardToneId) => void;
  onToggleShowQuickActions?: (show: boolean) => void;
  onToggleQuickAction?: (actionId: HomeQuickActionId) => void;
  onChangeHomeDensity?: (density: HomeDensityMode) => void;
  onToggleGreetingAvatar?: (show: boolean) => void;
  onReset: () => void;
}

const PRESET_LIST: readonly DashboardPresetId[] = [
  'balanced',
  'class_focus',
  'exam_crunch',
  'minimal_day',
];
const GAP_OPTIONS: readonly MinFreeGapMinutes[] = [30, 45, 60];
const FILTER_OPTIONS: ReadonlyArray<{
  id: DashboardScheduleFilter;
  label: string;
}> = [
  {id: 'all', label: 'All'},
  {id: 'classes', label: 'Classes'},
  {id: 'events', label: 'Events'},
];
const DENSITY_OPTIONS: ReadonlyArray<{
  id: HomeDensityMode;
  label: string;
}> = [
  {id: 'comfortable', label: 'Comfortable'},
  {id: 'compact', label: 'Compact'},
];

const NOOP = () => undefined;

const matchesPreset = (
  config: DashboardConfig,
  presetId: DashboardPresetId,
): boolean => {
  const preset = DASHBOARD_PRESETS[presetId];
  if (
    config.widgetOrder.length !== preset.widgetOrder.length ||
    config.hiddenWidgets.length !== preset.hiddenWidgets.length
  ) {
    return false;
  }
  return (
    config.widgetOrder.every((id, idx) => id === preset.widgetOrder[idx]) &&
    preset.hiddenWidgets.every(id => config.hiddenWidgets.includes(id))
  );
};

const renderStyleIcon = (id: UpNextCardStyleId, color: string) => {
  switch (id) {
    case 'mascot_progress':
      return <Smile size={16} color={color} />;
    case 'orb_brief':
      return <Sparkles size={16} color={color} />;
    case 'compact_glance':
      return <LayoutList size={16} color={color} />;
    case 'countdown_ring':
    default:
      return <Gauge size={16} color={color} />;
  }
};

const renderQuickActionIcon = (
  id: HomeQuickActionId,
  color: string,
  ustpEnabled: boolean,
) => {
  switch (id) {
    case 'add_task':
      return <Plus size={14} color={color} strokeWidth={2.4} />;
    case 'set_alarm':
      return <AlarmClock size={14} color={color} />;
    case 'focus':
      return <Timer size={14} color={color} />;
    case 'ask_ai':
      return ustpEnabled ? (
        <BookOpen size={14} color={color} />
      ) : (
        <Sparkles size={14} color={color} />
      );
    case 'notes':
      return <FileText size={14} color={color} />;
    case 'schedule':
      return <CalendarDays size={14} color={color} />;
    default:
      return <Clock size={14} color={color} />;
  }
};

export const CustomizeDashboardModal: React.FC<
  CustomizeDashboardModalProps
> = ({
  visible,
  config,
  previewHero = null,
  ustpEnabled = false,
  onClose,
  onApplyPreset,
  onMoveWidget,
  onToggleWidget,
  onChangeMinGap,
  onChangeDefaultFilter,
  onChangeUpNextStyle,
  onChangeUpNextTone,
  onToggleShowQuickActions,
  onToggleQuickAction,
  onChangeHomeDensity,
  onToggleGreetingAvatar,
  onReset,
}) => {
  const {colors, isDarkMode, isModern, modernPalette, modernThemeExtras} =
    useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const hiddenSet = new Set(config.hiddenWidgets);
  const visibleCount = config.widgetOrder.length - hiddenSet.size;
  const selectedActionsSet = new Set(config.quickActions);

  const surfaceCardStyle = isModern
    ? {
        backgroundColor: modernPalette.surface,
        borderColor: modernPalette.border,
      }
    : themed.subCard;

  const activeSurfaceStyle = isModern
    ? {
        backgroundColor: modernPalette.softViolet,
        borderColor: modernPalette.accent,
      }
    : {
        backgroundColor: colors.primary + '16',
        borderColor: colors.primary,
      };

  const accentColor = isModern
    ? isDarkMode
      ? modernPalette.accentDeep
      : modernPalette.accent
    : colors.primary;
  const accentInkColor = isModern
    ? isDarkMode
      ? mixColors('#FFFFFF', modernPalette.periwinkle, 0.3)
      : modernPalette.accentDeep
    : colors.primary;

  const getToneSwatchColor = (toneId: UpNextCardToneId): string => {
    switch (toneId) {
      case 'soft':
        return modernPalette.softViolet;
      case 'minimal':
        return modernPalette.card;
      case 'vivid':
      default:
        return modernThemeExtras.heroBgColor;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, {backgroundColor: colors.overlay}]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View
          style={[
            styles.sheet,
            isModern
              ? {
                  backgroundColor: modernPalette.card,
                  borderColor: modernPalette.border,
                  borderTopLeftRadius: ModernLayout.borderRadiusSheet,
                  borderTopRightRadius: ModernLayout.borderRadiusSheet,
                }
              : [themed.sheet, Shadows.card],
          ]}
        >
          {isModern && (
            <View style={styles.dragHandleWrap}>
              <View
                style={[
                  styles.dragHandle,
                  {backgroundColor: modernPalette.border},
                ]}
              />
            </View>
          )}

          <View style={styles.header}>
            <View style={styles.headerTextCol}>
              <Text style={[styles.title, themed.primaryText]}>
                Customize Dashboard
              </Text>
              <Text style={[styles.subtitle, themed.secondaryText]}>
                {isModern
                  ? 'Personalize your Up Next card, quick actions, and Home layout'
                  : 'Choose presets, reorder cards, or adjust study block filters'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, surfaceCardStyle]}
              accessibilityRole="button"
              accessibilityLabel="Close customization"
              testID="customize-dashboard-close"
            >
              <X size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            {/* Modern Up Next Card Studio */}
            {isModern && (
              <View style={styles.studioSection}>
                <Text style={[styles.sectionTitle, themed.secondaryText]}>
                  UP NEXT CARD STYLE
                </Text>

                {previewHero && (
                  <View style={styles.previewWrap}>
                    <UpNextHeroCard
                      hero={previewHero}
                      styleVariant={config.upNextStyle}
                      tone={config.upNextTone}
                      compact={config.homeDensity === 'compact'}
                      previewMode
                      onPress={NOOP}
                    />
                  </View>
                )}

                <View
                  style={styles.styleGrid}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Up Next card styles"
                >
                  {UP_NEXT_CARD_STYLES.map(styleMeta => {
                    const active = config.upNextStyle === styleMeta.id;
                    return (
                      <TouchableOpacity
                        key={styleMeta.id}
                        testID={`upnext-style-${styleMeta.id}`}
                        accessibilityRole="radio"
                        accessibilityState={{checked: active, selected: active}}
                        accessibilityLabel={`${styleMeta.label} — ${styleMeta.description}`}
                        onPress={() => onChangeUpNextStyle?.(styleMeta.id)}
                        activeOpacity={0.8}
                        style={[
                          styles.styleTile,
                          active ? activeSurfaceStyle : surfaceCardStyle,
                        ]}
                      >
                        <View style={styles.styleTileTopRow}>
                          <View
                            style={[
                              styles.styleIconBadge,
                              {
                                backgroundColor: active
                                  ? accentColor
                                  : modernPalette.card,
                                borderColor: active
                                  ? accentColor
                                  : modernPalette.border,
                              },
                            ]}
                          >
                            {renderStyleIcon(
                              styleMeta.id,
                              active ? '#FFFFFF' : accentColor,
                            )}
                          </View>
                          {active && (
                            <View
                              style={[
                                styles.checkBadge,
                                {backgroundColor: accentColor},
                              ]}
                            >
                              <Check
                                size={10}
                                color="#FFFFFF"
                                strokeWidth={3}
                              />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.styleTileTitle,
                            {color: active ? accentInkColor : colors.textPrimary},
                          ]}
                          numberOfLines={1}
                        >
                          {styleMeta.label}
                        </Text>
                        <Text
                          style={[styles.styleTileDesc, themed.secondaryText]}
                          numberOfLines={2}
                        >
                          {styleMeta.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.subLabel, themed.secondaryText]}>
                  CARD FINISH
                </Text>
                <View
                  style={styles.segmentedRow}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Up Next card finish"
                >
                  {UP_NEXT_CARD_TONES.map(toneMeta => {
                    const active = config.upNextTone === toneMeta.id;
                    return (
                      <TouchableOpacity
                        key={toneMeta.id}
                        testID={`upnext-tone-${toneMeta.id}`}
                        accessibilityRole="radio"
                        accessibilityState={{checked: active, selected: active}}
                        accessibilityLabel={`${toneMeta.label} finish — ${toneMeta.description}`}
                        onPress={() => onChangeUpNextTone?.(toneMeta.id)}
                        activeOpacity={0.8}
                        style={[
                          styles.tonePill,
                          active ? activeSurfaceStyle : surfaceCardStyle,
                        ]}
                      >
                        <View
                          style={[
                            styles.toneSwatch,
                            {
                              backgroundColor: getToneSwatchColor(toneMeta.id),
                              borderColor:
                                toneMeta.id === 'vivid'
                                  ? 'rgba(255,255,255,0.35)'
                                  : accentColor,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.toneLabel,
                            {color: active ? accentInkColor : colors.textPrimary},
                          ]}
                          numberOfLines={1}
                        >
                          {toneMeta.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.tipText, themed.secondaryText]}>
                  Tip: Long-press the Up Next card on Home anytime to customize
                  it.
                </Text>
              </View>
            )}

            {/* Quick Actions Customization (Modern Home) */}
            {isModern && (
              <>
                <Text style={[styles.sectionTitle, themed.secondaryText]}>
                  QUICK ACTIONS BAR
                </Text>
                <View style={[styles.optionCard, surfaceCardStyle]}>
                  <View style={styles.switchRow}>
                    <View style={styles.widgetMeta}>
                      <Text style={[styles.widgetTitle, themed.primaryText]}>
                        Show Quick Actions
                      </Text>
                      <Text style={[styles.widgetDesc, themed.secondaryText]}>
                        {config.showQuickActions
                          ? `${config.quickActions.length} of ${MAX_HOME_QUICK_ACTIONS} shortcuts shown (pick ${MIN_HOME_QUICK_ACTIONS}–${MAX_HOME_QUICK_ACTIONS})`
                          : 'Hidden for a cleaner Home tab'}
                      </Text>
                    </View>
                    <Switch
                      value={config.showQuickActions}
                      onValueChange={val => onToggleShowQuickActions?.(val)}
                      trackColor={{
                        false: colors.switchTrackOff,
                        true: accentColor + '80',
                      }}
                      thumbColor={
                        config.showQuickActions
                          ? accentColor
                          : colors.switchThumb
                      }
                      accessibilityLabel="Show Quick Actions bar"
                      testID="toggle-quick-actions"
                    />
                  </View>

                  {config.showQuickActions && (
                    <View style={styles.chipWrap}>
                      {HOME_QUICK_ACTIONS.map(action => {
                        const selected = selectedActionsSet.has(action.id);
                        const atMin =
                          selected &&
                          config.quickActions.length <= MIN_HOME_QUICK_ACTIONS;
                        const atMax =
                          !selected &&
                          config.quickActions.length >= MAX_HOME_QUICK_ACTIONS;
                        const label =
                          ustpEnabled && action.ustpLabel
                            ? action.ustpLabel
                            : action.label;

                        return (
                          <TouchableOpacity
                            key={action.id}
                            testID={`quick-action-chip-${action.id}`}
                            accessibilityRole="checkbox"
                            accessibilityState={{
                              checked: selected,
                              disabled: atMin || atMax,
                            }}
                            disabled={atMin || atMax}
                            onPress={() => onToggleQuickAction?.(action.id)}
                            activeOpacity={0.78}
                            style={[
                              styles.actionChip,
                              selected
                                ? {
                                    backgroundColor: accentColor,
                                    borderColor: accentColor,
                                  }
                                : {
                                    backgroundColor: modernPalette.card,
                                    borderColor: modernPalette.border,
                                  },
                              (atMin || atMax) && styles.actionChipMuted,
                            ]}
                          >
                            {renderQuickActionIcon(
                              action.id,
                              selected ? '#FFFFFF' : accentColor,
                              ustpEnabled,
                            )}
                            <Text
                              style={[
                                styles.actionChipText,
                                {
                                  color: selected
                                    ? '#FFFFFF'
                                    : colors.textPrimary,
                                },
                              ]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Home Spacing & Header */}
                <Text style={[styles.sectionTitle, themed.secondaryText]}>
                  HOME LAYOUT & HEADER
                </Text>
                <View style={styles.segmentedRow}>
                  {DENSITY_OPTIONS.map(opt => {
                    const active = config.homeDensity === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        testID={`home-density-${opt.id}`}
                        accessibilityRole="radio"
                        accessibilityState={{checked: active, selected: active}}
                        onPress={() => onChangeHomeDensity?.(opt.id)}
                        activeOpacity={0.78}
                        style={[
                          styles.segmentBtn,
                          surfaceCardStyle,
                          active && {
                            backgroundColor: accentColor,
                            borderColor: accentColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            active ? {color: colors.white} : themed.primaryText,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View
                  style={[
                    styles.optionCard,
                    styles.avatarRowCard,
                    surfaceCardStyle,
                  ]}
                >
                  <View style={styles.switchRow}>
                    <View style={styles.widgetMeta}>
                      <Text style={[styles.widgetTitle, themed.primaryText]}>
                        Greeting Avatar
                      </Text>
                      <Text style={[styles.widgetDesc, themed.secondaryText]}>
                        Show your profile avatar beside the daily greeting
                      </Text>
                    </View>
                    <Switch
                      value={config.showGreetingAvatar}
                      onValueChange={val => onToggleGreetingAvatar?.(val)}
                      trackColor={{
                        false: colors.switchTrackOff,
                        true: accentColor + '80',
                      }}
                      thumbColor={
                        config.showGreetingAvatar
                          ? accentColor
                          : colors.switchThumb
                      }
                      accessibilityLabel="Show Greeting Avatar"
                      testID="toggle-greeting-avatar"
                    />
                  </View>
                </View>
              </>
            )}

            {/* Presets */}
            <Text style={[styles.sectionTitle, themed.secondaryText]}>
              QUICK PRESETS
            </Text>
            <View style={styles.presetGrid}>
              {PRESET_LIST.map(presetId => {
                const preset = DASHBOARD_PRESETS[presetId];
                const isActive = matchesPreset(config, presetId);
                return (
                  <TouchableOpacity
                    key={presetId}
                    style={[
                      styles.presetCard,
                      isActive ? activeSurfaceStyle : surfaceCardStyle,
                    ]}
                    onPress={() => onApplyPreset(presetId)}
                    activeOpacity={0.75}
                    testID={`dashboard-preset-${presetId}`}
                  >
                    <View style={styles.presetTitleRow}>
                      <Text
                        style={[
                          styles.presetTitle,
                          isActive
                            ? {color: accentInkColor}
                            : themed.primaryText,
                        ]}
                        numberOfLines={1}
                      >
                        {preset.label}
                      </Text>
                      {isActive && (
                        <View
                          style={[
                            styles.checkBadge,
                            {backgroundColor: accentColor},
                          ]}
                        >
                          <Check size={10} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.presetDesc, themed.secondaryText]}
                      numberOfLines={2}
                    >
                      {preset.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Min Free Gap */}
            <Text style={[styles.sectionTitle, themed.secondaryText]}>
              MINIMUM FREE STUDY BLOCK
            </Text>
            <View style={styles.segmentedRow}>
              {GAP_OPTIONS.map(mins => {
                const active = config.minFreeGapMinutes === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    style={[
                      styles.segmentBtn,
                      surfaceCardStyle,
                      active && {
                        backgroundColor: accentColor,
                        borderColor: accentColor,
                      },
                    ]}
                    onPress={() => onChangeMinGap(mins)}
                    activeOpacity={0.75}
                    testID={`dashboard-gap-${mins}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active ? {color: colors.white} : themed.primaryText,
                      ]}
                    >
                      {mins === 60 ? '1 hour' : `${mins} min`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Default Schedule Filter */}
            <Text style={[styles.sectionTitle, themed.secondaryText]}>
              DEFAULT SCHEDULE VIEW
            </Text>
            <View style={styles.segmentedRow}>
              {FILTER_OPTIONS.map(opt => {
                const active = config.scheduleFilterDefault === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.segmentBtn,
                      surfaceCardStyle,
                      active && {
                        backgroundColor: accentColor,
                        borderColor: accentColor,
                      },
                    ]}
                    onPress={() => onChangeDefaultFilter(opt.id)}
                    activeOpacity={0.75}
                    testID={`dashboard-default-filter-${opt.id}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active ? {color: colors.white} : themed.primaryText,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Widget Order & Visibility */}
            <Text style={[styles.sectionTitle, themed.secondaryText]}>
              WIDGETS & ORDER
            </Text>
            <View style={styles.widgetList}>
              {config.widgetOrder.map((id, idx) => {
                const meta = DASHBOARD_WIDGET_META[id];
                const isVisible = !hiddenSet.has(id);
                const disableToggleOff = isVisible && visibleCount <= 1;

                return (
                  <View
                    key={id}
                    style={[styles.widgetRow, surfaceCardStyle]}
                    testID={`customize-widget-row-${id}`}
                  >
                    <View style={styles.reorderCols}>
                      <TouchableOpacity
                        style={[
                          styles.arrowBtn,
                          idx === 0 && styles.arrowBtnDisabled,
                        ]}
                        disabled={idx === 0}
                        onPress={() => onMoveWidget(id, 'up')}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${meta.title} up`}
                        testID={`move-up-${id}`}
                      >
                        <ArrowUp size={15} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.arrowBtn,
                          idx === config.widgetOrder.length - 1 &&
                            styles.arrowBtnDisabled,
                        ]}
                        disabled={idx === config.widgetOrder.length - 1}
                        onPress={() => onMoveWidget(id, 'down')}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${meta.title} down`}
                        testID={`move-down-${id}`}
                      >
                        <ArrowDown size={15} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.widgetMeta}>
                      <Text style={[styles.widgetTitle, themed.primaryText]}>
                        {meta.title}
                      </Text>
                      <Text
                        style={[styles.widgetDesc, themed.secondaryText]}
                        numberOfLines={2}
                      >
                        {meta.description}
                      </Text>
                    </View>

                    <Switch
                      value={isVisible}
                      disabled={disableToggleOff}
                      onValueChange={() => onToggleWidget(id)}
                      trackColor={{
                        false: colors.switchTrackOff,
                        true: accentColor + '80',
                      }}
                      thumbColor={isVisible ? accentColor : colors.switchThumb}
                      accessibilityLabel={`Show ${meta.title}`}
                      testID={`toggle-widget-${id}`}
                    />
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                borderTopColor: isModern ? modernPalette.border : colors.border,
                paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.resetBtn, surfaceCardStyle]}
              onPress={onReset}
              activeOpacity={0.75}
              testID="customize-dashboard-reset"
            >
              <RotateCcw size={15} color={colors.textPrimary} />
              <Text style={[styles.resetBtnText, themed.primaryText]}>
                Reset
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.doneBtn, {backgroundColor: accentColor}]}
              onPress={onClose}
              activeOpacity={0.8}
              testID="customize-dashboard-done"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getThemedStyles = (colors: ThemeColors) => ({
  sheet: {
    backgroundColor: colors.cardBg,
    borderColor: colors.border,
  },
  subCard: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '90%',
    paddingTop: Spacing.sm,
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerTextCol: {
    flex: 1,
    flexShrink: 1,
    paddingRight: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.subtitle,
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  studioSection: {
    marginBottom: Spacing.xs,
  },
  previewWrap: {
    marginBottom: Spacing.md,
  },
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  styleTile: {
    flexBasis: '46%',
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 5,
  },
  styleTileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  styleIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleTileTitle: {
    fontFamily: Fonts.heading,
    fontSize: 13.5,
    fontWeight: '700',
  },
  styleTileDesc: {
    fontFamily: Fonts.body,
    fontSize: 11,
    lineHeight: 15,
  },
  checkBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subLabel: {
    fontFamily: Fonts.heading,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  tonePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  toneSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  toneLabel: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '700',
  },
  tipText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    marginTop: 8,
  },
  optionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.md,
  },
  avatarRowCard: {
    marginTop: Spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.md,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionChipMuted: {
    opacity: 0.55,
  },
  actionChipText: {
    fontFamily: Fonts.heading,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  presetCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.md,
  },
  presetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  presetTitle: {
    flex: 1,
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  presetDesc: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    lineHeight: 15.5,
    marginTop: 4,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  widgetList: {
    gap: Spacing.sm,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  reorderCols: {
    flexDirection: 'column',
    gap: 2,
  },
  arrowBtn: {
    padding: 4,
  },
  arrowBtnDisabled: {
    opacity: 0.25,
  },
  widgetMeta: {
    flex: 1,
  },
  widgetTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  widgetDesc: {
    fontFamily: Fonts.body,
    fontSize: 11,
    marginTop: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  resetBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  doneBtn: {
    flex: 1,
    borderRadius: Layout.borderRadiusButton,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneBtnText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
