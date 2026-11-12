import {resolveCallTarget} from '../../navigation/resolveCallTarget';
import React, {useCallback, useState, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import {pick} from '@react-native-documents/picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  FileText,
  Plus,
  Search,
  Grid,
  List,
  X,
  Pin,
  CheckSquare,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {Colors, Shadows} from '../../theme';
import {useNotesData} from './hooks/useNotesData';
import {useTodoData} from './hooks/useTodoData';
import {
  NoteFilters,
  NoteCardWithDrag,
  TodoListView,
  TodoEditorModal,
} from './components';
import {NoteEditor} from './components/NoteEditor';
import {NotesScreenProps, NotesSubTab} from './types';
import type {NoteSnapshot} from '../../../storage';

export const NotesScreen: React.FC<NotesScreenProps> = ({
  userId,
  refreshTrigger,
  onRefresh,
  openRequest,
  onOpenRequestHandled,
}) => {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const fabBottom = Math.max(insets.bottom, 12) + 90;
  const [activeSubTab, setActiveSubTab] = useState<NotesSubTab>('notes');
  const todoReloadRef = useRef<() => void>(() => {});
  const handleCombinedRefresh = useCallback(() => {
    todoReloadRef.current();
    onRefresh?.();
  }, [onRefresh]);
  const data = useNotesData({
    userId,
    refreshTrigger,
    onRefresh: handleCombinedRefresh,
  });
  const todo = useTodoData({
    userId,
    refreshTrigger,
    searchQuery: data.searchQuery,
    onRefresh,
  });
  todoReloadRef.current = todo.loadTodos;
  const {setHighlightedTaskId} = todo;
  const handledRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!openRequest || handledRequest.current === openRequest.requestId)
      return;
    handledRequest.current = openRequest.requestId;
    onOpenRequestHandled?.(openRequest.requestId);
    if (openRequest.notesTab === 'todo' || openRequest.entityKind === 'task') {
      setActiveSubTab('todo');
      if (!openRequest.entityId) return;
      try {
        const resolved = resolveCallTarget(userId, openRequest);
        if (resolved?.kind === 'task') {
          setHighlightedTaskId(resolved.item.id);
        } else {
          Alert.alert(
            'To-Do unavailable',
            'This to-do item is no longer available for this account.',
          );
        }
      } catch {
        Alert.alert(
          'To-Do unavailable',
          'Could not read this to-do item. Please try again.',
        );
      }
      return;
    }
    setActiveSubTab('notes');
    try {
      const resolved = resolveCallTarget(userId, openRequest);
      if (resolved?.kind === 'note') data.openEditNote(resolved.item);
      else
        Alert.alert(
          'Note unavailable',
          'This note is no longer available for this account.',
        );
    } catch {
      Alert.alert(
        'Note unavailable',
        'Could not read this note. Please try again.',
      );
    }
  }, [openRequest, userId, data, setHighlightedTaskId, onOpenRequestHandled]);

  const handleOpenParentNote = useCallback(
    (noteId: string) => {
      const resolved = resolveCallTarget(userId, {
        ownerId: userId,
        screen: 'notes',
        entityKind: 'note',
        entityId: noteId,
      });
      if (resolved?.kind === 'note') {
        setActiveSubTab('notes');
        data.openEditNote(resolved.item);
      } else {
        Alert.alert(
          'Note unavailable',
          'This note is no longer available for this account.',
        );
      }
    },
    [userId, data],
  );

  const keyExtractor = useCallback((item: NoteSnapshot) => item.id, []);

  const hasSearch = Boolean(data.searchQuery.trim());
  const firstPinnedId = useMemo(
    () => (hasSearch ? null : data.filtered.find(n => n.isPinned)?.id || null),
    [data.filtered, hasSearch],
  );
  const firstOtherId = useMemo(
    () => (hasSearch ? null : data.filtered.find(n => !n.isPinned)?.id || null),
    [data.filtered, hasSearch],
  );
  const hasPinned = firstPinnedId !== null;

  const renderItem = useCallback(
    ({item, index}: {item: NoteSnapshot; index: number}) => {
      const isItemPinned = item.isPinned;
      // AGY-PORT 07: only the complete, unfiltered collection can be reordered.
      const canDrag = !isItemPinned && data.canReorder;
      const isActive = item.id === data.activeDragId;
      const showPinnedHeader =
        hasPinned && item.id === firstPinnedId && !data.isGridView;
      const showOtherHeader =
        hasPinned && item.id === firstOtherId && !data.isGridView;

      const card = (
        <NoteCardWithDrag
          key={item.id}
          item={item}
          index={index}
          isGridView={data.isGridView}
          isActive={isActive}
          canDrag={canDrag}
          dragX={data.dragXRef.current}
          dragY={data.dragYRef.current}
          onPress={() => data.openEditNote(item)}
          onDragStart={data.handleDragStart}
          onDragMove={data.handleDragMove}
          onDragRelease={data.handleDragRelease}
          onLayout={data.onCardLayout}
          onToggleChecklist={(_shown, checklistIndex) =>
            data.toggleNoteChecklist(item, checklistIndex)
          }
        />
      );

      if (data.isGridView) {
        return card;
      }

      return (
        <View key={item.id} style={styles.cardContainerWrapper}>
          {showPinnedHeader && (
            <View style={styles.sectionHeaderRow}>
              <Pin
                size={11}
                color={colors.red}
                style={{transform: [{rotate: '45deg'}], marginRight: 6}}
              />
              <Text
                style={[
                  styles.sectionHeaderText,
                  {color: colors.textSecondary},
                ]}
              >
                PINNED
              </Text>
            </View>
          )}
          {showOtherHeader && (
            <View style={styles.sectionHeaderRow}>
              <Text
                style={[
                  styles.sectionHeaderText,
                  {color: colors.textSecondary},
                ]}
              >
                OTHERS
              </Text>
            </View>
          )}
          {card}
        </View>
      );
    },
    [data, hasPinned, firstPinnedId, firstOtherId, colors],
  );

  const handleAttachImage = async () => {
    try {
      const res = await pick({
        type: ['image/*'],
      });
      if (res && res.length > 0 && res[0].uri) {
        data.setImageUri(res[0].uri);
      }
    } catch (err: any) {
      if (err && err.code === 'DOCUMENT_PICKER_CANCELED') {
        return;
      }
      console.error('Failed to pick image:', err);
      Alert.alert('Error', 'Failed to pick image from device.');
    }
  };

  // AGY-PORT 07: notes arrive in pages; the rest stay one tap away.
  const loadMoreButton = data.hasMore ? (
    <TouchableOpacity
      style={styles.loadMore}
      onPress={data.loadMoreNotes}
      accessibilityRole="button"
      accessibilityLabel="Show more notes"
      testID="notes-load-more"
    >
      <Text style={[styles.loadMoreText, {color: colors.red}]}>
        Show more notes
      </Text>
    </TouchableOpacity>
  ) : null;

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      {/* Header */}
      <View style={styles.header}>
        {data.searchActive ? (
          <View style={[styles.searchRow, {backgroundColor: colors.inputBg}]}>
            <TextInput
              style={[styles.searchInput, {color: colors.textPrimary}]}
              placeholder={
                activeSubTab === 'todo' ? 'Search to-dos...' : 'Search notes...'
              }
              placeholderTextColor={colors.textSecondary}
              autoFocus
              value={data.searchQuery}
              onChangeText={data.setSearchQuery}
            />
            <TouchableOpacity
              onPress={() => {
                data.setSearchActive(false);
                data.setSearchQuery('');
              }}
              style={styles.headerIconBtn}
            >
              <X size={16} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>
              Notes
            </Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity
                onPress={() => data.setSearchActive(true)}
                style={styles.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel={
                  activeSubTab === 'todo' ? 'Search to-dos' : 'Search notes'
                }
                testID="notes-search-button"
              >
                <Search size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => data.setIsGridView(!data.isGridView)}
                style={styles.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel={
                  data.isGridView
                    ? 'Switch to list view'
                    : 'Switch to grid view'
                }
                testID="notes-view-toggle"
              >
                {data.isGridView ? (
                  <List size={18} color={colors.textPrimary} />
                ) : (
                  <Grid size={18} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Segmented Switcher: Notes | To-Do */}
      <View
        style={[
          styles.segmentedBar,
          {backgroundColor: colors.inputBg, borderColor: colors.border},
        ]}
        accessibilityRole="tablist"
      >
        <TouchableOpacity
          onPress={() => setActiveSubTab('notes')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeSubTab === 'notes'}}
          testID="notes-subtab-notes"
          style={[
            styles.segmentBtn,
            activeSubTab === 'notes' && {backgroundColor: colors.cardBg},
            activeSubTab === 'notes' && Shadows.card,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              {
                color:
                  activeSubTab === 'notes'
                    ? colors.textPrimary
                    : colors.textSecondary,
                fontWeight: activeSubTab === 'notes' ? '700' : '500',
              },
            ]}
          >
            Notes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveSubTab('todo')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeSubTab === 'todo'}}
          testID="notes-subtab-todo"
          style={[
            styles.segmentBtn,
            activeSubTab === 'todo' && {backgroundColor: colors.cardBg},
            activeSubTab === 'todo' && Shadows.card,
          ]}
        >
          <View style={styles.segmentLabelRow}>
            <Text
              style={[
                styles.segmentText,
                {
                  color:
                    activeSubTab === 'todo'
                      ? colors.textPrimary
                      : colors.textSecondary,
                  fontWeight: activeSubTab === 'todo' ? '700' : '500',
                },
              ]}
            >
              To-Do
            </Text>
            {todo.pendingCount > 0 ? (
              <View
                style={[
                  styles.segmentBadge,
                  {
                    backgroundColor:
                      activeSubTab === 'todo' ? Colors.red : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentBadgeText,
                    {
                      color:
                        activeSubTab === 'todo'
                          ? colors.white
                          : colors.textPrimary,
                    },
                  ]}
                >
                  {todo.pendingCount}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>

      {activeSubTab === 'todo' ? (
        <TodoListView
          undatedOpen={todo.undatedOpen}
          scheduledOpen={todo.scheduledOpen}
          completedTasks={todo.completedTasks}
          noteChecklists={todo.noteChecklists}
          allNoteChecklistCount={todo.allNoteChecklistCount}
          filter={todo.filter}
          onFilterChange={todo.setFilter}
          quickTitle={todo.quickTitle}
          onQuickTitleChange={todo.setQuickTitle}
          quickPriority={todo.quickPriority}
          onQuickPriorityChange={todo.setQuickPriority}
          onQuickAdd={todo.submitQuickAdd}
          onToggleTodo={todo.toggleTodo}
          onPressTodo={todo.openEditTodo}
          onToggleChecklistItem={todo.toggleNoteChecklistItem}
          onOpenParentNote={handleOpenParentNote}
          onOpenNewTodoModal={todo.openNewTodo}
          highlightedTaskId={todo.highlightedTaskId}
          searchQuery={data.searchQuery}
          isGridView={data.isGridView}
        />
      ) : (
        <>
          {/* Filters */}
          <NoteFilters
            selectedFilter={data.selectedFilter}
            onFilterChange={data.setSelectedFilter}
            customCategories={data.customCategories}
          />

          {data.indexing && (
            <Text
              style={[styles.notice, {color: colors.textSecondary}]}
              testID="notes-indexing"
            >
              Preparing your notes for search. More results may appear in a
              moment.
            </Text>
          )}
          {data.queryError && (
            <Text
              style={[styles.notice, {color: colors.textSecondary}]}
              testID="notes-query-error"
            >
              {data.queryError}
            </Text>
          )}

          {/* Content */}
          {data.filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <FileText
                size={48}
                color={colors.red}
                style={{marginBottom: 16}}
              />
              <Text style={[styles.emptyTitle, {color: colors.textPrimary}]}>
                No notes found
              </Text>
              <Text
                style={[styles.emptySubtitle, {color: colors.textSecondary}]}
              >
                Tap the + button below to write a new note, or use the quick
                templates below.
              </Text>
              <View style={styles.emptyStarterRow}>
                <TouchableOpacity
                  style={[
                    styles.starterChip,
                    {
                      backgroundColor: colors.cardBg,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={data.openNewNote}
                >
                  <FileText
                    size={14}
                    color={colors.red}
                    style={{marginRight: 6}}
                  />
                  <Text
                    style={[
                      styles.starterChipText,
                      {color: colors.textPrimary},
                    ]}
                  >
                    Quick Note
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.starterChip,
                    {
                      backgroundColor: colors.cardBg,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    data.openNewNote();
                    data.setNoteTitle('To-Do Checklist');
                    data.setNoteBody('- [ ] ');
                    data.setSelection({start: 6, end: 6});
                  }}
                >
                  <CheckSquare
                    size={14}
                    color={colors.blue}
                    style={{marginRight: 6}}
                  />
                  <Text
                    style={[
                      styles.starterChipText,
                      {color: colors.textPrimary},
                    ]}
                  >
                    New Checklist
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : data.isGridView ? (
            <ScrollView
              style={styles.notesListScroll}
              contentContainerStyle={[styles.notesList, styles.gridContainer]}
              scrollEnabled={!data.isDragging}
            >
              {data.filtered.map((item, index) => (
                <React.Fragment key={item.id}>
                  {hasPinned && item.id === firstPinnedId && (
                    <View style={styles.sectionHeaderRow}>
                      <Pin
                        size={11}
                        color={colors.red}
                        style={{transform: [{rotate: '45deg'}], marginRight: 6}}
                      />
                      <Text
                        style={[
                          styles.sectionHeaderText,
                          {color: colors.textSecondary},
                        ]}
                      >
                        PINNED
                      </Text>
                    </View>
                  )}
                  {hasPinned && item.id === firstOtherId && (
                    <View style={styles.sectionHeaderRow}>
                      <Text
                        style={[
                          styles.sectionHeaderText,
                          {color: colors.textSecondary},
                        ]}
                      >
                        OTHERS
                      </Text>
                    </View>
                  )}
                  {renderItem({item, index})}
                </React.Fragment>
              ))}
              {loadMoreButton}
            </ScrollView>
          ) : (
            <FlatList
              key="list"
              data={data.filtered}
              numColumns={1}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.notesList}
              scrollEnabled={!data.isDragging}
              extraData={data.renderGen}
              renderItem={renderItem}
              removeClippedSubviews={false}
              windowSize={21}
              ListFooterComponent={loadMoreButton}
            />
          )}
        </>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, Shadows.card, {bottom: fabBottom}]}
        onPress={activeSubTab === 'todo' ? todo.openNewTodo : data.openNewNote}
        testID={activeSubTab === 'todo' ? 'todo-fab-add' : 'notes-fab-add'}
      >
        <Plus size={24} color={colors.white} />
      </TouchableOpacity>

      {todo.editorVisible && (
        <TodoEditorModal
          key={todo.editingTask?.id || 'new-todo'}
          visible={todo.editorVisible}
          editingTask={todo.editingTask}
          customCategories={data.customCategories}
          onClose={todo.closeEditor}
          onAddCategory={data.addCategory}
          onSave={(draft, editing) => {
            if (editing) {
              todo.updateTodo(editing, draft);
            } else {
              todo.addTodo(draft);
            }
            todo.closeEditor();
          }}
          onDelete={todo.deleteTodo}
        />
      )}

      {/* Editor Modal */}
      {data.editorVisible && (
        <NoteEditor
          visible={data.editorVisible}
          editingNote={data.editingNote}
          noteTitle={data.noteTitle}
          noteBody={data.noteBody}
          noteCategory={data.noteCategory}
          noteTags={data.noteTags}
          isPinned={data.isPinned}
          imageUri={data.imageUri}
          selection={data.selection}
          aiLoading={data.aiLoading}
          aiActionType={data.aiActionType}
          onTitleChange={data.setNoteTitle}
          onBodyChange={data.changeBody}
          onCategoryChange={data.setNoteCategory}
          onPinToggle={() => data.setIsPinned(!data.isPinned)}
          onImageUriChange={data.setImageUri}
          onSelectionChange={data.setSelection}
          onClose={data.closeEditor}
          onSave={data.saveNote}
          onDelete={() =>
            data.editingNote && data.deleteNote(data.editingNote.id)
          }
          onFormatting={data.applyFormatting}
          onToggleChecklist={data.toggleEditorChecklist}
          onAttachImage={handleAttachImage}
          onRemoveImage={() => data.setImageUri(null)}
          onAiAction={data.triggerAiAction}
          customCategories={data.customCategories}
          onAddCategory={data.addCategory}
          onDeleteCategory={data.deleteCategory}
          onUpdateCategory={data.updateCategory}
        />
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modalFill: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    height: 40,
  },
  segmentedBar: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentText: {
    fontFamily: 'sans-serif-medium',
    fontSize: 13,
  },
  segmentBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBadgeText: {
    fontFamily: 'sans-serif-medium',
    fontSize: 10,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    borderRadius: 8,
    paddingLeft: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontFamily: 'sans-serif',
    paddingVertical: 0,
  },
  headerTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  headerIconBtn: {
    padding: 8,
    marginLeft: 8,
  },
  notesList: {
    paddingBottom: 190,
  },
  notesListScroll: {
    flex: 1,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  notice: {
    fontFamily: 'sans-serif',
    fontSize: 12,
    marginBottom: 8,
  },
  loadMore: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
  },
  loadMoreText: {
    fontFamily: 'sans-serif-medium',
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: 'sans-serif-medium',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: 'sans-serif',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyStarterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    justifyContent: 'center',
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  starterChipText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'sans-serif',
  },
  sectionHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: 'sans-serif',
  },
  cardContainerWrapper: {
    width: '100%',
  },
  fab: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
