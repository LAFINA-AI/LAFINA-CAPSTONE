/**
 * AGY-PORT 08: overnight wall time, device-local timezone metadata, ICS and
 * sync compatibility, on real SQLite (node:sqlite).
 *
 * All events are synthetic. Timezone cases use explicit IANA zones, so they
 * hold on any host. Sync tests run the real `runSyncPass` against a fake
 * old server that knows only the seven legacy event fields (no network, no
 * live backend).
 */
import {
  db,
  guestMigration,
  initDatabase,
  syncOutboxStore,
  tasksStore,
  userStore,
} from '../../src/storage';
import {plannerQueries} from '../../src/storage/plannerQueries';
import * as eventTime from '../../src/storage/eventTime';
import {
  checkEventWallTime,
  eventSpanMinutes,
  localToUtc,
  resolveEventZoneTiming,
  wallTimeCandidates,
} from '../../src/storage/eventTime';
import {eventTimeStore} from '../../src/storage/eventTimeStore';
import {generateIcsString, parseIcsString} from '../../src/storage/icsHelper';
import {persistImportedCalendarItems} from '../../src/ui/screens/calendar/hooks/calendarImportPersistence';
import {buildDayEntries} from '../../src/ui/screens/calendar/utils/timeGridLayout';
import {chatOrchestrator} from '../../src/ai/chatOrchestrator';
import {
  confirmReviewedCommand,
  prepareReviewedCommand,
} from '../../src/ai/nlu/commandReview';
import {GUEST_USER_ID} from '../../src/constants';
import {cloudClient} from '../../src/cloud/cloudClient';
import {syncWorker} from '../../src/sync/syncWorker';
import {
  AUTHORITATIVE_SYNC_ENTITY_TYPES,
  CLIENT_SYNC_ENTITY_TYPES,
} from '../../src/sync/syncEntityTypes';

const NEW_YORK = 'America/New_York';
const MANILA = 'Asia/Manila';
/** The frozen seven-field event payload (PF preservation contract). */
const EVENT_WIRE_FIELDS = [
  'date',
  'end_time',
  'linked_calendar_block',
  'location',
  'recurrence_rule',
  'start_time',
  'title',
];
const METADATA_KEYS = [
  'end_date',
  'time_zone',
  'start_at',
  'end_at',
  'start_fold',
  'end_fold',
];

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  return `p08-${label}-${serial}`;
};
const eventId = (): string => {
  serial += 1;
  return `event-p08-${serial}`;
};

const useZone = (zone: string | null) =>
  jest.spyOn(eventTime, 'deviceTimeZone').mockReturnValue(zone);

const insert = (
  userId: string,
  wall: {date: string; startTime: string; endTime: string},
  extra: {recurrenceRule?: string | null; folds?: eventTime.EventFolds} = {},
): string => {
  const id = eventId();
  tasksStore.insertEvent(
    {
      id,
      userId,
      title: `Event ${id}`,
      ...wall,
      location: null,
      linkedCalendarBlock: null,
      recurrenceRule: extra.recurrenceRule ?? null,
    },
    undefined,
    extra.folds,
  );
  return id;
};

const metaRow = (id: string): Record<string, unknown> | undefined =>
  db.executeSync('SELECT * FROM event_time_local WHERE event_id = ?', [id])
    .rows?.[0] as Record<string, unknown> | undefined;

const eventRow = (id: string): Record<string, unknown> =>
  db.executeSync('SELECT * FROM events WHERE id = ?', [id]).rows[0] as Record<
    string,
    unknown
  >;

const revisionOf = (id: string): number =>
  Number(
    db.executeSync(
      "SELECT revision FROM entity_local_revisions WHERE entity_type = 'event' AND entity_id = ?",
      [id],
    ).rows?.[0]?.revision ?? 0,
  );

const outboxFor = (userId: string, id: string) =>
  syncOutboxStore
    .getPendingMutations(userId, 500)
    .filter(item => item.entityType === 'event' && item.entityId === id);

