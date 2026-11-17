import {NativeModules} from 'react-native';
import {db, userStore, chatStore} from '../storage';

/** Isolated .performance APK only: repeatable synthetic data, no cloud account. */
export function preparePerformanceFixture(): void {
  if (NativeModules.CapstoneBuild?.performanceHarnessEnabled !== true) return;
  const user = userStore.createGuestUser();
  userStore.setCurrentUser(user.id);
  userStore.markOnboardingComplete(user.id);
  if (
    db.executeSync("SELECT id FROM tasks WHERE id = 'perf-task-0'").rows.length
  )
    return;
  const now = new Date().toISOString();
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(today.getDate()).padStart(2, '0')}`;
  const session = chatStore.currentSessionId(user.id);
  db.transactionSync(tx => {
    for (let i = 0; i < 500; i++)
      tx.executeSync(
        'INSERT INTO tasks (id, user_id, title, due_date, due_time, is_completed, priority, category, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `perf-task-${i}`,
          user.id,
          `Synthetic assignment ${i}`,
          i % 3 ? date : null,
          '16:00',
          i % 5 === 0 ? 1 : 0,
          'Medium',
          'Personal',
          'Synthetic performance fixture',
          now,
          now,
        ],
      );
    for (let i = 0; i < 100; i++)
      tx.executeSync(
        'INSERT INTO notes (id, user_id, title, body, is_pinned, tags, category, is_voice_transcribed, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `perf-note-${i}`,
          user.id,
          `Synthetic note ${i}`,
          `# Lecture ${i}\n- [ ] Review chapter\n- [x] Read introduction\n${'Sample academic material for layout and search. '.repeat(
            80,
          )}`,
          i < 4 ? 1 : 0,
          '[]',
          'Personal',
          0,
          i,
          now,
          now,
        ],
      );
    for (let i = 0; i < 32; i++)
      tx.executeSync(
        'INSERT INTO time_blocks (id, user_id, title, date, start_time, end_time, color, category, recurrence_rule, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          `perf-block-${i}`,
          user.id,
          `Synthetic class ${i}`,
          date,
          `${String(7 + (i % 10)).padStart(2, '0')}:00`,
          `${String(8 + (i % 10)).padStart(2, '0')}:00`,
          '#4F7CAC',
          'Class',
          'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
          now,
          now,
        ],
      );
    for (let i = 0; i < 80; i++)
      tx.executeSync(
        'INSERT INTO messages (id, session_id, sender, content, seq, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          `perf-message-${i}`,
          session,
          i % 2 ? 'assistant' : 'user',
          i % 2
            ? `## Reply ${i}\n${'Synthetic answer text. '.repeat(
                20,
              )}\n- A useful point\n- Another point`
            : `Synthetic question ${i}`,
          i + 1,
          now,
          now,
        ],
      );
  });
}
