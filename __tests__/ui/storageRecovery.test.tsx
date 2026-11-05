/**
 * AGY-PORT 01: when local storage cannot be trusted the student sees that, nothing
 * pretends to save, and retrying is safe.
 */
import React from 'react';
import {Alert} from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import App from '../../App';
import {db, initDatabase, notesStore, userStore} from '../../src/storage';
import {localSettingsStore} from '../../src/storage/localSettingsStore';
import {syncWorker} from '../../src/sync/syncWorker';
import {syncState} from '../../src/sync/syncState';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {WelcomeScreen} from '../../src/ui/screens/WelcomeScreen';
import {useNotesData} from '../../src/ui/screens/notes/hooks/useNotesData';

// The shared mock registers a Jest hook on open, which is not allowed mid-test.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    jest.requireActual('../fixtures/sqliteFile').openSqliteFile(':memory:'),
  ),
}));

const openMock = jest.requireMock('@op-engineering/op-sqlite')
  .open as jest.Mock;

const RECOVERY_TITLE = 'LAFINA can’t open your data';

describe('storage recovery', () => {
  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    db.reopen();
    await initDatabase();
  });

  afterEach(() => {
    openMock.mockClear();
    jest.restoreAllMocks();
  });

  describe('App', () => {
    test('an unavailable database shows recovery, not sign-in', async () => {
      db.requireRecovery('open_failed');
      render(<App />);
      await screen.findByText(RECOVERY_TITLE);
      expect(screen.getByText(/Nothing can be saved right now/)).toBeTruthy();
      expect(screen.queryByText('Get Started Free')).toBeNull();
    });

    test('a failed retry keeps recovery and a later retry opens the app', async () => {
      db.requireRecovery('open_failed');
      render(<App />);
      await screen.findByText(RECOVERY_TITLE);

      openMock.mockImplementationOnce(() => {
        throw new Error('native bindings missing');
      });
      fireEvent.press(screen.getByRole('button', {name: 'Try again'}));
      await screen.findByText(/That didn’t work yet/);
      expect(screen.getByText(RECOVERY_TITLE)).toBeTruthy();
      expect(db.getHealth().reason).toBe('open_failed');

      fireEvent.press(screen.getByRole('button', {name: 'Try again'}));
      await waitFor(() => {
        expect(screen.queryByText(RECOVERY_TITLE)).toBeNull();
      });
      expect(db.getHealth().status).toBe('ready');
    });

    test('a newer database is refused and explains the update', async () => {
      db.executeSync('PRAGMA user_version = 99');
      render(<App />);
      await screen.findByText(/saved by a newer version of LAFINA/);
      expect(screen.queryByText('Get Started Free')).toBeNull();
    });

    test('a mid-session rollback failure replaces the app with recovery', async () => {
      render(<App />);
      await waitFor(() => {
        expect(db.getHealth().status).toBe('ready');
      });
      act(() => {
        db.requireRecovery('rollback_failed');
      });
      await screen.findByText(/could not be undone safely/);
    });
  });

  describe('honest saves', () => {
    const failWrites = (): void => {
      const real = db.executeSync.bind(db);
      jest.spyOn(db, 'executeSync').mockImplementation((query, params) => {
        if (/^\s*(INSERT|UPDATE|DELETE|BEGIN)/i.test(query)) {
          throw new Error('disk full');
        }
        return real(query, params);
      });
    };

    test('guest creation reports a failed write instead of a fake profile', () => {
      failWrites();
      expect(() => userStore.createGuestUser()).toThrow('disk full');
    });

    test('guest creation refuses a profile it cannot read back', () => {
      const real = db.executeSync.bind(db);
      jest
        .spyOn(db, 'executeSync')
        .mockImplementation((query, params) =>
          /^SELECT \* FROM users/.test(query)
            ? {rows: [], rowsAffected: 0}
            : real(query, params),
        );
      expect(() => userStore.createGuestUser()).toThrow(/read back/);
    });

    test('reading the guest while storage fails returns null without throwing', () => {
      db.requireRecovery('open_failed');
      expect(userStore.getUserById('local_guest_user')).toBeNull();
    });

    test('the welcome screen stays usable and does not start a fake session', () => {
      failWrites();
      const onGetStarted = jest.fn();
      render(
        <ThemeProvider userId={null}>
          <WelcomeScreen
            onGetStarted={onGetStarted}
            onNavigateToLogin={jest.fn()}
            onNavigateToRegister={jest.fn()}
          />
        </ThemeProvider>,
      );
      fireEvent.press(screen.getByText('Get Started Free'));
      expect(onGetStarted).not.toHaveBeenCalled();
      expect(screen.getByText(/couldn’t save your guest profile/)).toBeTruthy();
      expect(screen.getByText('Create Account')).toBeTruthy();
      expect(screen.getByText('Log In')).toBeTruthy();
    });

    test('settings report whether they were saved', () => {
      expect(localSettingsStore.set('u', 'k', 'v')).toBe(true);
      failWrites();
      expect(localSettingsStore.set('u', 'k', 'other')).toBe(false);
      jest.restoreAllMocks();
      expect(localSettingsStore.get('u', 'k', '')).toBe('v');
    });

    test('reordering notes reports a failed save', () => {
      failWrites();
      expect(() => notesStore.updateOrder([{id: 'n', sortOrder: 1}])).toThrow(
        'disk full',
      );
    });

    const renderNotes = () => {
      userStore.createGuestUser();
      const onRefresh = jest.fn();
      return renderHook(() =>
        useNotesData({
          userId: 'local_guest_user',
          refreshTrigger: 0,
          onRefresh,
        }),
      );
    };

    test('a failed note save keeps the editor open with the text', () => {
      const alert = jest
        .spyOn(Alert, 'alert')
        .mockImplementation(() => undefined);
      const {result} = renderNotes();
      act(() => {
        result.current.openNewNote();
      });
      act(() => {
        result.current.setNoteTitle('Exam plan');
      });
      failWrites();
      act(() => {
        result.current.saveNote();
      });
      expect(alert).toHaveBeenCalledWith('Note not saved', expect.any(String));
      expect(result.current.editorVisible).toBe(true);
      expect(result.current.noteTitle).toBe('Exam plan');
      jest.restoreAllMocks();
      expect(notesStore.getAll('local_guest_user')).toEqual([]);
    });

    test('a failed reorder ends the drag and says so', () => {
      const alert = jest
        .spyOn(Alert, 'alert')
        .mockImplementation(() => undefined);
      const {result} = renderNotes();
      jest.spyOn(notesStore, 'updateOrder').mockImplementation(() => {
        throw new Error('disk full');
      });
      act(() => {
        result.current.handleDragRelease();
      });
      expect(alert).toHaveBeenCalledWith(
        'Note order not saved',
        expect.any(String),
      );
      expect(result.current.isDragging).toBe(false);
    });
  });

  describe('sync', () => {
    test('never starts from storage that cannot be trusted', async () => {
      const deactivate = jest.spyOn(syncState, 'deactivate');
      const session = jest.spyOn(userStore, 'getActiveSessionToken');
      db.requireRecovery('rollback_failed');
      await syncWorker.runSyncPass();
      expect(deactivate).toHaveBeenCalledWith('Local only');
      expect(session).not.toHaveBeenCalled();
    });
  });
});
