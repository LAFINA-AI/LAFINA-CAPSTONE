import NetInfo from '@react-native-community/netinfo';
import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {cloudClient} from '../../src/cloud';
import {
  documentSkill,
  isDocumentFormat,
  MAX_DOCUMENT_BYTES,
} from '../../src/skills/documentSkill';
import {cardsFromSource, STUDY_OFFLINE_MESSAGE} from '../../src/skills/studyAi';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  applyPomodoro,
  pausePomodoro,
  readPomodoro,
} from '../../src/skills/pomodoroService';
import {newPomodoro} from '../../src/skills/studyLogic';
import {invalidateOwnerWork} from '../../src/storage/ownerWorkEpoch';
import {
  db,
  initDatabase,
  localSettingsStore,
  userStore,
} from '../../src/storage';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
};
let owner: string;
beforeAll(async () => {
  await initDatabase();
});
beforeEach(() => {
  db.executeSync('DELETE FROM active_session');
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
});
afterEach(() => {
  jest.restoreAllMocks();
});

test.each(['signout', 'offline'] as const)(
  'study connectivity checking rechecks %s before sending source text',
  async reason => {
    const net = deferred<Awaited<ReturnType<typeof NetInfo.fetch>>>();
    jest.spyOn(NetInfo, 'fetch').mockReturnValue(net.promise);
    const send = jest.spyOn(onlineChatSkill, 'sendChatMessage');
    const pending = cardsFromSource(owner, 'Private student source');
    const settled = pending.then(
      () => null,
      (error: Error) => error,
    );
    if (reason === 'offline')
      localSettingsStore.set(owner, 'chat.onlineMode', 'false');
    else userStore.logout();
    net.resolve({isConnected: true, isInternetReachable: true} as Awaited<
      ReturnType<typeof NetInfo.fetch>
    >);
    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain(
      reason === 'offline' ? STUDY_OFFLINE_MESSAGE : 'no longer active',
    );
    expect(send).not.toHaveBeenCalled();
  },
);

test.each(['pause', 'reset'] as const)(
  '%s during notification permission cannot restart the focus timer',
  async reason => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
    const permission = deferred<string>();
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockReturnValue(
        permission.promise as ReturnType<typeof PermissionsAndroid.request>,
      );
    const originalFocus = NativeModules.LafinaFocus;
    const schedule = jest.fn(async () => true);
    NativeModules.LafinaFocus = {schedule, cancel: jest.fn(async () => true)};
    try {
      const pending = applyPomodoro(owner, newPomodoro(), {starting: true});
      const settled = pending.then(
        () => null,
        (error: Error) => error,
      );
      if (reason === 'pause') await pausePomodoro(owner);
      else invalidateOwnerWork(owner);
      permission.resolve(PermissionsAndroid.RESULTS.GRANTED);
      const error = await settled;
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toContain('changed');
      expect(schedule).not.toHaveBeenCalled();
      expect(readPomodoro(owner).deadline).toBeNull();
    } finally {
      NativeModules.LafinaFocus = originalFocus;
    }
  },
);

test.each(['constructor', '__proto__', 'toString'])(
  'inherited format %s is rejected',
  format => {
    expect(isDocumentFormat(format)).toBe(false);
  },
);

test.each([
  'A===',
  'abc',
  '!!??',
  'YQ=A',
  'A'.repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 + 4),
])(
  'damaged or oversized document data is rejected (case %#)',
  async contentBase64 => {
    jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {format: 'pdf', contentBase64},
    });
    const result = await documentSkill.generate({
      prompt: 'Make a document',
      format: 'pdf',
    });
    expect(result.status).toBe('server_error');
  },
);

test('document byte size comes from actual decoded data instead of server metadata', async () => {
  jest.spyOn(cloudClient, 'request').mockResolvedValue({
    status: 'success',
    data: {
      format: 'pdf',
      contentBase64: 'JVBERi0xLjQK',
      sizeBytes: 999999999,
    },
  });
  const result = await documentSkill.generate({
    prompt: 'Make a document',
    format: 'pdf',
  });
  expect(result.status).toBe('success');
  if (result.status === 'success') expect(result.data?.sizeBytes).toBe(9);
});
