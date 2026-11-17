import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  Animated,
  FlatList,
  type FlatListProps,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityActionEvent,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {Fonts} from '../../../theme';

export interface ScrollWheelOption<T extends string | number> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

interface WheelEntry<T extends string | number> {
  key: string;
  option: ScrollWheelOption<T>;
  cycle: number;
  rowIndex: number;
}

interface ScrollWheelPickerProps<T extends string | number> {
  options: ReadonlyArray<ScrollWheelOption<T>>;
  value: T;
  onChange: (value: T) => void;
  loop?: boolean;
  itemHeight?: number;
  visibleCount?: number;
  textColor: string;
  fontSize?: number;
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  testID?: string;
}

interface WheelRowProps<T extends string | number> {
  label: string;
  accessibilityLabel?: string;
  rowIndex: number;
  itemHeight: number;
  scrollY: Animated.Value;
  textColor: string;
  fontSize: number;
  onPressRow: (rowIndex: number, value: T) => void;
  value: T;
  testID?: string;
}

const WheelRowInner = <T extends string | number>({
  label,
  accessibilityLabel,
  rowIndex,
  itemHeight,
  scrollY,
  textColor,
  fontSize,
  onPressRow,
  value,
  testID,
}: WheelRowProps<T>) => {
  const center = rowIndex * itemHeight;
  const inputRange = [
    center - itemHeight * 2,
    center - itemHeight,
    center,
    center + itemHeight,
    center + itemHeight * 2,
  ];

  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.24, 0.56, 1, 0.56, 0.24],
    extrapolate: 'clamp',
  });

  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.82, 0.92, 1.06, 0.92, 0.82],
    extrapolate: 'clamp',
  });

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.75}
      onPress={() => onPressRow(rowIndex, value)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.rowTouch, {height: itemHeight}]}
    >
      <Animated.View
        style={[
          styles.rowAnimated,
          {
            height: itemHeight,
            opacity,
            transform: [{scale}],
          },
        ]}
      >
        <Text
          style={[
            styles.rowText,
            {
              color: textColor,
              fontSize,
              lineHeight: Math.round(itemHeight * 0.9),
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const WheelRow = React.memo(WheelRowInner) as typeof WheelRowInner;

/**
 * High-FPS scroll-wheel drum backed by virtualized Animated.FlatList.
 * Runs scroll opacity/scale animations strictly on the native UI thread with
 * zero per-frame JS callbacks, committing selection when scrolling settles.
 */
function ScrollWheelPickerInner<T extends string | number>({
  options,
  value,
  onChange,
  loop = false,
  itemHeight = 42,
  visibleCount = 5,
  textColor,
  fontSize = 26,
  reducedMotion = false,
  style,
  accessibilityLabel,
  testID,
}: ScrollWheelPickerProps<T>) {
  const safeCount = Math.max(1, options.length);
  const cycles = loop ? (safeCount <= 24 ? 5 : 3) : 1;
  const middleCycle = Math.floor(cycles / 2);

  const expanded = useMemo<WheelEntry<T>[]>(() => {
    const out: WheelEntry<T>[] = [];
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      for (let i = 0; i < options.length; i += 1) {
        out.push({
          key: `${cycle}-${String(options[i].value)}`,
          option: options[i],
          cycle,
          rowIndex: cycle * options.length + i,
        });
      }
    }
    return out;
  }, [cycles, options]);

  const optionIndexForValue = useCallback(
    (target: T): number => {
      const idx = options.findIndex(item => item.value === target);
      return idx >= 0 ? idx : 0;
    },
    [options],
  );

  const middleRowForIndex = useCallback(
    (optIdx: number): number => middleCycle * options.length + optIdx,
    [middleCycle, options.length],
  );

  const initialRow = middleRowForIndex(optionIndexForValue(value));
  const initialY = initialRow * itemHeight;

  const listRef = useRef<FlatList<WheelEntry<T>> | null>(null);
  const scrollY = useRef(new Animated.Value(initialY)).current;
  const currentRowRef = useRef<number>(initialRow);
  const lastEmittedRef = useRef<T>(value);
  const hasLaidOutRef = useRef(false);
  const isMomentumRef = useRef(false);
  const dragSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerHeight = itemHeight * visibleCount;
  const verticalPad = ((visibleCount - 1) * itemHeight) / 2;

  const clearDragSettleTimer = () => {
    if (dragSettleTimerRef.current) {
      clearTimeout(dragSettleTimerRef.current);
      dragSettleTimerRef.current = null;
    }
  };

  useEffect(() => () => clearDragSettleTimer(), []);

  const snapSilentlyToRow = useCallback(
    (rowIndex: number) => {
      const targetY = rowIndex * itemHeight;
      currentRowRef.current = rowIndex;
      scrollY.setValue(targetY);
      listRef.current?.scrollToOffset?.({offset: targetY, animated: false});
    },
    [itemHeight, scrollY],
  );

  // Smoothly spin to the new value when updated externally (e.g. preset chip).
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const modIndex = optionIndexForValue(value);
    const targetRow = middleRowForIndex(modIndex);

    if (loop && options.length > 0) {
      const currentMod =
        ((currentRowRef.current % options.length) + options.length) %
        options.length;
      const equivMiddleRow = middleRowForIndex(currentMod);
      if (currentRowRef.current !== equivMiddleRow) {
        snapSilentlyToRow(equivMiddleRow);
      }
    }

    currentRowRef.current = targetRow;
    const targetOffset = targetRow * itemHeight;
    const animate = !reducedMotion && hasLaidOutRef.current;
    if (!animate) {
      scrollY.setValue(targetOffset);
    }
    listRef.current?.scrollToOffset?.({
      offset: targetOffset,
      animated: animate,
    });
  }, [
    itemHeight,
    loop,
    middleRowForIndex,
    optionIndexForValue,
    options.length,
    reducedMotion,
    scrollY,
    snapSilentlyToRow,
    value,
  ]);

  const emitIfChanged = useCallback(
    (nextValue: T) => {
      if (nextValue !== lastEmittedRef.current) {
        lastEmittedRef.current = nextValue;
        onChange(nextValue);
      }
    },
    [onChange],
  );

  const settleAtOffset = useCallback(
    (y: number) => {
      if (expanded.length === 0) return;
      const snappedRow = Math.max(
        0,
        Math.min(expanded.length - 1, Math.round(y / itemHeight)),
      );
      const modIndex =
        ((snappedRow % options.length) + options.length) % options.length;
      const option = options[modIndex];
      if (option) {
        emitIfChanged(option.value);
      }
      currentRowRef.current = snappedRow;

      if (loop) {
        const lowerBound = options.length;
        const upperBound = (cycles - 1) * options.length;
        if (snappedRow < lowerBound || snappedRow >= upperBound) {
          snapSilentlyToRow(middleRowForIndex(modIndex));
        }
      }
    },
    [
      cycles,
      emitIfChanged,
      expanded.length,
      itemHeight,
      loop,
      middleRowForIndex,
      options,
      snapSilentlyToRow,
    ],
  );

  const scrollHandler = useMemo(
    () =>
      Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {
        useNativeDriver: true,
      }),
    [scrollY],
  );

  const handleMomentumBegin = useCallback(() => {
    isMomentumRef.current = true;
    clearDragSettleTimer();
  }, []);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isMomentumRef.current = false;
      clearDragSettleTimer();
      settleAtOffset(event.nativeEvent.contentOffset.y);
    },
    [settleAtOffset],
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      clearDragSettleTimer();
      dragSettleTimerRef.current = setTimeout(() => {
        if (!isMomentumRef.current) {
          settleAtOffset(y);
        }
      }, 70);
    },
    [settleAtOffset],
  );

  const handlePressRow = useCallback(
    (rowIndex: number, rowValue: T) => {
      clearDragSettleTimer();
      currentRowRef.current = rowIndex;
      emitIfChanged(rowValue);
      const targetOffset = rowIndex * itemHeight;
      const animate = !reducedMotion;
      if (!animate) {
        scrollY.setValue(targetOffset);
      }
      listRef.current?.scrollToOffset?.({
        offset: targetOffset,
        animated: animate,
      });
    },
    [emitIfChanged, itemHeight, reducedMotion, scrollY],
  );

  const handleLayout = useCallback(() => {
    if (!hasLaidOutRef.current) {
      hasLaidOutRef.current = true;
      const row = middleRowForIndex(
        optionIndexForValue(lastEmittedRef.current),
      );
      snapSilentlyToRow(row);
    }
  }, [middleRowForIndex, optionIndexForValue, snapSilentlyToRow]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const currentIdx = optionIndexForValue(lastEmittedRef.current);
      const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
      const nextIdx = loop
        ? (currentIdx + delta + options.length) % options.length
        : Math.max(0, Math.min(options.length - 1, currentIdx + delta));
      const nextOption = options[nextIdx];
      if (!nextOption) return;
      handlePressRow(middleRowForIndex(nextIdx), nextOption.value);
    },
    [handlePressRow, loop, middleRowForIndex, optionIndexForValue, options],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<WheelEntry<T>> | null | undefined, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    }),
    [itemHeight],
  );

  const keyExtractor = useCallback((item: WheelEntry<T>) => item.key, []);

  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<WheelEntry<T>>) => (
      <WheelRow
        label={item.option.label}
        accessibilityLabel={item.option.accessibilityLabel}
        value={item.option.value}
        rowIndex={item.rowIndex}
        itemHeight={itemHeight}
        scrollY={scrollY}
        textColor={textColor}
        fontSize={fontSize}
        onPressRow={handlePressRow}
        testID={
          testID && item.cycle === middleCycle
            ? `${testID}-item-${String(item.option.value)}`
            : undefined
        }
      />
    ),
    [
      fontSize,
      handlePressRow,
      itemHeight,
      middleCycle,
      scrollY,
      testID,
      textColor,
    ],
  );

  const activeOption = options[optionIndexForValue(value)];

  const TypedAnimatedFlatList =
    Animated.FlatList as unknown as React.ComponentType<
      Omit<FlatListProps<WheelEntry<T>>, 'onScroll'> & {
        onScroll?: ReturnType<typeof Animated.event>;
        ref?: React.Ref<FlatList<WheelEntry<T>>>;
      }
    >;

  return (
    <View
      style={[styles.container, {height: containerHeight}, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{text: activeOption?.label ?? String(value)}}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <TypedAnimatedFlatList
        ref={listRef}
        testID={testID}
        data={expanded}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialRow}
        initialNumToRender={15}
        maxToRenderPerBatch={12}
        windowSize={7}
        updateCellsBatchingPeriod={16}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        overScrollMode="never"
        bounces={!loop}
        scrollEventThrottle={16}
        onLayout={handleLayout}
        onScroll={scrollHandler}
        onMomentumScrollBegin={handleMomentumBegin}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleScrollEndDrag}
        contentContainerStyle={{paddingVertical: verticalPad}}
      />
    </View>
  );
}

export const ScrollWheelPicker = React.memo(
  ScrollWheelPickerInner,
) as typeof ScrollWheelPickerInner;

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTouch: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  rowAnimated: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  rowText: {
    fontFamily: Fonts.heading,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
