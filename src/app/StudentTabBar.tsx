import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../core/theme/ThemeContext';
import {dimensions, spacing, typography} from '../core/theme/theme';
import {Icon, type IconName} from '../core/ui/Icon';

export type StudentTab = 'Chat' | 'Calendar' | 'Notes' | 'Settings';
const items: Array<{tab: StudentTab; title: string; icon: IconName}> = [
  {tab: 'Chat', title: 'Chat', icon: 'chat'},
  {tab: 'Calendar', title: 'Calendar', icon: 'calendar'},
  {tab: 'Notes', title: 'Notes', icon: 'note'},
  {tab: 'Settings', title: 'Profile', icon: 'user'},
];

/** Nol-branch's floating composition, wired to guarded local routes only. */
export function StudentTabBar({
  tab,
  disabled,
  onTab,
  onVoice,
}: {
  tab: StudentTab | 'Today';
  disabled: boolean;
  onTab: (tab: StudentTab) => void;
  onVoice: () => void;
}) {
  const {colors} = useTheme();
  function renderTab(item: (typeof items)[number]) {
    const selected =
      tab === item.tab || (tab === 'Today' && item.tab === 'Calendar');
    return (
      <Pressable
        key={item.tab}
        accessibilityRole="tab"
        accessibilityLabel={item.title}
        accessibilityState={{selected, disabled}}
        disabled={disabled}
        onPress={() => onTab(item.tab)}
        style={({pressed}) => [
          styles.tab,
          {opacity: disabled ? 0.5 : pressed ? 0.65 : 1},
        ]}
      >
        <Icon
          name={item.icon}
          color={selected ? colors.accent : colors.muted}
        />
        {selected ? (
          <Text style={[styles.label, {color: colors.primary}]}>
            {item.title}
          </Text>
        ) : null}
      </Pressable>
    );
  }
  return (
    <View style={styles.wrapper}>
      <View
        accessibilityRole="tablist"
        style={[
          styles.bar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
        ]}
      >
        {items.slice(0, 2).map(renderTab)}
        <View style={styles.voiceSpace}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open voice assistant"
            accessibilityHint="Opens editable speech input. Recording starts only while you hold the talk button."
            accessibilityState={{disabled}}
            disabled={disabled}
            onPress={onVoice}
            style={({pressed}) => [
              styles.voice,
              {
                backgroundColor: colors.brand,
                shadowColor: colors.shadow,
                opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
              },
            ]}
          >
            <Icon name="mic" size={30} color={colors.onBrand} />
          </Pressable>
        </View>
        {items.slice(2).map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: dimensions.tabBarHeight,
    borderRadius: 40,
    borderWidth: dimensions.border,
    paddingHorizontal: spacing.xs,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 8,
    shadowOpacity: 0.18,
    elevation: 5,
    maxWidth: dimensions.contentMax,
    width: '100%',
    alignSelf: 'center',
  },
  tab: {
    flex: 1,
    minHeight: dimensions.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: typography.caption,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  voiceSpace: {
    width: dimensions.microphone + spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voice: {
    width: dimensions.microphone,
    height: dimensions.microphone,
    borderRadius: dimensions.microphone / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.lg,
    shadowOffset: {width: 0, height: 4},
    shadowRadius: 6,
    shadowOpacity: 0.25,
    elevation: 7,
  },
});
