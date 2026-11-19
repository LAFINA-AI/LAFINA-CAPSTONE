import React, {useEffect, useState} from 'react';
import {Alert, NativeModules, Switch, Text, View} from 'react-native';
import {notesEditStore} from '../../../storage/notesEditStore';
import {tasksStore} from '../../../storage/tasksStore';
import {db} from '../../../storage/database';
import {useMeetings} from '../../contexts/MeetingsContext';
import {requireStudyOnline} from '../../../skills/studyAi';
import {SKILLS_CAPABILITIES} from '../../../skills/skillsCapabilities';
import {STATUS_LABELS, transcriptToText} from '../../../meetings';
import {generateId} from '../../../utils';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

export function MeetingsSkill({
  userId,
  onSaved,
}: {
  userId: string;
  onSaved: () => void;
}) {
  const p = useSkillsPalette();
  const reduced = useReducedMotion();
  const meetings = useMeetings();
  const [title, setTitle] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [levels, setLevels] = useState<number[]>([]);
  const recording = meetings.recorder;
  const recordingId = recording?.meetingId;
  const open = meetings.meetings.find(m => m.id === (openId ?? recordingId));
  useEffect(() => {
    if (!recordingId || reduced) return;
    let alive = true;
    let waiting = false;
    const interval = setInterval(() => {
      const native = NativeModules.LafinaSkillsFiles as {
        recordingLevel?: () => Promise<number>;
      };
      if (!native?.recordingLevel || waiting) return;
      waiting = true;
      void native
        .recordingLevel()
        .then(level => {
          if (alive)
            setLevels(old => [
              ...old.slice(-31),
              Math.max(0, Math.min(1, level)),
            ]);
        })
        .catch(() => undefined)
        .finally(() => {
          waiting = false;
        });
    }, 150);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [recordingId, reduced]);
  const run = (operation: () => Promise<unknown>) => {
    setNotice('');
    void operation().catch(e => setNotice((e as Error).message));
  };
  const saveTranscript = () => {
    if (!open?.transcript?.length) return;
    try {
      notesEditStore.create({
        id: generateId('note'),
        userId,
        title: open.title,
        body: transcriptToText(open.transcript, {timestamps: true}),
        category: 'Learning',
        tags: ['AI Transcribed', 'Transcript'],
        isVoiceTranscribed: true,
        isPinned: false,
      });
      setNotice('Saved to Notes · AI Transcribed.');
      onSaved();
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const addTodos = () => {
    const items = open?.notes?.action_items.filter(i => i.task.trim()) ?? [];
    if (!items.length) return;
    Alert.alert(
      'Add detected to-dos?',
      `Review these ${items.length} items:\n\n${items
        .map(i => `• ${i.task}`)
        .join('\n')}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Add to To-do',
          onPress: () => {
            try {
              db.transactionSync(tx => {
                items.forEach(item =>
                  tasksStore.insertTask(
                    {
                      id: generateId('task'),
                      userId,
                      title: item.task,
                      isCompleted: item.status === 'done',
                      priority: 'Medium',
                      category: 'Learning',
                      notes: `From meeting: ${open?.title}${
                        item.deadline
                          ? ` · Mentioned deadline: ${item.deadline}`
                          : ''
                      }`,
                      dueDate: null,
                      dueTime: null,
                    },
                    tx,
                  ),
                );
              });
              setNotice('Added to your existing To-do list.');
              onSaved();
            } catch (e) {
              setNotice((e as Error).message);
            }
          },
        },
      ],
    );
  };
  const seconds = Math.floor((recording?.elapsedMs ?? 0) / 1000);
  return (
    <>
      {!recording ? (
        <SkillCard>
          <SkillText strong size={22}>
            Capture the important parts
          </SkillText>
          <SkillText muted>
            Record, transcribe and turn next steps into to-dos.
          </SkillText>
          <SkillInput
            label="Meeting title"
            placeholder="Give this recording a name"
            value={title}
            maxLength={120}
            onChangeText={setTitle}
          />
          <SkillButton
            disabled={!meetings.available || Boolean(meetings.processing)}
            label="Start recording"
            onPress={() => {
              setOpenId(null);
              setLevels([]);
              run(() => meetings.startRecording({title}));
            }}
          />
          {!meetings.available && (
            <SkillText muted>
              Recording is unavailable in this build. Your saved transcripts are
              still available.
            </SkillText>
          )}
          <SkillButton
            secondary
            label="Import audio"
            disabled={Boolean(meetings.processing)}
            onPress={() =>
              run(async () => {
                const id = await meetings.importAudio();
                if (id) setOpenId(id);
              })
            }
          />
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText>Keep audio after transcription</SkillText>
              <SkillText muted size={12}>
                Off removes audio after a successful transcript.
              </SkillText>
            </View>
            <Switch
              hitSlop={12}
              accessibilityLabel="Keep meeting audio after transcription"
              value={meetings.keepAudio}
              onValueChange={meetings.setKeepAudio}
              trackColor={{true: p.accent, false: p.border}}
            />
          </View>
          <SkillText muted size={12}>
            Recording starts only after you tap and allow microphone access.
            Audio and Whisper transcription stay on this phone.
          </SkillText>
        </SkillCard>
      ) : (
        <SkillCard style={{paddingVertical: 28}}>
          <SkillText strong center size={14}>
            {recording.status === 'paused' ? 'PAUSED' : 'RECORDING'}
          </SkillText>
          <Text
            style={{
              fontFamily: SkillFonts.semibold,
              color: p.text,
              fontSize: 48,
              textAlign: 'center',
              fontVariant: ['tabular-nums'],
            }}
          >
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </Text>
          {!reduced && (
            <View
              accessible={false}
              style={{
                height: 64,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              {levels.map((level, i) => (
                <View
                  key={i}
                  style={{
                    width: 5,
                    height: Math.max(3, level * 64),
                    borderRadius: 3,
                    backgroundColor: p.accent,
                  }}
                />
              ))}
            </View>
          )}
          <View style={ui.row}>
            <View style={ui.fill}>
              <SkillButton
                secondary
                disabled={
                  recording.status === 'starting' ||
                  recording.status === 'stopping'
                }
                label={recording.status === 'paused' ? 'Resume' : 'Pause'}
                onPress={() =>
                  run(
                    recording.status === 'paused'
                      ? meetings.resumeRecording
                      : meetings.pauseRecording,
                  )
                }
              />
            </View>
            <View style={ui.fill}>
              <SkillButton
                disabled={
                  recording.status === 'starting' ||
                  recording.status === 'stopping'
                }
                label="Stop & transcribe"
                onPress={() => {
                  setOpenId(recording.meetingId);
                  run(meetings.stopRecording);
                }}
              />
            </View>
          </View>
          <SkillButton
            secondary
            label="Discard recording"
            onPress={() =>
              Alert.alert(
                'Discard recording?',
                'This recording will be deleted.',
                [
                  {text: 'Keep recording', style: 'cancel'},
                  {
                    text: 'Discard',
                    style: 'destructive',
                    onPress: () => run(meetings.discardRecording),
                  },
                ],
              )
            }
          />
        </SkillCard>
      )}
      {meetings.recorderError && (
        <SkillCard>
          <SkillText strong>Recording needs attention</SkillText>
          <SkillText>{meetings.recorderError.message}</SkillText>
          <SkillButton
            secondary
            label="Dismiss recording message"
            onPress={meetings.clearRecorderError}
          />
        </SkillCard>
      )}
      <SkillCard>
        <SkillText strong size={17}>
          {recording ? 'Live transcript' : 'Transcript'}
        </SkillText>
        {recording && !SKILLS_CAPABILITIES.liveMeetingTranscript && (
          <SkillText muted>
            Live transcription is not available with this recorder. Your
            transcript will appear after you stop.
          </SkillText>
        )}
        {open?.transcript?.length ? (
          <>
            <SkillText>
              {transcriptToText(open.transcript, {timestamps: true})}
            </SkillText>
            <SkillButton
              secondary
              label="Save transcript to notes"
              onPress={saveTranscript}
            />
            <SkillButton
              secondary
              label="Summarize & detect to-dos with LAFINA"
              disabled={Boolean(meetings.processing) || Boolean(recording)}
              onPress={() =>
                run(async () => {
                  await requireStudyOnline(userId);
                  await meetings.generateNotes(open.id);
                })
              }
            />
          </>
        ) : (
          <SkillText muted>
            {meetings.processing?.message ??
              'Your transcript will appear here.'}
          </SkillText>
        )}
        {meetings.processing && (
          <>
            <SkillText muted>
              {meetings.processing.percent}% · {meetings.processing.message}
            </SkillText>
            <SkillButton
              secondary
              label="Cancel processing"
              onPress={meetings.cancelProcessing}
            />
          </>
        )}
        {open?.errorCode && (
          <>
            <SkillText muted>
              {open.errorDetail || open.errorCode.replace(/_/g, ' ')}
            </SkillText>
            <SkillButton
              secondary
              label="Retry transcription"
              disabled={Boolean(recording) || Boolean(meetings.processing)}
              onPress={() => run(() => meetings.transcribeMeeting(open.id))}
            />
          </>
        )}
      </SkillCard>
      {open?.notes && (
        <SkillCard>
          <SkillText strong size={17}>
            Summary
          </SkillText>
          <SkillText>{open.notes.summary}</SkillText>
          <SkillText strong>Detected to-dos</SkillText>
          {open.notes.action_items.map((item, i) => (
            <SkillText key={i}>• {item.task}</SkillText>
          ))}
          {!open.notes.action_items.length && (
            <SkillText muted>No action items detected.</SkillText>
          )}
          <SkillButton
            label="Review & add to To-do"
            disabled={!open.notes.action_items.length}
            onPress={addTodos}
          />
        </SkillCard>
      )}
      {!!notice && <SkillText muted>{notice}</SkillText>}
      <View style={ui.section}>
        <SkillText strong size={17}>
          Recent meetings
        </SkillText>
      </View>
      {!meetings.meetings.length && (
        <SkillText muted>No recordings yet.</SkillText>
      )}
      {meetings.meetings.map(m => (
        <SkillCard key={m.id}>
          <View style={ui.between}>
            <View style={ui.fill}>
              <SkillText strong>{m.title}</SkillText>
              <SkillText muted size={12}>
                {new Date(m.startedAt).toLocaleDateString()} ·{' '}
                {Math.round(m.durationSeconds / 60)} min
              </SkillText>
            </View>
            <SkillText muted size={12}>
              {STATUS_LABELS[m.status]}
            </SkillText>
          </View>
          <SkillButton
            secondary
            label={`Open ${m.title}`}
            onPress={() => {
              setOpenId(m.id);
              setNotice('');
            }}
          />
          <SkillButton
            secondary
            label={`Delete ${m.title}`}
            disabled={Boolean(recording) || Boolean(meetings.processing)}
            onPress={() =>
              Alert.alert('Delete meeting?', m.title, [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => run(() => meetings.deleteMeeting(m.id)),
                },
              ])
            }
          />
        </SkillCard>
      ))}
    </>
  );
}
