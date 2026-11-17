/**
 * Floating LAFINA FLOAT-01 (J-07): memory-only presence and "View in LAFINA"
 * hand-off between the Quick Chat root and the main app.
 */
import {
  QUICK_CHAT_SETTLE_FALLBACK_MS,
  quickChatPresence,
} from '../../src/ui/quickChat/quickChatPresence';

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

describe('deferWhileOpening (open-speed fix: the hidden main screen waits)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('runs at once when Quick Chat is not open', () => {
    const task = jest.fn();
    quickChatPresence.deferWhileOpening(task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test('while opening, waits for the panel to appear, then runs once', () => {
    const task = jest.fn();
    quickChatPresence.setOpen(true);
    quickChatPresence.deferWhileOpening(task);
    expect(task).not.toHaveBeenCalled();
    quickChatPresence.markPanelShown();
    expect(task).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(QUICK_CHAT_SETTLE_FALLBACK_MS * 2);
    quickChatPresence.markPanelShown();
    expect(task).toHaveBeenCalledTimes(1);
    // Once the panel is up, later work is not held.
    const later = jest.fn();
    quickChatPresence.deferWhileOpening(later);
    expect(later).toHaveBeenCalledTimes(1);
  });

  test('runs by the fallback time if the panel never reports', () => {
    const task = jest.fn();
    quickChatPresence.setOpen(true);
    quickChatPresence.deferWhileOpening(task);
    jest.advanceTimersByTime(QUICK_CHAT_SETTLE_FALLBACK_MS - 1);
    expect(task).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test('dropped when Quick Chat closes first, or when cancelled', () => {
    const closed = jest.fn();
    const cancelled = jest.fn();
    quickChatPresence.setOpen(true);
    quickChatPresence.deferWhileOpening(closed);
    const cancel = quickChatPresence.deferWhileOpening(cancelled);
    cancel();
    quickChatPresence.setOpen(false);
    jest.advanceTimersByTime(QUICK_CHAT_SETTLE_FALLBACK_MS * 2);
    quickChatPresence.markPanelShown();
    expect(closed).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });

  test('a reopen holds work again until that panel appears', () => {
    quickChatPresence.setOpen(true);
    quickChatPresence.markPanelShown();
    quickChatPresence.setOpen(false);
    quickChatPresence.setOpen(true);
    const task = jest.fn();
    quickChatPresence.deferWhileOpening(task);
    expect(task).not.toHaveBeenCalled();
    quickChatPresence.markPanelShown();
    expect(task).toHaveBeenCalledTimes(1);
  });

  test('a failing task is contained', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const next = jest.fn();
    quickChatPresence.setOpen(true);
    quickChatPresence.deferWhileOpening(() => {
      throw new Error('bad');
    });
    quickChatPresence.deferWhileOpening(next);
    quickChatPresence.markPanelShown();
    expect(next).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
