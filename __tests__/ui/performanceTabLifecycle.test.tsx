import React, {useEffect, useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {act, fireEvent, render} from '@testing-library/react-native';
import {RetainedTab} from '../../src/ui/navigation/RetainedTab';
import {db, initDatabase} from '../../src/storage';
import {NativeModules} from 'react-native';
import {preparePerformanceFixture} from '../../src/utils/performanceFixture';
import {CalendarScreen} from '../../src/ui/screens/calendar';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {plannerQueries} from '../../src/storage/plannerQueries';
import {useTodoData} from '../../src/ui/screens/notes/hooks/useTodoData';
import {renderHook} from '@testing-library/react-native';

const tables = ['notes'];
beforeAll(async () => {
  await initDatabase();
});

test('visited tabs retain state, clean up hidden effects, and reset across owners', async () => {
  const initialize = jest.fn();
  const connect = jest.fn();
  const disconnect = jest.fn();
  function Screen() {
    const [count, setCount] = useState(() => {
      initialize();
      return 0;
    });
    useEffect(() => {
      connect();
      return disconnect;
    }, []);
    return (
      <TouchableOpacity
        testID="increment"
        onPress={() => setCount(value => value + 1)}
      >
        <Text>{count}</Text>
      </TouchableOpacity>
    );
  }
  const ui = (owner: string, active: boolean) => (
    <View>
      <RetainedTab key={owner} active={active} tables={tables}>
        <Screen />
      </RetainedTab>
    </View>
  );
  const view = render(ui('a', false));
  expect(initialize).not.toHaveBeenCalled();
  await act(async () => {
    view.rerender(ui('a', true));
  });
  fireEvent.press(view.getByTestId('increment'));
  expect(view.getByText('1')).toBeTruthy();
  await act(async () => {
    view.rerender(ui('a', false));
  });
  expect(disconnect).toHaveBeenCalledTimes(1);
  await act(async () => {
    view.rerender(ui('a', true));
  });
  expect(view.getByText('1')).toBeTruthy();
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(connect).toHaveBeenCalledTimes(2);
  await act(async () => {
    view.rerender(ui('b', true));
  });
  expect(view.getByText('0')).toBeTruthy();
});

test('only committed table changes invalidate subscribers; rollback leaves revisions intact', async () => {
  db.executeSync(
    'CREATE TABLE IF NOT EXISTS perf_revision_probe (id TEXT PRIMARY KEY)',
  );
  const before = db.getDataRevision(['perf_revision_probe']);
  const listener = jest.fn();
  const unsubscribe = db.subscribeDataChanges(listener);
  await act(async () => {
    expect(() =>
      db.transactionSync(tx => {
        tx.executeSync('INSERT INTO perf_revision_probe (id) VALUES (?)', [
          'rollback',
        ]);
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
  });
  expect(db.getDataRevision(['perf_revision_probe'])).toBe(before);
  const other = db.getDataRevision(['notes']);
  await act(async () => {
    db.transactionSync(tx => {
      tx.executeSync('INSERT INTO perf_revision_probe (id) VALUES (?)', [
        'commit-a',
      ]);
      tx.executeSync('INSERT INTO perf_revision_probe (id) VALUES (?)', [
        'commit-b',
      ]);
    });
  });
  expect(db.getDataRevision(['perf_revision_probe'])).toBeGreaterThan(before);
  expect(db.getDataRevision(['notes'])).toBe(other);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  db.executeSync('DROP TABLE perf_revision_probe');
});

test('synthetic fixture is opt-in, complete and idempotent', async () => {
  const previous = NativeModules.CapstoneBuild;
  try {
    NativeModules.CapstoneBuild = {performanceHarnessEnabled: false};
    preparePerformanceFixture();
    expect(
      db.executeSync(
        "SELECT COUNT(*) AS n FROM tasks WHERE id LIKE 'perf-task-%'",
      ).rows[0].n,
    ).toBe(0);
    NativeModules.CapstoneBuild = {performanceHarnessEnabled: true};
    await act(async () => {
      preparePerformanceFixture();
    });
    expect(
      db.executeSync(
        "SELECT COUNT(*) AS n FROM tasks WHERE id LIKE 'perf-task-%'",
      ).rows[0].n,
    ).toBe(500);
    expect(
      db.executeSync(
        "SELECT COUNT(*) AS n FROM notes WHERE id LIKE 'perf-note-%'",
      ).rows[0].n,
    ).toBe(100);
    expect(
      db.executeSync(
        "SELECT COUNT(*) AS n FROM messages WHERE id LIKE 'perf-message-%'",
      ).rows[0].n,
    ).toBe(80);
    await act(async () => {
      preparePerformanceFixture();
    });
    expect(
      db.executeSync(
        "SELECT COUNT(*) AS n FROM tasks WHERE id LIKE 'perf-task-%'",
      ).rows[0].n,
    ).toBe(500);
  } finally {
    NativeModules.CapstoneBuild = previous;
  }
});

test('warm Calendar activation reuses its planner snapshot', async () => {
  const refresh = jest.fn();
  const spy = jest.spyOn(plannerQueries, 'window');
  const calendarTables = [
    'tasks',
    'events',
    'time_blocks',
    'reminders',
    'local_settings',
  ];
  const ui = (active: boolean) => (
    <ThemeProvider userId="local_guest_user">
      <RetainedTab active={active} tables={calendarTables}>
        <CalendarScreen
          userId="local_guest_user"
          refreshTrigger={0}
          onRefresh={refresh}
        />
      </RetainedTab>
    </ThemeProvider>
  );
  try {
    const view = render(ui(true));
    await act(async () => {
      await Promise.resolve();
    });
    const initialReads = spy.mock.calls.length;
    expect(initialReads).toBeGreaterThan(0);
    await act(async () => {
      view.rerender(ui(false));
    });
    await act(async () => {
      view.rerender(ui(true));
    });
    expect(spy).toHaveBeenCalledTimes(initialReads);
  } finally {
    spy.mockRestore();
  }
});

test('Notes needs only task counts; To-Do rows are paged and search reaches later pages', async () => {
  const userId = 'perf-page-owner';
  const now = new Date().toISOString();
  await act(async () => {
    db.executeSync(
      "INSERT INTO users (id, username, role, created_at, updated_at) VALUES (?, ?, 'guest', ?, ?)",
      [userId, userId, now, now],
    );
    db.transactionSync(tx => {
      for (let i = 0; i < 150; i++)
        tx.executeSync(
          "INSERT INTO tasks (id, user_id, title, is_completed, priority, category, created_at, updated_at) VALUES (?, ?, ?, 0, 'Medium', 'Personal', ?, ?)",
          [
            `page-task-${i}`,
            userId,
            i === 149 ? 'Find this later task' : `Task ${i}`,
            now,
            now,
          ],
        );
    });
  });
  const {result, rerender} = renderHook(
    ({enabled, search}: {enabled: boolean; search: string}) =>
      useTodoData({
        userId,
        enabled,
        searchQuery: search,
        refreshTrigger: 0,
        onRefresh: () => undefined,
      }),
    {initialProps: {enabled: false, search: ''}},
  );
  expect(result.current.tasks).toHaveLength(0);
  expect(result.current.pendingCount).toBe(150);
  rerender({enabled: true, search: ''});
  expect(result.current.tasks).toHaveLength(100);
  expect(result.current.hasMoreTasks).toBe(true);
  act(() => result.current.loadMoreTasks());
  expect(result.current.tasks).toHaveLength(150);
  expect(result.current.hasMoreTasks).toBe(false);
  rerender({enabled: true, search: 'Find this later task'});
  expect(result.current.tasks).toHaveLength(1);
  expect(result.current.tasks[0].title).toBe('Find this later task');
});
