import {Pressable, ScrollView, Text, TextInput, View} from 'react-native';
import type {NoteDraft} from '../../core/domain/notes';
import {useTheme} from '../../core/theme/ThemeContext';
import {Icon, IconButton} from '../../core/ui/Icon';
import {Button, Choice, Field, Message} from '../../core/ui/controls';
import {styles} from './notesStyles';

export function NoteEditor({
  draft,
  existing,
  dirty,
  error,
  onChange,
  onClose,
  onRemove,
  onSave,
}: {
  draft: NoteDraft;
  existing: boolean;
  dirty: boolean;
  error: string | null;
  onChange: (patch: Partial<NoteDraft>) => void;
  onClose: () => void;
  onRemove: () => void;
  onSave: () => void;
}) {
  const {colors} = useTheme();
  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <IconButton
          name="chevron-left"
          label="Back to notes"
          onPress={onClose}
        />
        <Text
          accessibilityRole="header"
          style={[styles.editorHeading, {color: colors.text}]}
        >
          {existing ? 'Edit note' : 'New note'}
        </Text>
        {existing && (
          <IconButton name="trash" label="Remove note" onPress={onRemove} />
        )}
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.editor}
      >
        <Field
          label="Note title"
          value={draft.title}
          onChangeText={title => onChange({title})}
          maxLength={160}
        />
        <Text style={[styles.fieldLabel, {color: colors.text}]}>Note text</Text>
        <TextInput
          accessibilityLabel="Note text"
          multiline
          textAlignVertical="top"
          value={draft.body}
          onChangeText={body => onChange({body})}
          maxLength={10000}
          placeholder="Write your note…"
          placeholderTextColor={colors.muted}
          style={[
            styles.bodyInput,
            {
              color: colors.text,
              backgroundColor: colors.field,
              borderColor: colors.border,
            },
          ]}
        />
        <Choice
          label="Category"
          value={draft.category}
          options={[
            {value: 'Personal', label: 'Personal'},
            {value: 'Coursework', label: 'Coursework'},
          ]}
          onChange={category => onChange({category})}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Pin note"
          accessibilityState={{checked: draft.pinned}}
          onPress={() => onChange({pinned: !draft.pinned})}
          style={styles.pinChoice}
        >
          <Icon
            name={draft.pinned ? 'check' : 'pin'}
            size={22}
            color={colors.primary}
          />
          <Text style={[styles.bodyText, {color: colors.text}]}>
            {draft.pinned ? 'Pinned' : 'Pin note'}
          </Text>
        </Pressable>
        <Message text="Saved note text and previous saved versions stay in this phone's private app database, including after you remove a note. Removing a note hides it from Notes and Profile counts; it does not permanently erase the text." />
        {error && <Message text={error} error />}
        <Button label="Save note" onPress={onSave} />
        <Button
          label={dirty ? 'Discard changes' : 'Close editor'}
          onPress={onClose}
          secondary
        />
      </ScrollView>
    </View>
  );
}
