import {VirtualNoteGrid} from './components/VirtualNoteGrid';
import {ScreenOverlays} from '../../navigation/RetainedTab';
import {resolveCallTarget} from '../../navigation/resolveCallTarget';
import React, {useCallback, useState, useEffect, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
} from 'react-native';
import {pick} from '@react-native-documents/picker';
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
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../contexts/ThemeContext';
import {Layout, ModernLayout} from '../../theme';
import {useNotesData} from './hooks/useNotesData';
import {useTodoData} from './hooks/useTodoData';
import {
  NoteFilters,
  NoteCardWithDrag,
  TodoListView,
  TodoEditorModal,
} from './components';
import {NoteEditor} from './components/NoteEditor';
import {AlarmsView} from '../calendar/components/AlarmsView';
import {
  useSchedulePalette,
  scheduleCardShadow,
} from '../calendar/components/schedulePalette';
import {NotesScreenProps, NotesSubTab} from './types';
import type {NoteSnapshot} from '../../../storage';
import {tourTargetRef} from '../../tour/tourTargets';

export const NotesScreen = React.memo(function NotesScreenView({
  userId,
  refreshTrigger,
  onRefresh,
  openRequest,
  onOpenRequestHandled,
  tourSubTab,
}: NotesScreenProps) {
  const {colors, isModern} = useTheme();
  const insets = useSafeAreaInsets();
  const palette = useSchedulePalette();
  const tabBarClearance = isModern
    ? ModernLayout.navbarContentHeight + Math.max(insets.bottom, 8) + 40
    : Math.max(insets.bottom, 12) + 14 + Layout.navbarHeight + 8;
  const [activeSubTab, setActiveSubTab] = useState<NotesSubTab>('notes');
  const preTourSubTabRef = useRef<NotesSubTab | null>(null);

  useEffect(() => {
    if (tourSubTab) {
      if (preTourSubTabRef.current === null) {
        preTourSubTabRef.current = activeSubTab;
      }
      data.setSearchActive(false);
      data.setSearchQuery('');
      setActiveSubTab(tourSubTab);
      return;
    }
    if (preTourSubTabRef.current !== null) {
      setActiveSubTab(preTourSubTabRef.current);
      preTourSubTabRef.current = null;
    }
    // Only react to tourSubTab transitions so manual tab taps remain free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourSubTab]);
  const [alarmCreateTick, setAlarmCreateTick] = useState(0);
  const handleAddAlarm = useCallback(() => {
    setAlarmCreateTick(tick => tick + 1);
  }, []);
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
    enabled: activeSubTab === 'todo',
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
    if (
      openRequest.notesTab === 'alarms' ||
      openRequest.scheduleSection === 'alarms'
    ) {
      data.setSearchActive(false);
      data.setSearchQuery('');
      setActiveSubTab('alarms');
      return;
    }
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
    <View style={[styles.container, {backgroundColor: palette.bg}]}>
      {/* Header */}
      <View style={styles.header}>
        {data.searchActive && activeSubTab !== 'alarms' ? (
          <View
            style={[
              styles.searchRow,
              {
                backgroundColor: palette.card,
                borderColor: palette.isDarkMode
                  ? palette.border
                  : 'transparent',
                borderWidth: palette.isDarkMode ? 1 : 0,
              },
              !palette.isDarkMode && scheduleCardShadow,
            ]}
          >
            <Search
              size={16}
              color={palette.muted}
              style={styles.searchPrefixIcon}
            />
            <TextInput
              style={[styles.searchInput, {color: palette.text}]}
              placeholder={
                activeSubTab === 'todo' ? 'Search to-dos...' : 'Search notes...'
              }
              placeholderTextColor={palette.muted}
              autoFocus
              value={data.searchQuery}
              onChangeText={data.setSearchQuery}
            />
            <TouchableOpacity
              onPress={() => {
                data.setSearchActive(false);
                data.setSearchQuery('');
              }}
              style={styles.searchClearBtn}
            >
              <X size={16} color={palette.text} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[styles.headerTitle, {color: palette.text}]}>
              Tools
            </Text>
            <View style={styles.headerIcons}>
              {activeSubTab !== 'alarms' && (
                <TouchableOpacity
                  onPress={() => data.setSearchActive(true)}
                  style={[
                    styles.headerIconBtn,
                    {backgroundColor: palette.surface},
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    activeSubTab === 'todo' ? 'Search to-dos' : 'Search notes'
                  }
                  testID="notes-search-button"
                >
                  <Search size={17} color={palette.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => data.setIsGridView(!data.isGridView)}
                style={[
                  styles.headerIconBtn,
                  {backgroundColor: palette.surface},
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  data.isGridView
                    ? 'Switch to list view'
                    : 'Switch to grid view'
                }
                testID="notes-view-toggle"
              >
                {data.isGridView ? (
                  <List size={17} color={palette.text} />
                ) : (
                  <Grid size={17} color={palette.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={
                  activeSubTab === 'alarms'
                    ? handleAddAlarm
                    : activeSubTab === 'todo'
                    ? todo.openNewTodo
                    : data.openNewNote
                }
                testID={
                  activeSubTab === 'alarms'
                    ? 'alarm-add-button'
                    : activeSubTab === 'todo'
                    ? 'todo-fab-add'
                    : 'notes-fab-add'
                }
                accessibilityRole={
                  activeSubTab === 'alarms' ? 'button' : undefined
                }
                accessibilityLabel={
                  activeSubTab === 'alarms' ? 'Add alarm' : undefined
                }
                style={[styles.headerAddBtn, {backgroundColor: palette.accent}]}
              >
                <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Segmented Switcher: Alarms | Todo | Notes */}
      <View
        style={[styles.segmentedBar, {backgroundColor: palette.surface}]}
        accessibilityRole="tablist"
      >
        <TouchableOpacity
          ref={tourTargetRef('tools-subtab-alarms')}
          onPress={() => {
            data.setSearchActive(false);
            data.setSearchQuery('');
            setActiveSubTab('alarms');
          }}
          accessibilityRole="tab"
          accessibilityState={{selected: activeSubTab === 'alarms'}}
          testID="notes-subtab-alarms"
          style={[
            styles.segmentBtn,
            activeSubTab === 'alarms' && [
              styles.segmentBtnActive,
              {backgroundColor: palette.card},
              !palette.isDarkMode && scheduleCardShadow,
            ],
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              {
                color: activeSubTab === 'alarms' ? palette.text : palette.muted,
                fontWeight: activeSubTab === 'alarms' ? '700' : '500',
              },
            ]}
          >
            Alarms
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          ref={tourTargetRef('tools-subtab-todo')}
          onPress={() => setActiveSubTab('todo')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeSubTab === 'todo'}}
          testID="notes-subtab-todo"
          style={[
            styles.segmentBtn,
            activeSubTab === 'todo' && [
              styles.segmentBtnActive,
              {backgroundColor: palette.card},
              !palette.isDarkMode && scheduleCardShadow,
            ],
          ]}
        >
          <View style={styles.segmentLabelRow}>
            <Text
              style={[
                styles.segmentText,
                {
                  color: activeSubTab === 'todo' ? palette.text : palette.muted,
                  fontWeight: activeSubTab === 'todo' ? '700' : '500',
                },
              ]}
            >
              Todo
            </Text>
            {todo.pendingCount > 0 || todo.checklistsLoading ? (
              <View
                style={[
                  styles.segmentBadge,
                  {
                    backgroundColor:
                      activeSubTab === 'todo' ? palette.accent : palette.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentBadgeText,
                    {
                      color: activeSubTab === 'todo' ? '#FFFFFF' : palette.text,
                    },
                  ]}
                >
                  {todo.checklistsLoading ? '…' : todo.pendingCount}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          ref={tourTargetRef('tools-subtab-notes')}
          onPress={() => setActiveSubTab('notes')}
          accessibilityRole="tab"
          accessibilityState={{selected: activeSubTab === 'notes'}}
          testID="notes-subtab-notes"
          style={[
            styles.segmentBtn,
            activeSubTab === 'notes' && [
              styles.segmentBtnActive,
              {backgroundColor: palette.card},
              !palette.isDarkMode && scheduleCardShadow,
            ],
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              {
                color: activeSubTab === 'notes' ? palette.text : palette.muted,
                fontWeight: activeSubTab === 'notes' ? '700' : '500',
              },
            ]}
          >
            Notes
          </Text>
        </TouchableOpacity>
      </View>

      {activeSubTab === 'alarms' ? (
        <AlarmsView
          userId={userId}
          refreshTrigger={refreshTrigger}
          onRefresh={handleCombinedRefresh}
          showHeader={false}
          isGridView={data.isGridView}
          createTrigger={alarmCreateTick}
        />
      ) : activeSubTab === 'todo' ? (
        <TodoListView
          hasMoreTasks={todo.hasMoreTasks}
          onLoadMoreTasks={todo.loadMoreTasks}
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
            <View
              testID="notes-empty-state"
              style={[styles.emptyState, {paddingBottom: tabBarClearance}]}
            >
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
            <VirtualNoteGrid
              items={data.filtered}
              renderItem={renderItem}
              scrollEnabled={!data.isDragging}
              footer={loadMoreButton}
              generation={data.renderGen}
              showSections={!hasSearch}
            />
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
              initialNumToRender={12}
              maxToRenderPerBatch={6}
              windowSize={7}
              ListFooterComponent={loadMoreButton}
            />
          )}
        </>
      )}

      <ScreenOverlays>
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
      </ScreenOverlays>
    </View>
  );
});

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
    marginBottom: 12,
    height: 44,
  },
  segmentedBar: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    borderRadius: 12,
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
    height: 42,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchPrefixIcon: {
    marginRight: 8,
  },
  searchClearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontFamily: 'sans-serif',
    paddingVertical: 0,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
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
});
