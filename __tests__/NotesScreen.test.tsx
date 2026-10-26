import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {Alert} from 'react-native';
import type {NoteDraft, NotesRepository} from '../src/core/domain/notes';
import {createNotesRepository} from '../src/core/storage/notesRepository';
import {NotesScreen} from '../src/features/notes/NotesScreen';
import {createPlannerFixture, fixtureNow} from './helpers/plannerFixtures';

const draft: NoteDraft = {
  title: 'Synthetic note',
  body: 'Chapter one',
  category: 'Personal',
  pinned: false,
};
const now = () => new Date(fixtureNow);

describe('Notes screen with actual repository SQL', () => {
  let fixture: ReturnType<typeof createPlannerFixture>;
  let repository: NotesRepository;
  beforeEach(() => {
    jest.useFakeTimers();
    fixture = createPlannerFixture();
    repository = createNotesRepository(fixture.sql, fixture.clock);
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    fixture.close();
    jest.restoreAllMocks();
  });
  function setup(override?: NotesRepository) {
    const props = {
      factory: () => override ?? repository,
      now,
      onDraftStateChange: jest.fn(),
      onRouteChange: jest.fn(),
      backRequest: 0,
    };
    return {...render(<NotesScreen {...props} />), props};
  }
  function press(name: string) {
    fireEvent.press(screen.getByRole('button', {name}));
  }
  function alertButton(name: string) {
    const calls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = calls[calls.length - 1]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    act(() => buttons.find(button => button.text === name)?.onPress?.());
  }

  it('shows the requested empty Notes presentation with supported filters and no AI promise', () => {
    setup();
    expect(screen.getByRole('header', {name: 'Notes'})).toBeTruthy();
    expect(screen.getByText('No notes found')).toBeTruthy();
    for (const filter of ['All', 'Pinned', 'Personal', 'Coursework']) {
      expect(screen.getByRole('tab', {name: filter})).toBeTruthy();
    }
    expect(screen.queryByText('AI Transcribed')).toBeNull();
    expect(screen.getByRole('button', {name: 'Add note'})).toBeEnabled();
  });

  it('creates, edits, pins and filters a durable local note without auto-saving drafts', () => {
    const {props} = setup();
    press('Add note');
    expect(props.onRouteChange).toHaveBeenLastCalledWith(true);
    fireEvent.changeText(screen.getByLabelText('Note title'), 'Lecture');
    fireEvent.changeText(
      screen.getByLabelText('Note text'),
      'Synthetic lecture notes',
    );
    fireEvent.press(screen.getByRole('radio', {name: 'Category: Coursework'}));
    fireEvent.press(screen.getByRole('checkbox', {name: 'Pin note'}));
    expect(props.onDraftStateChange).toHaveBeenLastCalledWith(true);
    expect(repository.counts().notes).toBe(0);
    press('Save note');
    expect(props.onDraftStateChange).toHaveBeenLastCalledWith(false);
    expect(props.onRouteChange).toHaveBeenLastCalledWith(false);
    const saved = repository.page({filter: 'Pinned'}).items[0]!;
    expect(saved).toMatchObject({
      title: 'Lecture',
      body: 'Synthetic lecture notes',
      category: 'Coursework',
      pinned: true,
      version: 1,
    });
    press('Open note: Lecture');
    fireEvent.changeText(
      screen.getByLabelText('Note title'),
      'Updated lecture',
    );
    press('Save note');
    expect(repository.get(saved.id)?.version).toBe(2);
    fireEvent.press(screen.getByRole('tab', {name: 'Personal'}));
    expect(screen.getByText('No notes found')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', {name: 'Coursework'}));
    expect(
      screen.getByRole('button', {name: 'Open note: Updated lecture'}),
    ).toBeTruthy();
  });

  it('searches literal punctuation and note body; compact display retains opening controls', () => {
    repository.create({
      token: 'one',
      draft: {...draft, title: '100% ready', body: 'needle'},
    });
    repository.create({token: 'two', draft: {...draft, title: 'Other'}});
    setup();
    press('Search notes');
    fireEvent.changeText(screen.getByLabelText('Search notes'), '%');
    expect(
      screen.getByRole('button', {name: 'Open note: 100% ready'}),
    ).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'Open note: Other'})).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Search notes'), 'needle');
    press('Use compact notes');
    expect(
      screen.getByRole('button', {name: 'Open note: 100% ready'}),
    ).toBeTruthy();
  });

  it('keeps a dirty editor on Back until explicit discard and reports clean subroutes', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const {props, rerender} = setup();
    press('Add note');
    fireEvent.changeText(screen.getByLabelText('Note title'), 'Unsaved');
    rerender(<NotesScreen {...props} backRequest={1} />);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Discard note changes?',
      expect.any(String),
      expect.any(Array),
    );
    alertButton('Keep editing');
    expect(screen.getByLabelText('Note title').props.value).toBe('Unsaved');
    press('Discard changes');
    alertButton('Discard');
    expect(repository.counts().notes).toBe(0);
    expect(props.onDraftStateChange).toHaveBeenLastCalledWith(false);
    press('Add note');
    rerender(<NotesScreen {...props} backRequest={2} />);
    expect(screen.getByRole('header', {name: 'Notes'})).toBeTruthy();
    expect(props.onRouteChange).toHaveBeenLastCalledWith(false);
  });

  it('requires explicit deletion confirmation and never deletes on cancellation', () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const note = repository.create({token: 'delete_me', draft});
    setup();
    press('Open note: Synthetic note');
    press('Delete note');
    alertButton('Cancel');
    expect(repository.get(note.id)).not.toBeNull();
    press('Delete note');
    alertButton('Delete note');
    expect(repository.get(note.id)).toBeNull();
    expect(screen.getByText('No notes found')).toBeTruthy();
  });

  it('retains the draft and stable operation token after a storage error then retries', () => {
    const create = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Synthetic disk failure');
      })
      .mockImplementation(command => repository.create(command));
    setup({...repository, create});
    press('Add note');
    fireEvent.changeText(screen.getByLabelText('Note title'), 'Keep draft');
    press('Save note');
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/);
    expect(screen.getByLabelText('Note title').props.value).toBe('Keep draft');
    press('Save note');
    expect(create.mock.calls[1]?.[0].token).toBe(
      create.mock.calls[0]?.[0].token,
    );
    expect(repository.counts().notes).toBe(1);
  });

  it('shows validation failure without losing entered text or saving', () => {
    setup();
    press('Add note');
    fireEvent.changeText(screen.getByLabelText('Note text'), 'Body retained');
    press('Save note');
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter a title/);
    expect(screen.getByLabelText('Note text').props.value).toBe(
      'Body retained',
    );
    expect(repository.counts().notes).toBe(0);
  });

  it('recovers a failed open visibly rather than presenting fake empty storage success', () => {
    const factory = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Unavailable native driver');
      })
      .mockImplementation(() => repository);
    render(
      <NotesScreen
        factory={factory}
        now={now}
        onDraftStateChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not open/);
    expect(screen.queryByText('No notes found')).toBeNull();
    expect(screen.getByRole('button', {name: 'Add note'})).toBeDisabled();
    press('Retry notes');
    expect(screen.getByText('No notes found')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Add note'})).toBeEnabled();
  });

  it('pages saved notes without an unbounded accumulating list', () => {
    for (let i = 0; i < 21; i++) {
      repository.create({
        token: `page_${i.toString().padStart(2, '0')}`,
        draft: {...draft, title: `Page note ${i}`},
      });
    }
    setup();
    expect(screen.getByRole('button', {name: 'Next notes'})).toBeTruthy();
    press('Next notes');
    expect(screen.queryByRole('button', {name: 'Next notes'})).toBeNull();
    expect(screen.getByRole('button', {name: 'Previous notes'})).toBeTruthy();
    press('Previous notes');
    expect(screen.getByRole('button', {name: 'Next notes'})).toBeTruthy();
  });
});
