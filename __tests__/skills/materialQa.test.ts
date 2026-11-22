import NetInfo from '@react-native-community/netinfo';
import {cloudClient} from '../../src/cloud';
import {
  chunkExtractedPages,
  MATERIAL_NO_EVIDENCE_REPLY,
} from '../../src/materials';
import {
  askUserMaterials,
  getMaterialOnlineStatus,
  MaterialQaAbortedError,
} from '../../src/skills/materialQa';
import {onlineChatSkill} from '../../src/skills/onlineChatSkill';
import {
  db,
  initDatabase,
  localSettingsStore,
  materialStore,
  userStore,
} from '../../src/storage';

let owner: string;

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  for (const table of [
    'active_session',
    'user_material_chunks',
    'user_material_qa_messages',
    'user_materials',
    'local_settings',
    'users',
  ]) {
    db.executeSync(`DELETE FROM ${table}`);
  }
  owner = userStore.createGuestUser().id;
  userStore.setCurrentUser(owner);
  cloudClient.resetSessionCache();
  (NetInfo.fetch as jest.Mock).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
});

afterEach(() => {
  cloudClient.resetSessionCache();
  jest.restoreAllMocks();
});

function seedBiologyMaterial() {
  const chunked = chunkExtractedPages({
    fileName: 'Biology_Ch3.pdf',
    fileKind: 'pdf',
    pages: [
      {
        pageNumber: 1,
        usedOcr: false,
        text: 'Chapter 1. Cellular Energetics\nCellular respiration converts glucose into adenosine triphosphate (ATP) inside mitochondria.',
      },
      {
        pageNumber: 2,
        usedOcr: false,
        text: 'Chapter 2. Photosynthesis\nChlorophyll absorbs sunlight to convert carbon dioxide and water into glucose.',
      },
    ],
  });
  return materialStore.saveMaterialWithChunks(
    owner,
    {
      title: chunked.title,
      fileName: 'Biology_Ch3.pdf',
      fileKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1500,
      sha256: chunked.sha256,
      pageCount: 2,
      pagesRead: 2,
      ocrPages: 0,
      totalChars: chunked.totalChars,
      outline: chunked.outline,
    },
    chunked.chunks,
  );
}

test('online streaming sends useHandbook=false, respects char limits, and persists cited answer', async () => {
  const mat = seedBiologyMaterial();
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');

  const streamSpy = jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockImplementation(async (messages, options) => {
      expect(options.useHandbook).toBe(false);
      const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
      expect(totalChars).toBeLessThanOrEqual(8000);
      for (const m of messages) {
        expect(m.content.length).toBeLessThanOrEqual(4090);
      }
      expect(messages[messages.length - 1].content).toContain(
        '<study_material_excerpts',
      );
      options.onReplyText('Mitochondria produce ATP');
      return {
        status: 'success',
        data: {
          reply:
            'Mitochondria produce ATP during cellular respiration (Biology Ch3, p. 1).',
          sources: [],
          usedHandbook: false,
        },
      };
    });

  const partials: string[] = [];
  const res = await askUserMaterials(
    owner,
    'How does cellular respiration make ATP?',
    {
      materialIds: [mat.id],
      scopeKey: mat.id,
      onReplyText: text => partials.push(text),
    },
  );

  expect(streamSpy).toHaveBeenCalledTimes(1);
  expect(partials).toEqual(['Mitochondria produce ATP']);
  expect(res.usedOnline).toBe(true);
  expect(res.insufficientEvidence).toBe(false);
  expect(res.sources[0].pageLabel).toBe('p. 1');
  expect(materialStore.listMessages(owner, mat.id)).toHaveLength(2);
});

