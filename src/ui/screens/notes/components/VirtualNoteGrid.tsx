import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import type {LayoutChangeEvent, StyleProp, ViewStyle} from 'react-native';
import type {NoteSnapshot} from '../../../../storage';
import {useTheme} from '../../../contexts/ThemeContext';

type CardLayout = {x: number; y: number; width: number; height: number};
type GridRow = {
  key: string;
  label?: string;
  notes: {item: NoteSnapshot; index: number}[];
};
const CellOrigin = createContext(0);
function GridCell({
  children,
  onLayout,
  style,
}: {
  children?: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [y, setY] = useState(0);
  return (
    <View
      style={style}
      onLayout={event => {
        onLayout?.(event);
        setY(event.nativeEvent.layout.y);
      }}
    >
      <CellOrigin.Provider value={y}>{children}</CellOrigin.Provider>
    </View>
  );
}

const RowLayout = createContext<
  | ((
      id: string,
      layout: CardLayout,
      save: (id: string, layout: CardLayout) => void,
    ) => void)
  | null
>(null);
export const useGridRowLayout = () => useContext(RowLayout);

const Row = React.memo(function GridRowView({
  row,
  renderItem,
}: {
  row: GridRow;
  renderItem: (entry: {item: NoteSnapshot; index: number}) => React.ReactNode;
}) {
  const {colors} = useTheme();
  const cellY = useContext(CellOrigin);
  const headerOffset = useRef(0);
  const origin = useRef({x: 0, y: 0});
  const cards = useRef(
    new Map<
      string,
      {layout: CardLayout; save: (id: string, layout: CardLayout) => void}
    >(),
  );
  const report = useMemo(
    () =>
      (
        id: string,
        layout: CardLayout,
        save: (id: string, layout: CardLayout) => void,
      ) => {
        cards.current.set(id, {layout, save});
        save(id, {
          ...layout,
          x: layout.x + origin.current.x,
          y: layout.y + cellY + origin.current.y + headerOffset.current,
        });
      },
    [cellY],
  );
  useLayoutEffect(() => {
    const live = new Set(row.notes.map(entry => entry.item.id));
    for (const [id, entry] of cards.current) {
      if (!live.has(id)) cards.current.delete(id);
      else report(id, entry.layout, entry.save);
    }
  }, [report, row.notes]);
  return (
    <View
      onLayout={event => {
        origin.current = event.nativeEvent.layout;
        for (const [id, {layout, save}] of cards.current)
          report(id, layout, save);
      }}
    >
      {row.label && (
        <Text style={[styles.header, {color: colors.textSecondary}]}>
          {row.label}
        </Text>
      )}
      <RowLayout.Provider value={report}>
        <View
          style={styles.row}
          onLayout={event => {
            // Header height belongs to this row's card coordinates too.
            const offset = event.nativeEvent.layout.y;
            headerOffset.current = offset;
            for (const [id, {layout, save}] of cards.current)
              save(id, {
                ...layout,
                x: layout.x + origin.current.x,
                y: layout.y + cellY + origin.current.y + offset,
              });
          }}
        >
          {row.notes.map(renderItem)}
        </View>
      </RowLayout.Provider>
    </View>
  );
});

export const VirtualNoteGrid = React.memo(function VirtualNoteGridView({
  items,
  renderItem,
  scrollEnabled,
  footer,
  generation,
  showSections,
}: {
  items: NoteSnapshot[];
  renderItem: (entry: {item: NoteSnapshot; index: number}) => React.ReactNode;
  scrollEnabled: boolean;
  footer: React.ReactElement | null;
  generation: number;
  showSections: boolean;
}) {
  const rows = useMemo(() => {
    const result: GridRow[] = [];
    const hasPinned = showSections && items.some(item => item.isPinned);
    items.forEach((item, index) => {
      const previous = result[result.length - 1];
      const sectionStart =
        index === 0 || items[index - 1].isPinned !== item.isPinned;
      if (
        !previous ||
        previous.notes.length === 2 ||
        (hasPinned && sectionStart)
      ) {
        result.push({
          key: item.id,
          label:
            hasPinned && sectionStart
              ? item.isPinned
                ? 'PINNED'
                : 'OTHERS'
              : undefined,
          notes: [{item, index}],
        });
      } else previous.notes.push({item, index});
    });
    return result;
  }, [items, showSections]);
  const keyExtractor = useCallback((row: GridRow) => row.key, []);
  const renderFooter = useCallback(() => footer, [footer]);
  const renderGridRow = useCallback(
    ({item}: {item: GridRow}) => <Row row={item} renderItem={renderItem} />,
    [renderItem],
  );
  return (
    <FlatList
      data={rows}
      CellRendererComponent={GridCell}
      keyExtractor={keyExtractor}
      renderItem={renderGridRow}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews={false}
      scrollEnabled={scrollEnabled}
      extraData={generation}
      ListFooterComponent={renderFooter}
      contentContainerStyle={styles.content}
    />
  );
});

const styles = StyleSheet.create({
  row: {flexDirection: 'row', justifyContent: 'space-between'},
  header: {fontSize: 11, fontWeight: '700', marginBottom: 8},
  content: {paddingBottom: 190},
});