describe('AGY-PORT 08 event time and sync compatibility', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('wall time rules (pure)', () => {
    test('an end before the start ends the next day, across month and year ends', () => {
      expect(
        checkEventWallTime({
          date: '2026-11-06',
          startTime: '23:00',
          endTime: '01:30',
        }),
      ).toEqual({ok: true, endDate: '2026-11-07', overnight: true});
      expect(
        checkEventWallTime({
          date: '2026-10-31',
          startTime: '22:00',
          endTime: '02:00',
        }),
      ).toMatchObject({endDate: '2026-11-01'});
      expect(
        checkEventWallTime({
          date: '2026-12-31',
          startTime: '21:00',
          endTime: '00:30',
        }),
      ).toMatchObject({endDate: '2027-01-01'});
      expect(
        checkEventWallTime({
          date: '2026-11-06',
          startTime: '09:00',
          endTime: '10:00',
        }),
      ).toEqual({ok: true, endDate: '2026-11-06', overnight: false});
      // A legacy midnight end keeps its meaning: the end of the same evening.
      expect(
        checkEventWallTime({
          date: '2026-11-06',
          startTime: '20:00',
          endTime: '00:00',
        }),
      ).toMatchObject({endDate: '2026-11-07', overnight: true});
      expect(eventSpanMinutes('23:00', '01:30')).toBe(150);
      expect(eventSpanMinutes('09:00', '09:00')).toBe(24 * 60);
    });

    test('invalid dates, invalid times and an equal start and end are refused, never corrected', () => {
      expect(
        checkEventWallTime({
          date: '2026-02-30',
          startTime: '09:00',
          endTime: '10:00',
        }),
      ).toMatchObject({ok: false, problem: 'invalid_date'});
      expect(
        checkEventWallTime({
          date: '2026-11-06',
          startTime: '24:00',
          endTime: '10:00',
        }),
      ).toMatchObject({ok: false, problem: 'invalid_time'});
      expect(
        checkEventWallTime({
          date: '2026-11-06',
          startTime: '9:00',
          endTime: '10:00',
        }),
      ).toMatchObject({ok: false, problem: 'invalid_time'});
      expect(
        checkEventWallTime({
          date: '2026-11-06',
          startTime: '09:00',
          endTime: '09:00',
        }),
      ).toMatchObject({ok: false, problem: 'zero_length'});
    });

    test('a clock-change gap fails, a repeated time needs a choice, and conversion is exact', () => {
      expect(localToUtc('2026-11-06', '09:00', MANILA)).toBe(
        '2026-11-06T01:00:00.000Z',
      );
      // US spring forward: 02:30 on 2026-03-08 does not exist.
      expect(wallTimeCandidates('2026-03-08', '02:30', NEW_YORK)).toEqual([]);
      expect(() => localToUtc('2026-03-08', '02:30', NEW_YORK)).toThrow(
        expect.objectContaining({problem: 'gap'}),
      );
      // US fall back: 01:30 on 2026-11-01 happens twice.
      expect(wallTimeCandidates('2026-11-01', '01:30', NEW_YORK)).toHaveLength(
        2,
      );
      expect(() => localToUtc('2026-11-01', '01:30', NEW_YORK)).toThrow(
        expect.objectContaining({problem: 'ambiguous'}),
      );
      expect(localToUtc('2026-11-01', '01:30', NEW_YORK, 'earlier')).toBe(
        '2026-11-01T05:30:00.000Z',
      );
      expect(localToUtc('2026-11-01', '01:30', NEW_YORK, 'later')).toBe(
        '2026-11-01T06:30:00.000Z',
      );
    });

    test('an overnight span across fall-back resolves with the chosen end, and folds are kept only where needed', () => {
      const wall = {date: '2026-10-31', startTime: '23:00', endTime: '01:30'};
      expect(() => resolveEventZoneTiming(wall, NEW_YORK)).toThrow(
        expect.objectContaining({problem: 'ambiguous', which: 'end'}),
      );
      expect(
        resolveEventZoneTiming(wall, NEW_YORK, {
          startFold: 'later',
          endFold: 'later',
        }),
      ).toEqual({
        timeZone: NEW_YORK,
        startAt: '2026-11-01T03:00:00.000Z',
        endAt: '2026-11-01T06:30:00.000Z',
        startFold: null,
        endFold: 'later',
      });
      expect(() =>
        resolveEventZoneTiming(
          {date: '2026-03-07', startTime: '23:00', endTime: '02:30'},
          NEW_YORK,
        ),
      ).toThrow(expect.objectContaining({problem: 'gap', which: 'end'}));
    });
  });

  describe('engine self-check', () => {
    test('an engine that does not format 24-hour wall time disables metadata instead of refusing times', () => {
      const RealFormat = Intl.DateTimeFormat;
      const twelveHour = function (
        this: unknown,
        locale?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ) {
        return new RealFormat(locale, {
          ...options,
          hourCycle: undefined,
          hour12: true,
        });
      } as unknown as typeof Intl.DateTimeFormat;
      jest.isolateModules(() => {
        (Intl as {DateTimeFormat: typeof Intl.DateTimeFormat}).DateTimeFormat =
          twelveHour;
        try {
          const fresh =
            require('../../src/storage/eventTime') as typeof eventTime;
          expect(fresh.deviceTimeZone()).toBeNull();
        } finally {
          (
            Intl as {DateTimeFormat: typeof Intl.DateTimeFormat}
          ).DateTimeFormat = RealFormat;
        }
      });
      jest.isolateModules(() => {
        const fresh =
          require('../../src/storage/eventTime') as typeof eventTime;
        expect(fresh.deviceTimeZone()).toEqual(expect.any(String));
      });
    });
  });

  describe('device-local metadata', () => {
    test('a new event records this device timezone locally; the outbox payload is the frozen seven fields', () => {
      useZone(MANILA);
      const me = owner('create');
      const id = insert(me, {
        date: '2026-11-06',
        startTime: '23:00',
        endTime: '01:00',
      });
      expect(metaRow(id)).toMatchObject({
        user_id: me,
        time_zone: MANILA,
        start_at: '2026-11-06T15:00:00.000Z',
        end_at: '2026-11-06T17:00:00.000Z',
        base_date: '2026-11-06',
        base_start_time: '23:00',
        base_end_time: '01:00',
      });
      const [create] = outboxFor(me, id);
      expect(Object.keys(create.payload).sort()).toEqual(EVENT_WIRE_FIELDS);
      expect(create.payload).toMatchObject({
        start_time: '23:00',
        end_time: '01:00',
      });
      for (const key of METADATA_KEYS)
        expect(create.payload).not.toHaveProperty(key);

      const listed = plannerQueries
        .window(me, '2026-11-06', '2026-11-06')
        .events.find(event => event.id === id);
      expect(listed).toMatchObject({
        timeZone: MANILA,
        startAt: '2026-11-06T15:00:00.000Z',
        endAt: '2026-11-06T17:00:00.000Z',
      });
    });

    test('with no usable device timezone, or at a gap or an unchosen repeated time, the event stays floating', () => {
      const me = owner('floating');
      useZone(null);
      const unknown = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      expect(metaRow(unknown)).toBeUndefined();
      jest.restoreAllMocks();
      useZone(NEW_YORK);
      const gap = insert(me, {
        date: '2026-03-08',
        startTime: '02:30',
        endTime: '03:30',
      });
      const repeated = insert(me, {
        date: '2026-11-01',
        startTime: '01:30',
        endTime: '02:30',
      });
      expect(metaRow(gap)).toBeUndefined();
      expect(metaRow(repeated)).toBeUndefined();
      // The rows themselves are written unchanged, as before this phase.
      expect(eventRow(gap)).toMatchObject({
        start_time: '02:30',
        end_time: '03:30',
      });
      const chosen = insert(
        me,
        {date: '2026-11-01', startTime: '01:30', endTime: '02:30'},
        {folds: {startFold: 'later'}},
      );
      expect(metaRow(chosen)).toMatchObject({
        start_at: '2026-11-01T06:30:00.000Z',
        start_fold: 'later',
        end_fold: null,
      });
    });

    test('recording metadata adds no revision and no outbox row of its own', () => {
      const me = owner('revision');
      useZone(null);
      const plain = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      jest.restoreAllMocks();
      useZone(MANILA);
      const zoned = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      expect(revisionOf(zoned)).toBe(revisionOf(plain));
      expect(outboxFor(me, zoned)).toHaveLength(outboxFor(me, plain).length);
    });

    test('a title-only edit keeps it; a time edit records the current device timezone again', () => {
      useZone(MANILA);
      const me = owner('edit');
      const id = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      tasksStore.updateEvent({id, title: 'Renamed'});
      expect(metaRow(id)).toMatchObject({
        time_zone: MANILA,
        start_at: '2026-11-06T01:00:00.000Z',
      });

      jest.restoreAllMocks();
      useZone(NEW_YORK);
      tasksStore.updateEvent({id, title: 'Renamed again', startTime: '09:00'});
      // Same wall time written again: nothing changed, the saved zone stays.
      expect(metaRow(id)).toMatchObject({time_zone: MANILA});
      tasksStore.updateEvent({id, startTime: '11:00', endTime: '12:00'});
      expect(metaRow(id)).toMatchObject({
        time_zone: NEW_YORK,
        start_at: '2026-11-06T16:00:00.000Z',
        base_start_time: '11:00',
      });
      const update = outboxFor(me, id).pop();
      expect(Object.keys(update?.payload ?? {}).sort()).toEqual(
        EVENT_WIRE_FIELDS,
      );
    });

    test('any writer that changes the wall time or deletes the event drops it; a stale row is never read', () => {
      useZone(MANILA);
      const me = owner('triggers');
      const moved = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      db.executeSync('UPDATE events SET end_time = ? WHERE id = ?', [
        '10:30',
        moved,
      ]);
      expect(metaRow(moved)).toBeUndefined();

      const titled = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      db.executeSync('UPDATE events SET title = ?, date = date WHERE id = ?', [
        'New',
        titled,
      ]);
      expect(metaRow(titled)).toBeDefined();

      const removed = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      tasksStore.deleteEvent(removed);
      expect(metaRow(removed)).toBeUndefined();

      const hard = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      db.executeSync('DELETE FROM events WHERE id = ?', [hard]);
      expect(metaRow(hard)).toBeUndefined();

      // Belt and braces: a row whose base no longer matches is not used.
      const forged = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      db.executeSync(
        'UPDATE event_time_local SET base_end_time = ? WHERE event_id = ?',
        ['11:00', forged],
      );
      expect(eventTimeStore.get(me, forged)).toBeNull();
      expect(
        plannerQueries
          .window(me, '2026-11-06', '2026-11-06')
          .events.find(e => e.id === forged)?.timeZone,
      ).toBeUndefined();
    });

    test('another owner never sees it, and guest linking moves it with the event', async () => {
      useZone(MANILA);
      const me = owner('a');
      const other = owner('b');
      const id = insert(me, {
        date: '2026-11-06',
        startTime: '09:00',
        endTime: '10:00',
      });
      expect(eventTimeStore.get(other, id)).toBeNull();
      expect(
        plannerQueries.window(other, '2026-11-06', '2026-11-06').events,
      ).toEqual([]);

      db.executeSync('DELETE FROM events WHERE user_id = ?', [GUEST_USER_ID]);
      userStore.createGuestUser();
      userStore.setCurrentUser(GUEST_USER_ID);
      const guestEvent = insert(GUEST_USER_ID, {
        date: '2026-11-07',
        startTime: '22:00',
        endTime: '01:00',
      });
      const cloud = owner('cloud');
      await guestMigration.linkGuestToCloudAccount(
        cloud,
        `${cloud}@example.invalid`,
      );
      expect(eventTimeStore.get(GUEST_USER_ID, guestEvent)).toBeNull();
      expect(eventTimeStore.get(cloud, guestEvent)).toMatchObject({
        timeZone: MANILA,
        startAt: '2026-11-07T14:00:00.000Z',
      });
      const recreated = outboxFor(cloud, guestEvent).pop();
      expect(Object.keys(recreated?.payload ?? {}).sort()).toEqual(
        EVENT_WIRE_FIELDS,
      );
    });

    test('a recurring occurrence keeps the zone but not the base date instants', () => {
      useZone(MANILA);
      const me = owner('recurring');
      const id = insert(
        me,
        {date: '2026-11-06', startTime: '23:00', endTime: '01:00'},
        {recurrenceRule: 'FREQ=DAILY;COUNT=3'},
      );
      const events = plannerQueries.window(
        me,
        '2026-11-06',
        '2026-11-08',
      ).events;
      expect(
        events.map(e => [e.id, e.date, e.timeZone, e.startAt ?? null]),
      ).toEqual([
        [id, '2026-11-06', MANILA, '2026-11-06T15:00:00.000Z'],
        [`${id}_occur_2026-11-07`, '2026-11-07', MANILA, null],
        [`${id}_occur_2026-11-08`, '2026-11-08', MANILA, null],
      ]);
    });
  });

  describe('legacy rows (synthetic fixture, written as an older AGY did)', () => {
    test('legacy overnight and equal-time rows keep their meaning: floating, same Calendar span, no metadata', () => {
      useZone(MANILA);
      const me = owner('legacy-rows');
      const stamp = '2026-10-01T00:00:00.000Z';
      const seed = (id: string, start: string, end: string) =>
        db.executeSync(
          `INSERT INTO events (id, user_id, title, date, start_time, end_time, created_at, updated_at)
           VALUES (?, ?, ?, '2026-11-06', ?, ?, ?, ?)`,
          [id, me, id, start, end, stamp, stamp],
        );
      seed(`${me}-overnight`, '22:00', '02:00');
      seed(`${me}-midnight`, '20:00', '00:00');
      seed(`${me}-equal`, '09:00', '09:00');
      const events = plannerQueries.window(
        me,
        '2026-11-05',
        '2026-11-07',
      ).events;
      expect(
        events.map(e => [e.id, e.timeZone ?? null, e.startAt ?? null]),
      ).toEqual([
        [`${me}-equal`, null, null],
        [`${me}-midnight`, null, null],
        [`${me}-overnight`, null, null],
      ]);
      const spans = (date: string) =>
        buildDayEntries({
          date: new Date(`${date}T12:00:00`),
          blocks: [],
          events,
          tasks: [],
          timeFormat24h: false,
          eventColor: '#000',
          taskColor: () => '#000',
        })
          .map(entry => [entry.title, entry.start, entry.end])
          .sort();
      expect(spans('2026-11-06')).toEqual([
        [`${me}-equal`, 9 * 60, 24 * 60],
        [`${me}-midnight`, 20 * 60, 24 * 60],
        [`${me}-overnight`, 22 * 60, 24 * 60],
      ]);
      expect(spans('2026-11-07')).toEqual([
        [`${me}-equal`, 0, 9 * 60],
        [`${me}-overnight`, 0, 2 * 60],
      ]);
      const ics = generateIcsString(events, [], []);
      expect(ics).toContain('DTSTART:20261106T220000\r\nDTEND:20261107T020000');
      expect(ics).toContain('DTSTART:20261106T200000\r\nDTEND:20261107T000000');
      expect(metaRow(`${me}-overnight`)).toBeUndefined();
    });
  });

  describe('overnight spans in Calendar and conflict checks', () => {
    test('an overnight event fills the end of its day and the top of the next, labelled', () => {
      useZone(MANILA);
      const me = owner('layout');
      insert(me, {date: '2026-11-06', startTime: '23:00', endTime: '01:30'});
      const events = plannerQueries.window(
        me,
        '2026-11-05',
        '2026-11-08',
      ).events;
      const entries = (date: string) =>
        buildDayEntries({
          date: new Date(`${date}T12:00:00`),
          blocks: [],
          events,
          tasks: [],
          timeFormat24h: false,
          eventColor: '#000',
          taskColor: () => '#000',
        }).map(entry => [entry.start, entry.end, entry.time]);
      expect(entries('2026-11-06')).toEqual([
        [23 * 60, 24 * 60, '11:00 PM – 01:30 AM next day'],
      ]);
      expect(entries('2026-11-07')).toEqual([
        [0, 90, '11:00 PM – 01:30 AM next day'],
      ]);
      expect(entries('2026-11-08')).toEqual([]);

      jest.restoreAllMocks();
      useZone(NEW_YORK);
      // Seen from another timezone, the saved zone is named; the place is unchanged.
      expect(entries('2026-11-06')).toEqual([
        [23 * 60, 24 * 60, `11:00 PM – 01:30 AM next day · ${MANILA}`],
      ]);
    });

    test('conflicts include an overnight item from the day before and an overnight proposal into the next day', () => {
      useZone(MANILA);
      const me = owner('conflict');
      insert(me, {date: '2026-11-06', startTime: '23:00', endTime: '02:00'});
      expect(
        chatOrchestrator.checkScheduleConflict(
          me,
          '2026-11-07',
          '01:00',
          '03:00',
        ),
      ).toMatchObject({hasConflict: true, conflictingStartTime: '23:00'});
      expect(
        chatOrchestrator.checkScheduleConflict(
          me,
          '2026-11-07',
          '02:00',
          '03:00',
        ),
      ).toEqual({hasConflict: false});
      // An overnight proposal on the 5th runs into the 6th, which has nothing before 23:00.
      expect(
        chatOrchestrator.checkScheduleConflict(
          me,
          '2026-11-05',
          '22:00',
          '01:00',
        ),
      ).toEqual({hasConflict: false});
      expect(
        chatOrchestrator.checkScheduleConflict(
          me,
          '2026-11-06',
          '22:00',
          '23:30',
        ),
      ).toMatchObject({hasConflict: true});
      // Same-day behaviour is unchanged; an equal start and end is still not checked.
      expect(
        chatOrchestrator.checkScheduleConflict(
          me,
          '2026-11-06',
          '09:00',
          '09:00',
        ),
      ).toEqual({hasConflict: false});
    });
  });

  describe('reviewed commands', () => {
    test('a reviewed overnight move says it ends the next day; the confirmed event keeps the frozen payload', () => {
      useZone(MANILA);
      const me = owner('review');
      const id = insert(me, {
        date: '2027-02-10',
        startTime: '18:00',
        endTime: '19:00',
      });
      db.executeSync('UPDATE events SET title = ? WHERE id = ?', [
        'Night lab',
        id,
      ]);
      const prepared = prepareReviewedCommand(me, {
        intent: 'update_time_block',
        targetEntityType: 'event',
        targetTitle: 'Night lab',
        title: null,
        date: null,
        time: '23:00',
        endTime: '01:00',
        durationMinutes: null,
        category: 'Academic',
        details: null,
        snoozeMinutes: null,
        confidence: 0.9,
        source: 'fast_path',
        rawTranscript: '',
        isValid: true,
      } as never);
      expect(prepared.status).toBe('proposal');
      if (prepared.status !== 'proposal') return;
      expect(prepared.proposal.details).toContain(
        'Ends the next day, Thu, Feb 11, 2027.',
      );
      expect(
        confirmReviewedCommand(me, prepared.proposal.operationId).status,
      ).toBe('applied');
      expect(eventRow(id)).toMatchObject({
        start_time: '23:00',
        end_time: '01:00',
      });
      expect(eventTimeStore.get(me, id)).toMatchObject({
        startAt: '2027-02-10T15:00:00.000Z',
        endAt: '2027-02-10T17:00:00.000Z',
      });
      const update = outboxFor(me, id).pop();
      expect(Object.keys(update?.payload ?? {}).sort()).toEqual(
        EVENT_WIRE_FIELDS,
      );
    });
  });

  describe('ICS', () => {
    test('export: a floating overnight event ends on the next date; a zoned one exports its exact instants', () => {
      useZone(MANILA);
      const me = owner('export');
      const zoned = insert(me, {
        date: '2026-11-06',
        startTime: '23:00',
        endTime: '01:00',
      });
      useZone(null);
      const floating = insert(me, {
        date: '2026-11-06',
        startTime: '22:00',
        endTime: '00:30',
      });
      const {events} = plannerQueries.exportAll(me);
      const ics = generateIcsString(events, [], []);
      const block = (id: string) =>
        ics.split('BEGIN:VEVENT').find(part => part.includes(`UID:${id}`)) ??
        '';
      expect(block(zoned)).toContain('DTSTART:20261106T150000Z');
      expect(block(zoned)).toContain('DTEND:20261106T170000Z');
      expect(block(floating)).toContain('DTSTART:20261106T220000');
      expect(block(floating)).toContain('DTEND:20261107T003000');
      expect(block(floating)).not.toMatch(/DT(START|END):\d{8}T\d{6}Z/);
    });

    test('round trip: export then import restores the same wall times and the local metadata', () => {
      useZone(MANILA);
      const me = owner('roundtrip');
      insert(me, {date: '2026-11-06', startTime: '23:00', endTime: '01:00'});
      insert(me, {date: '2026-11-06', startTime: '09:00', endTime: '10:00'});
      const ics = generateIcsString(
        plannerQueries.exportAll(me).events,
        [],
        [],
      );
      const parsed = parseIcsString(ics);
      expect(parsed.skipped).toBe(0);
      expect(
        parsed.events.map(e => [e.date, e.startTime, e.endTime]).sort(),
      ).toEqual([
        ['2026-11-06', '09:00', '10:00'],
        ['2026-11-06', '23:00', '01:00'],
      ]);
      const target = owner('imported');
      const {eventIds} = persistImportedCalendarItems(target, parsed);
      expect(
        eventIds.map(id => eventTimeStore.get(target, id)?.timeZone),
      ).toEqual([MANILA, MANILA]);
    });

    test('import: UTC and TZID times are converted exactly; a repeated time keeps the file instant', () => {
      useZone(MANILA);
      const file = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:utc-1',
        'DTSTART:20261106T010000Z',
        'DTEND:20261106T020000Z',
        'SUMMARY:UTC',
        'X-LAFINA-TYPE:event',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:ny-1',
        'DTSTART;TZID=America/New_York:20261106T200000',
        'DTEND;TZID=America/New_York:20261106T210000',
        'SUMMARY:New York evening',
        'X-LAFINA-TYPE:event',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
      const parsed = parseIcsString(file);
      expect(
        parsed.events.map(e => [e.id, e.date, e.startTime, e.endTime]),
      ).toEqual([
        ['utc-1', '2026-11-06', '09:00', '10:00'],
        ['ny-1', '2026-11-07', '09:00', '10:00'],
      ]);

      jest.restoreAllMocks();
      useZone(NEW_YORK);
      const repeated = parseIcsString(
        [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:fold-1',
          'DTSTART:20261101T063000Z',
          'DTEND:20261101T073000Z',
          'SUMMARY:Second 1:30',
          'X-LAFINA-TYPE:event',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      );
      expect(repeated.events[0]).toMatchObject({
        date: '2026-11-01',
        startTime: '01:30',
        endTime: '02:30',
        startFold: 'later',
      });
      const me = owner('fold-import');
      const [id] = persistImportedCalendarItems(me, repeated).eventIds;
      expect(eventTimeStore.get(me, id)?.startAt).toBe(
        '2026-11-01T06:30:00.000Z',
      );
    });

    test('import: invalid dates and impossible spans are skipped and counted, never moved to today', () => {
      useZone(MANILA);
      const vevent = (uid: string, start: string, end: string, type = '') => [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTART${start}`,
        `DTEND${end}`,
        `SUMMARY:${uid}`,
        ...(type ? [`X-LAFINA-TYPE:${type}`] : []),
        'END:VEVENT',
      ];
      const parsed = parseIcsString(
        [
          'BEGIN:VCALENDAR',
          ...vevent(
            'bad-date',
            ':20261345T090000',
            ':20261345T100000',
            'event',
          ),
          ...vevent(
            'bad-time',
            ':20261106T250000',
            ':20261106T260000',
            'event',
          ),
          ...vevent('backwards', ':20261106T100000', ':20261106T090000'),
          ...vevent('three-days', ':20261106T090000', ':20261109T100000'),
          ...vevent(
            'ny-gap',
            ';TZID=America/New_York:20260308T023000',
            ';TZID=America/New_York:20260308T033000',
            'event',
          ),
          ...vevent(
            'legacy-overnight',
            ':20261106T230000',
            ':20261106T010000',
            'event',
          ),
          ...vevent('good', ':20261106T090000', ':20261106T100000', 'event'),
          'END:VCALENDAR',
        ].join('\r\n'),
      );
      expect(parsed.skipped).toBe(5);
      expect(
        parsed.events.map(e => [e.id, e.date, e.startTime, e.endTime]),
      ).toEqual([
        ['legacy-overnight', '2026-11-06', '23:00', '01:00'],
        ['good', '2026-11-06', '09:00', '10:00'],
      ]);
      expect(parsed.blocks).toEqual([]);
    });
  });

  describe('old-server sync round trip (full runSyncPass, fake server)', () => {
    const originalToken = cloudClient.getAccessToken;
    const originalOnline = cloudClient.isOnline;
    const previousFetch = global.fetch;
    let serverChanges: unknown[] = [];
    let sentBodies: Array<Record<string, any>> = [];
    let changeId = 8000;

    const respond = (payload: unknown) =>
      ({
        ok: true,
        status: 200,
        headers: {get: () => 'application/json'},
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      } as unknown as Response);

    beforeEach(() => {
      sentBodies = [];
      cloudClient.getAccessToken = () => 'synthetic-token';
      cloudClient.isOnline = async () => true;
      global.fetch = jest.fn(async (url: string, init: RequestInit) => {
        if (!String(url).endsWith('/v1/sync/batch')) {
          return {...respond({}), ok: false, status: 404} as Response;
        }
        const body = JSON.parse(String(init.body));
        sentBodies.push(body);
        // An old server: it rejects any event field it does not know.
        const unknownField = (m: any) =>
          m.entityType === 'event' &&
          Object.keys(m.payload ?? {}).some(
            key => !EVENT_WIRE_FIELDS.includes(key),
          );
        const changes = serverChanges;
        serverChanges = [];
        return respond({
          accepted: (body.mutations as any[])
            .filter(m => !unknownField(m))
            .map(m => ({
              mutationId: m.mutationId,
              entityType: m.entityType,
              entityId: m.entityId,
              status: 'accepted',
              serverVersion: 1,
            })),
          rejected: (body.mutations as any[]).filter(unknownField).map(m => ({
            mutationId: m.mutationId,
            entityType: m.entityType,
            entityId: m.entityId,
            status: 'rejected',
            reason: 'validation_error',
          })),
          changes: body.snapshot ? [] : changes,
          nextCursor: body.snapshot ? body.cursor : changeId,
          hasMore: false,
          resetRequired: false,
          serverTime: new Date().toISOString(),
          snapshot: body.snapshot
            ? {
                boundaryCursor: changeId,
                items: [],
                nextAfter: null,
                hasMore: false,
                complete: true,
                authoritativeEntityTypes: AUTHORITATIVE_SYNC_ENTITY_TYPES,
                prunePolicy: {
                  preserveOutboxStatuses: ['pending', 'in_progress', 'failed'],
                  requireExistingSyncMetadata: true,
                },
              }
            : null,
          supportedEntityTypes: [...CLIENT_SYNC_ENTITY_TYPES],
        });
      }) as unknown as typeof fetch;
    });

    afterEach(() => {
      cloudClient.getAccessToken = originalToken;
      cloudClient.isOnline = originalOnline;
      global.fetch = previousFetch;
    });

    /** What an old server sends: the seven legacy fields, no metadata keys. */
    const eventChange = (
      id: string,
      operation: 'update' | 'delete',
      fields: {
        title?: string;
        date?: string;
        start_time?: string;
        end_time?: string;
      } = {},
    ) => {
      changeId += 1;
      const updatedAt = new Date(Date.now() + 60_000).toISOString();
      return {
        changeId,
        entityType: 'event',
        entityId: id,
        operation,
        version: changeId,
        payload:
          operation === 'delete'
            ? {}
            : {
                title: fields.title ?? 'From the laptop',
                date: fields.date ?? '2026-11-06',
                start_time: fields.start_time ?? '23:00',
                end_time: fields.end_time ?? '01:00',
                location: null,
                linked_calendar_block: null,
                recurrence_rule: null,
              },
        updatedAt,
        ...(operation === 'delete' ? {deletedAt: updatedAt} : {}),
      };
    };

    test('push stays the legacy event shape; title-only pulls keep metadata, time pulls and deletes drop it', async () => {
      useZone(MANILA);
      const me = owner('sync');
      const now = new Date().toISOString();
      db.executeSync(
        `INSERT INTO users (id, username, email, role, is_new_user, created_at, updated_at)
         VALUES (?, ?, ?, 'student', 0, ?, ?)`,
        [me, me, `${me}@example.invalid`, now, now],
      );
      userStore.setCurrentUser(me);
      await syncWorker.runSyncPass(); // first pass negotiates the snapshot

      const kept = insert(me, {
        date: '2026-11-06',
        startTime: '23:00',
        endTime: '01:00',
      });
      const retimed = insert(me, {
        date: '2026-11-06',
        startTime: '23:00',
        endTime: '01:00',
      });
      const removed = insert(me, {
        date: '2026-11-06',
        startTime: '23:00',
        endTime: '01:00',
      });
      await syncWorker.runSyncPass();

      const pushed = sentBodies
        .flatMap(body => body.mutations as any[])
        .filter(m => m.entityType === 'event');
      expect(pushed.map(m => m.entityId).sort()).toEqual(
        [kept, retimed, removed].sort(),
      );
      for (const mutation of pushed) {
        expect(Object.keys(mutation.payload).sort()).toEqual(EVENT_WIRE_FIELDS);
      }
      // The old server accepted every event: nothing is left pending or rejected.
      expect(syncOutboxStore.getPendingMutations(me, 50)).toEqual([]);

      serverChanges = [
        eventChange(kept, 'update', {title: 'Renamed on the laptop'}),
        eventChange(retimed, 'update', {start_time: '22:00'}),
        eventChange(removed, 'delete'),
      ];
      await syncWorker.runSyncPass();

      expect(eventRow(kept)).toMatchObject({title: 'Renamed on the laptop'});
      expect(eventTimeStore.get(me, kept)).toMatchObject({
        timeZone: MANILA,
        startAt: '2026-11-06T15:00:00.000Z',
      });
      // The laptop changed the time with no zone: the event is floating again,
      // as every other device sees it, and no false instant is kept.
      expect(eventRow(retimed)).toMatchObject({
        start_time: '22:00',
        end_time: '01:00',
      });
      expect(eventTimeStore.get(me, retimed)).toBeNull();
      expect(metaRow(retimed)).toBeUndefined();
      expect(eventRow(removed).deleted_at).not.toBeNull();
      expect(metaRow(removed)).toBeUndefined();
      // Applying pulls queued nothing to send back.
      expect(syncOutboxStore.getPendingMutations(me, 50)).toEqual([]);
    });
  });
});