test('online query-expansion fallback rescues paraphrased questions and still refuses off-topic ones', async () => {
  const mat = seedBiologyMaterial();
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');

  // Paraphrased question ("powerhouse organelle energy currency") is not literally in text
  const expandSpy = jest
    .spyOn(onlineChatSkill, 'sendChatMessage')
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        reply: '{"keywords":["mitochondria","ATP","cellular respiration"]}',
        sources: [],
        usedHandbook: false,
      },
    });
  const streamSpy = jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        reply:
          'The powerhouse organelle is mitochondria, producing ATP (Biology Ch3, p. 1).',
        sources: [],
        usedHandbook: false,
      },
    });

  const rescued = await askUserMaterials(
    owner,
    'Which powerhouse organelle creates energy currency?',
    {materialIds: [mat.id], scopeKey: mat.id},
  );
  expect(expandSpy).toHaveBeenCalledTimes(1);
  expect(streamSpy).toHaveBeenCalledTimes(1);
  expect(rescued.usedOnline).toBe(true);
  expect(rescued.sources.length).toBeGreaterThan(0);

  // Off-topic question even after expansion must fail closed and never invoke streamChatMessage
  expandSpy.mockResolvedValueOnce({
    status: 'success',
    data: {
      reply: '{"keywords":["treaty","versailles","world war"]}',
      sources: [],
      usedHandbook: false,
    },
  });
  const refused = await askUserMaterials(owner, 'What caused World War One?', {
    materialIds: [mat.id],
    scopeKey: mat.id,
  });
  expect(streamSpy).toHaveBeenCalledTimes(1);
  expect(refused.insufficientEvidence).toBe(true);
  expect(refused.assistantMessage.content).toBe(MATERIAL_NO_EVIDENCE_REPLY);
  expect(refused.sources).toEqual([]);
});

test('offline mode and online stream errors fall back gracefully to verified verbatim excerpts', async () => {
  const mat = seedBiologyMaterial();
  // Offline (onlineMode false / no token)
  localSettingsStore.set(owner, 'chat.onlineMode', 'false');
  const streamSpy = jest.spyOn(onlineChatSkill, 'streamChatMessage');

  const offlineRes = await askUserMaterials(owner, 'What is chlorophyll?', {
    materialIds: [mat.id],
    scopeKey: mat.id,
  });
  expect(streamSpy).not.toHaveBeenCalled();
  expect(offlineRes.usedOnline).toBe(false);
  expect(offlineRes.assistantMessage.content).toContain(
    'Chlorophyll absorbs sunlight',
  );
  expect(offlineRes.sources[0].pageLabel).toBe('p. 2');

  // Online mode enabled, but DeepSeek stream fails -> still shows verified excerpt
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');
  streamSpy.mockResolvedValueOnce({
    status: 'rate_limited',
    error: 'Rate limit reached.',
  });

  const fallbackRes = await askUserMaterials(
    owner,
    'What does chlorophyll absorb?',
    {
      materialIds: [mat.id],
      scopeKey: mat.id,
    },
  );
  expect(fallbackRes.usedOnline).toBe(false);
  expect(fallbackRes.fallbackNote).toContain('Online AI limit reached');
  expect(fallbackRes.assistantMessage.content).toContain(
    'Chlorophyll absorbs sunlight',
  );
  expect(fallbackRes.sources[0].pageLabel).toBe('p. 2');
});

test('active-owner guard rejects stale user writes during async streaming', async () => {
  const mat = seedBiologyMaterial();
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');

  jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockImplementation(async () => {
      userStore.logout();
      return {
        status: 'success',
        data: {reply: 'Should not save', sources: [], usedHandbook: false},
      };
    });

  await expect(
    askUserMaterials(owner, 'What is ATP?', {
      materialIds: [mat.id],
      scopeKey: mat.id,
    }),
  ).rejects.toThrow('no longer active');

  // The assistant reply was blocked, and the question is not left behind
  // unanswered (2026-11-22): the thread is exactly as it was before asking.
  const saved = materialStore.listMessages(owner, mat.id);
  expect(saved).toHaveLength(0);
});

