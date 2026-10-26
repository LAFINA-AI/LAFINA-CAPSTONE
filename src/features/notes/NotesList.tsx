import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {Note, NoteFilter} from '../../core/domain/notes';
import {useTheme} from '../../core/theme/ThemeContext';
import {Icon, IconButton} from '../../core/ui/Icon';
import {Button, Message} from '../../core/ui/controls';
import {styles} from './notesStyles';
const filters: NoteFilter[] = ['All', 'Pinned', 'Personal', 'Coursework'];
export function NotesList({
  items,
  hasMore,
  offset,
  filter,
  search,
  searchVisible,
  compact,
  error,
  available,
  onToggleSearch,
  onToggleCompact,
  onSearchChange,
  onFilterChange,
  onOpen,
  onRetry,
  onPrevious,
  onNext,
  onAdd,
}: {
  items: Note[];
  hasMore: boolean;
  offset: number;
  filter: NoteFilter;
  search: string;
  searchVisible: boolean;
  compact: boolean;
  error: string | null;
  available: boolean;
  onToggleSearch: () => void;
  onToggleCompact: () => void;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: NoteFilter) => void;
  onOpen: (note: Note) => void;
  onRetry: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onAdd: () => void;
}) {
  const {colors} = useTheme();
  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={[styles.heading, {color: colors.text}]}
        >
          Notes
        </Text>
        <IconButton
          name="search"
          label={searchVisible ? 'Close note search' : 'Search notes'}
          onPress={() => {
            onToggleSearch();
          }}
        />
        <IconButton
          name="more"
          label={compact ? 'Use note cards' : 'Use compact notes'}
          onPress={onToggleCompact}
        />
      </View>
      {searchVisible && (
        <TextInput
          accessibilityLabel="Search notes"
          value={search}
          placeholder="Search notes…"
          maxLength={100}
          placeholderTextColor={colors.muted}
          onChangeText={value => {
            onSearchChange(value);
          }}
          style={[
            styles.search,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        />
      )}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map(value => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{selected: filter === value}}
              onPress={() => {
                onFilterChange(value);
              }}
              style={styles.filter}
            >
              <View
                style={[
                  styles.filterPill,
                  {
                    backgroundColor:
                      filter === value ? colors.primary : colors.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    {color: filter === value ? colors.onPrimary : colors.muted},
                  ]}
                >
                  {value}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {error && (
        <View style={styles.error}>
          <Message text={error} error />
          <Button label="Retry notes" onPress={onRetry} secondary />
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          error ? null : (
            <View style={styles.empty}>
              <Icon name="note" size={56} color={colors.accent} />
              <Text style={[styles.emptyTitle, {color: colors.text}]}>
                No notes found
              </Text>
              <Text style={[styles.emptyText, {color: colors.muted}]}>
                Tap the + button below to write a new note.
              </Text>
            </View>
          )
        }
        renderItem={({item}) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open note: ${item.title}`}
            onPress={() => onOpen(item)}
            style={[
              styles.card,
              compact && styles.compactCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}
          >
            <View style={styles.cardHeading}>
              <Text
                numberOfLines={2}
                style={[styles.cardTitle, {color: colors.text}]}
              >
                {item.title}
              </Text>
              {item.pinned && (
                <Icon name="pin" size={18} color={colors.primary} />
              )}
            </View>
            {!compact && (
              <Text
                numberOfLines={3}
                style={[styles.preview, {color: colors.muted}]}
              >
                {item.body || 'Empty note'}
              </Text>
            )}
            <Text style={[styles.category, {color: colors.muted}]}>
              {item.category}
              {item.pinned ? ' · Pinned' : ''}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          hasMore || offset > 0 ? (
            <View style={styles.paging}>
              {offset > 0 && (
                <Button label="Previous notes" onPress={onPrevious} secondary />
              )}
              {hasMore && (
                <Button label="Next notes" onPress={onNext} secondary />
              )}
              <Text style={[styles.category, {color: colors.muted}]}>
                Showing up to 20 saved notes per page.
              </Text>
            </View>
          ) : null
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add note"
        disabled={!available}
        accessibilityState={{disabled: !available}}
        onPress={onAdd}
        style={[
          styles.fab,
          {
            backgroundColor: available ? colors.accent : colors.disabled,
            shadowColor: colors.text,
          },
        ]}
      >
        <Icon name="plus" size={30} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}
