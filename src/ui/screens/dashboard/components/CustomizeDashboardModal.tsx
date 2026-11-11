import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {ArrowDown, ArrowUp, RotateCcw, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  DASHBOARD_PRESETS,
  DASHBOARD_WIDGET_META,
  type DashboardConfig,
  type DashboardPresetId,
  type DashboardScheduleFilter,
  type DashboardWidgetId,
  type MinFreeGapMinutes,
} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';
import type {ThemeColors} from '../../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Shadows, Spacing} from '../../../theme';
import {useThemedStyles} from '../../../theme/createThemedStyles';

interface CustomizeDashboardModalProps {
  visible: boolean;
  config: DashboardConfig;
  onClose: () => void;
  onApplyPreset: (presetId: DashboardPresetId) => void;
  onMoveWidget: (id: DashboardWidgetId, direction: 'up' | 'down') => void;
  onToggleWidget: (id: DashboardWidgetId) => void;
  onChangeMinGap: (minutes: MinFreeGapMinutes) => void;
  onChangeDefaultFilter: (filter: DashboardScheduleFilter) => void;
  onReset: () => void;
}

const PRESET_LIST: readonly DashboardPresetId[] = [
  'balanced',
  'class_focus',
  'exam_crunch',
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

export const CustomizeDashboardModal: React.FC<
  CustomizeDashboardModalProps
> = ({
  visible,
  config,
  onClose,
  onApplyPreset,
  onMoveWidget,
  onToggleWidget,
  onChangeMinGap,
  onChangeDefaultFilter,
  onReset,
}) => {
  const {colors} = useTheme();
  const themed = useThemedStyles(getThemedStyles);
  const insets = useSafeAreaInsets();
  const hiddenSet = new Set(config.hiddenWidgets);
  const visibleCount = config.widgetOrder.length - hiddenSet.size;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, themed.sheet, Shadows.card]}>
          <View style={styles.header}>
            <View style={styles.headerTextCol}>
              <Text style={[styles.title, themed.primaryText]}>
                Customize Dashboard
              </Text>
              <Text style={[styles.subtitle, themed.secondaryText]}>
                Choose presets, reorder cards, or adjust study block filters
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, themed.closeBtn]}
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
            {/* Presets */}
            <Text style={[styles.sectionTitle, themed.secondaryText]}>
              QUICK PRESETS
            </Text>
            <View style={styles.presetGrid}>
              {PRESET_LIST.map(presetId => {
                const preset = DASHBOARD_PRESETS[presetId];
                return (
                  <TouchableOpacity
                    key={presetId}
                    style={[styles.presetCard, themed.subCard]}
                    onPress={() => onApplyPreset(presetId)}
                    activeOpacity={0.75}
                    testID={`dashboard-preset-${presetId}`}
                  >
                    <Text style={[styles.presetTitle, themed.primaryText]}>
                      {preset.label}
                    </Text>
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
                      themed.subCard,
                      active && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
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
                      themed.subCard,
                      active && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
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
                    style={[styles.widgetRow, themed.subCard]}
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
                        true: colors.primary + '80',
                      }}
                      thumbColor={
                        isVisible ? colors.primary : colors.switchThumb
                      }
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
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.resetBtn, themed.subCard]}
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
              style={[styles.doneBtn, {backgroundColor: colors.primary}]}
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
  closeBtn: {
    backgroundColor: colors.inputBg,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '88%',
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  sectionTitle: {
    fontFamily: Fonts.heading,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  presetGrid: {
    gap: Spacing.sm,
  },
  presetCard: {
    borderRadius: Layout.borderRadiusButton,
    borderWidth: 1,
    padding: Spacing.md,
  },
  presetTitle: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  presetDesc: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginTop: 2,
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