test('citation disclaimer check preserves valid academic sentences, filters prior refusals, and honors AbortSignal & material deletion', async () => {
  const mat = seedBiologyMaterial();
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');

  // Seed a prior off-topic refusal pair to verify it gets excluded from LLM prompt history
  materialStore.addMessage(owner, {
    scopeKey: mat.id,
    sender: 'user',
    content: 'Unrelated off-topic question',
  });
  materialStore.addMessage(owner, {
    scopeKey: mat.id,
    sender: 'assistant',
    content: MATERIAL_NO_EVIDENCE_REPLY,
  });

  const streamSpy = jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockImplementationOnce(async messages => {
      const historyContents = messages.map(m => m.content).join('\n');
      expect(historyContents).not.toContain('Unrelated off-topic question');
      expect(historyContents).not.toContain(MATERIAL_NO_EVIDENCE_REPLY);
      return {
        status: 'success',
        data: {
          reply:
            'Unlike eukaryotes, prokaryotes do not contain mitochondria (Biology Ch3, p. 1).',
          sources: [],
          usedHandbook: false,
        },
      };
    });

  const validRes = await askUserMaterials(
    owner,
    'Where is ATP made in cellular respiration?',
    {materialIds: [mat.id], scopeKey: mat.id},
  );
  expect(validRes.sources.length).toBeGreaterThan(0);

  // Abort before any text arrives -> throws MaterialQaAbortedError and cleans dangling user turn
  const beforeCount = materialStore.listMessages(owner, mat.id).length;
  const ac1 = new AbortController();
  streamSpy.mockImplementationOnce(async (_messages, options) => {
    ac1.abort();
    expect(options.signal?.aborted).toBe(true);
    return {status: 'server_unavailable', error: 'cancelled'};
  });
  await expect(
    askUserMaterials(owner, 'What is chlorophyll?', {
      materialIds: [mat.id],
      scopeKey: mat.id,
      signal: ac1.signal,
    }),
  ).rejects.toBeInstanceOf(MaterialQaAbortedError);
  expect(materialStore.listMessages(owner, mat.id)).toHaveLength(beforeCount);

  // Abort mid-stream with partial reply -> persists partial reply with Stopped early note
  const ac2 = new AbortController();
  streamSpy.mockImplementationOnce(async () => {
    ac2.abort();
    return {
      status: 'success',
      data: {
        reply: 'Chlorophyll absorbs sunlight (Biology Ch3, p. 2)',
        sources: [],
        usedHandbook: false,
      },
    };
  });
  const partialRes = await askUserMaterials(owner, 'What is chlorophyll?', {
    materialIds: [mat.id],
    scopeKey: mat.id,
    signal: ac2.signal,
  });
  expect(partialRes.assistantMessage.content).toContain('Stopped early');
  expect(partialRes.usedOnline).toBe(true);

  // Material deleted mid-flight -> blocks orphaned assistant write
  streamSpy.mockImplementationOnce(async () => {
    materialStore.deleteMaterial(owner, mat.id);
    return {
      status: 'success',
      data: {
        reply: 'Should not write orphan.',
        sources: [],
        usedHandbook: false,
      },
    };
  });
  await expect(
    askUserMaterials(owner, 'What is ATP?', {
      materialIds: [mat.id],
      scopeKey: mat.id,
    }),
  ).rejects.toThrow('deleted');

  // Online status reasons
  expect(getMaterialOnlineStatus(owner, false).reason).toBe('offline_network');
  expect(getMaterialOnlineStatus(owner, true).reason).toBe('ready');
  cloudClient.setAccessToken(null);
  expect(getMaterialOnlineStatus(owner, true).reason).toBe(
    'guest_or_signed_out',
  );
  cloudClient.setAccessToken('online-token');
  localSettingsStore.set(owner, 'chat.onlineMode', 'false');
  expect(getMaterialOnlineStatus(owner, true).reason).toBe('online_mode_off');
});

test('a failed online answer does not leave the question saved unanswered', async () => {
  const mat = seedBiologyMaterial();
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');
  jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockRejectedValueOnce(new Error('Socket closed'));

  await expect(
    askUserMaterials(owner, 'What does cellular respiration produce?', {
      materialIds: [mat.id],
      scopeKey: mat.id,
    }),
  ).rejects.toThrow('Socket closed');
  expect(materialStore.listMessages(owner, mat.id)).toHaveLength(0);
});

test('an unanswered question left by an older build is not sent again as context', async () => {
  const mat = seedBiologyMaterial();
  localSettingsStore.set(owner, 'chat.onlineMode', 'true');
  cloudClient.setAccessToken('online-token');
  materialStore.addMessage(owner, {
    scopeKey: mat.id,
    sender: 'user',
    content: 'Orphaned question with no answer',
  });
  const streamSpy = jest
    .spyOn(onlineChatSkill, 'streamChatMessage')
    .mockResolvedValueOnce({
      status: 'success',
      data: {
        reply: 'It produces ATP (Biology Notes, p. 1).',
        sources: [],
        usedHandbook: false,
      },
    });

  await askUserMaterials(owner, 'What does cellular respiration produce?', {
    materialIds: [mat.id],
    scopeKey: mat.id,
  });
  const sent = streamSpy.mock.calls[0][0];
  expect(sent.map(m => m.content).join('\n')).not.toContain(
    'Orphaned question with no answer',
  );
  // Roles alternate: never two student turns in a row.
  for (let i = 1; i < sent.length; i += 1) {
    expect(sent[i].role === 'user' && sent[i - 1].role === 'user').toBe(false);
  }
});
