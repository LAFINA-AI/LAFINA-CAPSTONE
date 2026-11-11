import React from 'react';
import {Text, TouchableOpacity, View, StyleSheet} from 'react-native';
import type {LocalVoiceResult} from '../../../cloud/voiceConversation/localVoiceData';
import type {CallNavigationTarget} from '../../navigation/callNavigation';
import {AgendaCard} from './cards/AgendaCard';
import {NoteResultCard} from './cards/NoteResultCard';
import {useTheme} from '../../contexts/ThemeContext';

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
  if (result.notes)
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
  if (result.window)
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
});
