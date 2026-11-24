import React from 'react';
import {Text, TouchableOpacity, View, StyleSheet} from 'react-native';
import {Circle, ListChecks, NotebookPen} from 'lucide-react-native';
import type {LocalVoiceResult} from '../../../cloud/voiceConversation/localVoiceData';
import type {CallNavigationTarget} from '../../navigation/callNavigation';
import {AgendaCard} from './cards/AgendaCard';
import {NoteResultCard} from './cards/NoteResultCard';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';
import {mixColors} from '../../theme/colorMix';
import {shortDate, time12} from './cards/cardFormat';

export function CallReadResults({
  result,
  ownerId,
  onDismiss,
  onNavigate,
}: {
  result: LocalVoiceResult;
  ownerId: string;
  onDismiss: () => void;
  onNavigate?: (target: CallNavigationTarget) => void;
}) {
  const {colors} = useTheme();
  if (typeof result === 'string')
    return <Text style={{color: colors.textPrimary}}>{result}</Text>;
  if ('todos' in result && result.todos) {
    const totalCount =
      result.todos.length + (result.noteChecklists?.length || 0);
    return (
      <View
        testID="call-todo-results"
        style={[
          styles.todoCard,
          {backgroundColor: colors.surface, borderColor: colors.primary},
        ]}
      >
        <View style={styles.todoHeader}>
          <ListChecks size={16} color={colors.primary} />
          <Text
            style={[styles.todoKicker, {color: colors.primary}]}
            accessibilityRole="header"
          >
            To-Do List
          </Text>
          <View
            style={[
              styles.countPill,
              {
                backgroundColor: mixColors(
                  colors.primary,
                  colors.surface,
                  0.14,
                ),
              },
            ]}
          >
            <Text style={[styles.countPillText, {color: colors.primary}]}>
              {totalCount}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss to-do results"
            style={styles.dismissLink}
          >
            <Text
              style={{color: colors.textSecondary, fontSize: FontSize.small}}
            >
              Dismiss
            </Text>
          </TouchableOpacity>
        </View>
        {totalCount === 0 ? (
          <Text style={{color: colors.textSecondary, fontSize: FontSize.small}}>
            Nothing left to do. Nice!
          </Text>
        ) : (
          <View style={styles.todoList}>
            {result.todos.map(todo => {
              const due = todo.dueDate
                ? `${shortDate(todo.dueDate)}${
                    todo.dueTime ? ` · ${time12(todo.dueTime)}` : ''
                  }`
                : 'No due date';
              const flag =
                todo.priority && todo.priority !== 'Medium'
                  ? todo.priority
                  : null;
              const flagInk =
                flag === 'High' ? colors.error : colors.textSecondary;
              return (
                <View key={todo.id} style={styles.todoRow}>
                  <Circle
                    size={16}
                    color={colors.textSecondary}
                    style={styles.todoIcon}
                  />
                  <View style={styles.todoTextCol}>
                    <Text
                      style={[styles.todoTitle, {color: colors.textPrimary}]}
                    >
                      {todo.title}
                    </Text>
                    <View style={styles.todoMetaRow}>
                      <Text
                        style={[styles.todoMeta, {color: colors.textSecondary}]}
                      >
                        {due}
                      </Text>
                      {flag ? (
                        <View
                          style={[
                            styles.flagPill,
                            {
                              backgroundColor: mixColors(
                                flagInk,
                                colors.surface,
                                0.14,
                              ),
                            },
                          ]}
                        >
                          <Text style={[styles.flagText, {color: flagInk}]}>
                            {flag}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
            {result.noteChecklists.map((c, idx) => (
              <View key={`${c.noteId}-${idx}`} style={styles.todoRow}>
                <NotebookPen
                  size={16}
                  color={colors.textSecondary}
                  style={styles.todoIcon}
                />
                <View style={styles.todoTextCol}>
                  <Text style={[styles.todoTitle, {color: colors.textPrimary}]}>
                    {c.text}
                  </Text>
                  <Text
                    style={[styles.todoMeta, {color: colors.textSecondary}]}
                  >
                    From note: <Text style={styles.bold}>{c.noteTitle}</Text>
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {result.partial ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: FontSize.small,
              marginTop: 6,
            }}
          >
            Showing the top items. Open To-Do to see them all.
          </Text>
        ) : null}
        {onNavigate && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open Notes To-Do"
            style={styles.link}
            onPress={() =>
              onNavigate({
                ownerId,
                screen: 'notes',
                notesTab: 'todo',
              })
            }
          >
            <Text style={[styles.linkText, {color: colors.primary}]}>
              Open To-Do →
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if ('notes' in result && result.notes)
    return (
      <View testID="call-note-results">
        <Text style={[styles.resultsLead, {color: colors.textSecondary}]}>
          {result.partial
            ? 'Here are the best matches.'
            : `${result.notes.length} ${
                result.notes.length === 1 ? 'note' : 'notes'
              } found`}
        </Text>
        {result.notes.map(note => (
          <NoteResultCard
            key={note.id}
            data={{
              noteId: note.id,
              title: note.title,
              excerpt: note.body,
              updatedAt: note.updatedAt,
              category: note.category,
            }}
            onDismiss={onDismiss}
            onOpenNote={
              onNavigate
                ? id =>
                    onNavigate({
                      ownerId,
                      screen: 'notes',
                      entityKind: 'note',
                      entityId: id,
                    })
                : undefined
            }
          />
        ))}
      </View>
    );
  if ('window' in result && result.window) {
    const singleDay = result.window.start === result.window.end;
    return (
      <View testID="call-agenda-result">
        <AgendaCard
          onDismiss={onDismiss}
          data={{
            date: singleDay
              ? shortDate(result.window.start)
              : `${shortDate(result.window.start)} – ${shortDate(
                  result.window.end,
                )}`,
            partial: result.partial,
            items: [
              ...result.events.map(event => ({
                id: event.id,
                title: event.title,
                meta: singleDay ? undefined : shortDate(event.date),
                type: 'event' as const,
                time: event.start ? time12(event.start) : undefined,
                endTime: event.end ? time12(event.end) : undefined,
              })),
              ...result.tasks.map(task => ({
                id: task.id,
                title: task.title,
                meta: task.date
                  ? singleDay
                    ? 'Task'
                    : `Task · due ${shortDate(task.date)}`
                  : 'Task · no due date',
                type: 'task' as const,
                time: task.time ? time12(task.time) : undefined,
                completed: task.completed,
              })),
              ...result.blocks.map(block => ({
                id: block.id,
                title: block.title,
                meta: singleDay
                  ? 'Study block'
                  : `Study block · ${shortDate(block.date)}`,
                type: 'block' as const,
                time: block.start ? time12(block.start) : undefined,
                endTime: block.end ? time12(block.end) : undefined,
              })),
            ],
          }}
        />
        {onNavigate && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open agenda in Calendar"
            style={styles.link}
            onPress={() =>
              onNavigate({
                ownerId,
                screen: 'calendar',
                date: result.window.start,
              })
            }
          >
            <Text style={[styles.linkText, {color: colors.primary}]}>
              Open Calendar →
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  return (
    <Text style={{color: colors.textSecondary}}>
      Your saved preferences are ready.
    </Text>
  );
}
const styles = StyleSheet.create({
  link: {minHeight: 44, justifyContent: 'center'},
  linkText: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  bold: {fontWeight: '700'},
  resultsLead: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
    marginBottom: 4,
  },
  todoCard: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  todoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  todoKicker: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countPillText: {
    fontFamily: Fonts.body,
    fontSize: 11.5,
    fontWeight: '700',
  },
  dismissLink: {
    marginLeft: 'auto',
  },
  todoList: {
    gap: 10,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  todoIcon: {
    marginTop: 2,
  },
  todoTextCol: {
    flex: 1,
    gap: 2,
  },
  todoTitle: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  todoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todoMeta: {
    fontFamily: Fonts.body,
    fontSize: FontSize.small,
  },
  flagPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  flagText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    fontWeight: '700',
  },
});
