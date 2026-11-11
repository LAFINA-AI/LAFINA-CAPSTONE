import React from 'react';
import {Text, TouchableOpacity, View, StyleSheet} from 'react-native';
import type {LocalVoiceResult} from '../../../cloud/voiceConversation/localVoiceData';
import type {CallNavigationTarget} from '../../navigation/callNavigation';
import {AgendaCard} from './cards/AgendaCard';
import {NoteResultCard} from './cards/NoteResultCard';
import {useTheme} from '../../contexts/ThemeContext';
import {Fonts, FontSize, Layout, Spacing} from '../../theme';

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
          <Text
            style={[styles.todoKicker, {color: colors.primary}]}
            accessibilityRole="header"
          >
            To-Do List ({totalCount})
          </Text>
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss to-do results"
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
            No open To-Dos or unchecked checklists.
          </Text>
        ) : (
          <View style={styles.todoList}>
            {result.todos.map(todo => (
              <Text
                key={todo.id}
                style={[styles.todoItem, {color: colors.textPrimary}]}
              >
                • {todo.title}
                {todo.dueDate
                  ? ` (${todo.dueDate}${
                      todo.dueTime ? ` ${todo.dueTime}` : ''
                    })`
                  : ' (To-Do)'}
                {todo.priority && todo.priority !== 'Medium'
                  ? ` [${todo.priority}]`
                  : ''}
              </Text>
            ))}
            {result.noteChecklists.map((c, idx) => (
              <Text
                key={`${c.noteId}-${idx}`}
                style={[styles.todoItem, {color: colors.textSecondary}]}
              >
                • {c.text} (from "{c.noteTitle}")
              </Text>
            ))}
          </View>
        )}
        {result.partial ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: FontSize.small,
              marginTop: 4,
            }}
          >
            Showing top matches; open To-Do for the full list.
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
            <Text style={{color: colors.primary}}>Open Notes → To-Do</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  if ('notes' in result && result.notes)
    return (
      <View testID="call-note-results">
        <Text style={{color: colors.textSecondary}}>
          {result.partial
            ? 'Some matches are shown; more may be available.'
            : `${result.notes.length} matching notes.`}
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
  if ('window' in result && result.window)
    return (
      <View testID="call-agenda-result">
        <AgendaCard
          onDismiss={onDismiss}
          data={{
            date:
              result.window.start === result.window.end
                ? result.window.start
                : `${result.window.start} – ${result.window.end}`,
            partial: result.partial,
            items: [
              ...result.events.map(event => ({
                id: event.id,
                title: `${event.title} (${event.date})`,
                type: 'event' as const,
                time: event.start,
                endTime: event.end,
              })),
              ...result.tasks.map(task => ({
                id: task.id,
                title: `${task.title} (${task.date || 'undated'})`,
                type: 'task' as const,
                time: task.time || undefined,
                completed: task.completed,
              })),
              ...result.blocks.map(block => ({
                id: block.id,
                title: `${block.title} (${block.date})`,
                type: 'block' as const,
                time: block.start,
                endTime: block.end,
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
            <Text style={{color: colors.primary}}>Open Calendar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  return (
    <Text style={{color: colors.textSecondary}}>
      Saved preferences retrieved.
    </Text>
  );
}
const styles = StyleSheet.create({
  link: {minHeight: 48, justifyContent: 'center'},
  todoCard: {
    borderWidth: 1,
    borderRadius: Layout.borderRadiusButton,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  todoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  todoKicker: {
    fontFamily: Fonts.heading,
    fontSize: FontSize.small,
    fontWeight: '700',
  },
  todoList: {
    gap: 4,
  },
  todoItem: {
    fontFamily: Fonts.body,
    fontSize: FontSize.body,
  },
});
