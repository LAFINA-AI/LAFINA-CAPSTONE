import React from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {MonthView} from '../../src/ui/screens/calendar/components/MonthView';
import {WeekView} from '../../src/ui/screens/calendar/components/WeekView';
import {DayView} from '../../src/ui/screens/calendar/components/DayView';
import {useSchedulePage} from '../../src/ui/screens/calendar/hooks/useSchedulePage';
import {initDatabase, type Task} from '../../src/storage';

beforeAll(async () => {
  await initDatabase();
});
const day = new Date(2030, 2, 12);
const tasks: Task[] = Array.from({length: 120}, (_, index) => ({
  id: `schedule-page-${index}`,
  userId: 'local_guest_user',
  title: `Task ${index}`,
  dueDate: '2030-03-12',
  dueTime: '16:00',
  isCompleted: false,
  priority: 'Medium',
  category: 'Personal',
  createdAt: '2030-03-01T00:00:00Z',
  updatedAt: '2030-03-01T00:00:00Z',
}));

test.each(['month', 'week', 'day'] as const)(
  '%s schedule bounds rendered rows while keeping every item reachable',
  mode => {
    const screen =
      mode === 'month' ? (
        <MonthView
          currentDate={day}
          selectedDate={day}
          weekStartsMonday={false}
          timeFormat24h={false}
          blocks={[]}
          allTasks={tasks}
          allEvents={[]}
          onDayPress={() => undefined}
          onPressItem={() => undefined}
        />
      ) : mode === 'week' ? (
        <WeekView
          selectedDate={day}
          weekDays={[day]}
          timeFormat24h={false}
          blocks={[]}
          tasks={tasks}
          events={[]}
          onSelectDate={() => undefined}
          onPressItem={() => undefined}
        />
      ) : (
        <DayView
          selectedDate={day}
          weekDays={[day]}
          timeFormat24h={false}
          blocks={[]}
          tasks={tasks}
          events={[]}
          onSelectDate={() => undefined}
          onAddBlock={() => undefined}
          onPressItem={() => undefined}
          now={day}
        />
      );
    const view = render(<ThemeProvider userId={null}>{screen}</ThemeProvider>);
    expect(view.getAllByText(/^Task \d+$/)).toHaveLength(20);
    for (let page = 1; page < 6; page += 1) {
      fireEvent.press(view.getByRole('button', {name: /Show next 20 items/}));
      expect(view.getAllByText(/^Task \d+$/)).toHaveLength((page + 1) * 20);
    }
    expect(view.queryByRole('button', {name: /Show next/})).toBeNull();
  },
);

test('page size survives an unchanged day and resets only when the selected day changes', () => {
  const {result, rerender} = renderHook(
    ({date}: {date: string}) => useSchedulePage(date, tasks),
    {initialProps: {date: '2030-03-12'}},
  );
  act(() => result.current.showMore());
  expect(result.current.items).toHaveLength(40);
  rerender({date: '2030-03-12'});
  expect(result.current.items).toHaveLength(40);
  rerender({date: '2030-03-13'});
  expect(result.current.items).toHaveLength(20);
  expect(result.current.remaining).toBe(100);
});

test('a busy hour does not hide items in later hours', () => {
  const view = render(
    <ThemeProvider userId={null}>
      <DayView
        selectedDate={day}
        weekDays={[day]}
        timeFormat24h={false}
        blocks={[]}
        tasks={[
          ...tasks,
          {...tasks[0], id: 'late-task', title: 'Late task', dueTime: '22:00'},
        ]}
        events={[]}
        onSelectDate={() => undefined}
        onAddBlock={() => undefined}
        onPressItem={() => undefined}
        now={day}
      />
    </ThemeProvider>,
  );
  expect(view.getAllByText(/^Task \d+$/)).toHaveLength(20);
  expect(view.getByText('Late task')).toBeTruthy();
});
