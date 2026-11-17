/**
 * Floating LAFINA FLOAT-01 (J-07): memory-only presence and "View in LAFINA"
 * hand-off between the Quick Chat root and the main app.
 */
import {quickChatPresence} from '../../src/ui/quickChat/quickChatPresence';

beforeEach(() => quickChatPresence.resetForTests());

test('open state notifies only on change', () => {
  const listener = jest.fn();
  const unsubscribe = quickChatPresence.subscribe(listener);
  expect(quickChatPresence.isOpen()).toBe(false);
  quickChatPresence.setOpen(true);
  quickChatPresence.setOpen(true);
  expect(quickChatPresence.isOpen()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  quickChatPresence.setOpen(false);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  quickChatPresence.setOpen(true);
  expect(listener).toHaveBeenCalledTimes(2);
});

test('a navigation request is consumed once, by its owner', () => {
  quickChatPresence.requestNavigation({
    ownerId: 'owner-a',
    screen: 'calendar',
    date: '2026-11-20',
  });
  expect(quickChatPresence.hasPendingNavigation()).toBe(true);
  expect(quickChatPresence.consumeNavigation('owner-a')).toEqual({
    ownerId: 'owner-a',
    screen: 'calendar',
    date: '2026-11-20',
  });
  expect(quickChatPresence.consumeNavigation('owner-a')).toBeNull();
});

test('another owner never receives the request, and it is discarded', () => {
  quickChatPresence.requestNavigation({ownerId: 'owner-a', screen: 'notes'});
  expect(quickChatPresence.consumeNavigation('owner-b')).toBeNull();
  expect(quickChatPresence.hasPendingNavigation()).toBe(false);
  expect(quickChatPresence.consumeNavigation('owner-a')).toBeNull();

  quickChatPresence.requestNavigation({ownerId: 'owner-a', screen: 'notes'});
  expect(quickChatPresence.consumeNavigation(null)).toBeNull();
  expect(quickChatPresence.hasPendingNavigation()).toBe(false);
});

test('a newer request replaces an older one; the stored copy is not shared', () => {
  const target = {ownerId: 'owner-a', screen: 'notes' as const};
  quickChatPresence.requestNavigation(target);
  quickChatPresence.requestNavigation({ownerId: 'owner-a', screen: 'calendar'});
  target.screen = 'chat' as never;
  expect(quickChatPresence.consumeNavigation('owner-a')?.screen).toBe(
    'calendar',
  );
});

test('a throwing listener does not stop the others', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const good = jest.fn();
  quickChatPresence.subscribe(() => {
    throw new Error('bad');
  });
  quickChatPresence.subscribe(good);
  quickChatPresence.setOpen(true);
  expect(good).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
