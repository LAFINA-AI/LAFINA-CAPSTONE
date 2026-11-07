/**
 * Online replies appear while DeepSeek writes them (POST /v1/ai/chat/stream),
 * with a fallback to the regular endpoint when the stream route is missing or
 * fails before any text. Only the finished reply is saved.
 */
import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {chatStore, initDatabase, userStore} from '../../src/storage';
import {
  chatOrchestrator,
  INTERRUPTED_REPLY_NOTE,
} from '../../src/ai/chatOrchestrator';
import {cloudClient, setMockOnlineState} from '../../src/cloud/cloudClient';
import type {CloudStreamOptions} from '../../src/cloud/cloudClient';
import {
  onlineChatSkill,
  resetChatStreamSupport,
} from '../../src/skills/onlineChatSkill';
import {ChatScreen} from '../../src/ui/screens/ChatScreen';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import {GUEST_USER_ID} from '../../src/constants';

const sse = (...events: object[]): string =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
const delta = (text: string) => ({type: 'delta', text});
const DONE = {
  type: 'done',
  provider: 'deepseek',
  usedHandbook: false,
  sources: [],
};

/** Makes cloudClient.stream deliver `pieces` one by one, then resolve. */
const streamDelivers = (
  pieces: string[],
  result: Awaited<ReturnType<typeof cloudClient.stream>> = {
    status: 'success',
    data: pieces.join(''),
    httpStatus: 200,
  },
) =>
  jest
    .spyOn(cloudClient, 'stream')
    .mockImplementation(async (_path, _body, options: CloudStreamOptions) => {
      pieces.forEach(piece => options.onText(piece));
      return result;
    });

const history = [{role: 'user' as const, content: 'hi'}];

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  userStore.createGuestUser();
  chatStore.clearHistory(GUEST_USER_ID);
  resetChatStreamSupport();
});

afterEach(() => {
  jest.restoreAllMocks();
  setMockOnlineState(null);
});

describe('onlineChatSkill.streamChatMessage', () => {
  it('reports the reply as it grows, even when events are split across pieces', async () => {
    const body = sse(
      delta('Hey'),
      delta(' there,'),
      delta(' LAFINA here!'),
      DONE,
    );
    // Cut mid-event and mid-JSON, as a network would.
    streamDelivers([
      body.slice(0, 7),
      body.slice(7, 40),
      body.slice(40, 75),
      body.slice(75),
    ]);
    const seen: string[] = [];
    const result = await onlineChatSkill.streamChatMessage(history, {
      onReplyText: text => seen.push(text),
    });
    expect(result.status).toBe('success');
    expect(result.data?.reply).toBe('Hey there, lafina here!');
    expect(result.data?.interrupted).toBeUndefined();
    expect(seen[seen.length - 1]).toBe('Hey there, lafina here!');
    expect(seen.length).toBeGreaterThan(1);
    // Every update extends the previous one.
    seen
      .slice(1)
      .forEach((text, i) => expect(text.startsWith(seen[i])).toBe(true));
  });

  it('keeps handbook sources from the final event', async () => {
    streamDelivers([
      sse(delta('Per the handbook...'), {
        ...DONE,
        usedHandbook: true,
        sources: [
          {page: '12', pageEnd: '12', section: 'Attendance', score: 0.9},
        ],
      }),
    ]);
    const result = await onlineChatSkill.streamChatMessage(history, {
      onReplyText: () => undefined,
    });
    expect(result.data?.usedHandbook).toBe(true);
    expect(result.data?.sources[0]).toMatchObject({
      page: 12,
      section: 'Attendance',
    });
  });

  it('falls back to the regular endpoint when the stream route is not deployed, and remembers', async () => {
    const stream = streamDelivers([], {
      status: 'validation_error',
      error: 'Not Found',
      httpStatus: 404,
    });
    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {reply: 'Hello! What are we working on?', sources: []},
    } as never);
    const onReplyText = jest.fn();
    const first = await onlineChatSkill.streamChatMessage(history, {
      onReplyText,
    });
    expect(first.data?.reply).toBe('Hello! What are we working on?');
    expect(request).toHaveBeenCalledWith(
      '/v1/ai/chat',
      expect.anything(),
      true,
    );
    await onlineChatSkill.streamChatMessage(history, {onReplyText});
    expect(stream).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(onReplyText).not.toHaveBeenCalled();
  });

  it('falls back when the connection fails before any text', async () => {
    streamDelivers([], {status: 'server_unavailable', error: 'no response'});
    const request = jest.spyOn(cloudClient, 'request').mockResolvedValue({
      status: 'success',
      data: {reply: 'Here you go.', sources: []},
    } as never);
    const result = await onlineChatSkill.streamChatMessage(history, {
      onReplyText: () => undefined,
    });
    expect(result.data?.reply).toBe('Here you go.');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['rate_limited', 429],
    ['auth_required', 401],
    ['subscription_required', 403],
  ] as const)(
    'returns %s without a second request',
    async (status, httpStatus) => {
      streamDelivers([], {status, error: 'no', httpStatus});
      const request = jest.spyOn(cloudClient, 'request');
      const result = await onlineChatSkill.streamChatMessage(history, {
        onReplyText: () => undefined,
      });
      expect(result.status).toBe(status);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'an error event',
      [
        sse(delta('Sure, the first step is'), {
          type: 'error',
          status: 504,
          message: 'x',
        }),
      ],
      undefined,
    ],
    [
      'a dropped connection',
      [sse(delta('Sure, the first step is'))],
      {status: 'server_unavailable' as const, error: 'dropped'},
    ],
  ])(
    'marks a reply cut off by %s as interrupted',
    async (_label, pieces, result) => {
      streamDelivers(pieces, result);
      const request = jest.spyOn(cloudClient, 'request');
      const reply = await onlineChatSkill.streamChatMessage(history, {
        onReplyText: () => undefined,
      });
      expect(reply.data?.reply).toBe('Sure, the first step is');
      expect(reply.data?.interrupted).toBe(true);
      expect(request).not.toHaveBeenCalled();
    },
  );
});

describe('cloudClient.stream over XMLHttpRequest', () => {
  type Listener = (() => void) | null;
  class FakeXhr {
    static last: FakeXhr;
    readyState = 0;
    status = 0;
    responseText = '';
    timeout = 0;
    headers: Record<string, string> = {};
    url = '';
    onprogress: Listener = null;
    onreadystatechange: Listener = null;
    onload: Listener = null;
    onerror: Listener = null;
    ontimeout: Listener = null;
    onabort: Listener = null;
    constructor() {
      FakeXhr.last = this;
    }
    open(_method: string, url: string) {
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send() {}
    abort() {
      this.onabort?.();
    }
    receive(text: string, status = 200) {
      this.status = status;
      this.readyState = 3;
      this.responseText += text;
      this.onprogress?.();
    }
    finish() {
      this.readyState = 4;
      this.onload?.();
    }
  }
  const g = globalThis as {XMLHttpRequest?: unknown};
  let original: unknown;
  beforeEach(() => {
    original = g.XMLHttpRequest;
    g.XMLHttpRequest = FakeXhr;
    setMockOnlineState(true);
    jest
      .spyOn(cloudClient, 'getAccessToken')
      .mockReturnValue('synthetic-token');
  });
  afterEach(() => {
    g.XMLHttpRequest = original;
  });

  it('hands over each new piece of the body as it arrives', async () => {
    const pieces: string[] = [];
    const pending = cloudClient.stream(
      '/v1/ai/chat/stream',
      {a: 1},
      {
        onText: piece => pieces.push(piece),
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    const xhr = FakeXhr.last;
    expect(xhr.url).toMatch(/\/v1\/ai\/chat\/stream$/);
    expect(xhr.headers.Authorization).toBe('Bearer synthetic-token');
    expect(xhr.headers.Accept).toBe('text/event-stream');
    xhr.receive('data: one');
    xhr.receive('\n\ndata: two\n\n');
    xhr.finish();
    const result = await pending;
    expect(pieces).toEqual(['data: one', '\n\ndata: two\n\n']);
    expect(result.status).toBe('success');
  });

  it('a finished reply resolves at once, while the server is still closing the connection', async () => {
    const pending = onlineChatSkill.streamChatMessage(
      [{role: 'user', content: 'hi'}],
      {useHandbook: false, onReplyText: () => undefined},
    );
    await waitFor(() => expect(FakeXhr.last?.url).toMatch(/chat\/stream$/));
    const xhr = FakeXhr.last;
    xhr.receive(
      sse(
        {type: 'delta', text: 'Hello there!'},
        {type: 'done', sources: [], usedHandbook: false},
      ),
    );
    // The server has not closed the connection (it is saving usage), yet the
    // reply is complete and returned.
    const result = await pending;
    expect(result).toMatchObject({
      status: 'success',
      data: {reply: 'Hello there!'},
    });
    expect(result.data?.interrupted).toBeUndefined();
    xhr.finish(); // closing later changes nothing
  });

  it('maps HTTP errors like a normal request and never passes error bodies on', async () => {
    const onText = jest.fn();
    const pending = cloudClient.stream('/v1/ai/chat/stream', {}, {onText});
    await Promise.resolve();
    await Promise.resolve();
    FakeXhr.last.receive(
      JSON.stringify({detail: 'Per-minute AI request limit exceeded.'}),
      429,
    );
    FakeXhr.last.finish();
    const result = await pending;
    expect(result).toMatchObject({status: 'rate_limited', httpStatus: 429});
    expect(onText).not.toHaveBeenCalled();
  });

  it('needs a signed-in account and a connection before sending anything', async () => {
    (cloudClient.getAccessToken as jest.Mock).mockReturnValue(null);
    expect(
      (await cloudClient.stream('/x', {}, {onText: jest.fn()})).status,
    ).toBe('auth_required');
    setMockOnlineState(false);
    expect(
      (await cloudClient.stream('/x', {}, {onText: jest.fn()})).status,
    ).toBe('offline');
  });
});

describe('Chat with a reply that streams', () => {
  it('passes the growing reply to the screen and saves only the finished one', async () => {
    streamDelivers([
      sse(delta('Good')),
      sse(delta(' morning!')),
      sse(delta(' Ready for today?'), DONE),
    ]);
    const partials: string[] = [];
    const result = await chatOrchestrator.processMessage(GUEST_USER_ID, 'hi', {
      onlineMode: true,
      onReplyText: text => partials.push(text),
    });
    expect(partials).toEqual([
      'Good',
      'Good morning!',
      'Good morning! Ready for today?',
    ]);
    expect(result.usedOnline).toBe(true);
    expect(result.reply).toBe('Good morning! Ready for today?');
    const stored = chatStore.getMessages(GUEST_USER_ID);
    expect(stored.map(m => m.content)).toEqual([
      'hi',
      'Good morning! Ready for today?',
    ]);
  });

  it('labels a cut-off reply instead of passing it off as complete', async () => {
    streamDelivers([
      sse(delta('The three steps are: first,'), {
        type: 'error',
        status: 504,
        message: 'x',
      }),
    ]);
    const result = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'explain the steps',
      {
        onlineMode: true,
        useHandbook: false,
        onReplyText: () => undefined,
      },
    );
    expect(result.reply).toBe(
      `The three steps are: first,\n\n${INTERRUPTED_REPLY_NOTE}`,
    );
    expect(result.usedOnline).toBe(true);
  });

  it('offline replies never touch the network, with or without a stream listener', async () => {
    const stream = jest.spyOn(cloudClient, 'stream');
    const onReplyText = jest.fn();
    const result = await chatOrchestrator.processMessage(
      GUEST_USER_ID,
      'hello',
      {
        onlineMode: false,
        onReplyText,
      },
    );
    expect(result.assistantMessage.localReply).toBe(true);
    expect(stream).not.toHaveBeenCalled();
    expect(onReplyText).not.toHaveBeenCalled();
  });

  it('ChatScreen shows the reply while it arrives, then the saved message in its place', async () => {
    jest.useFakeTimers();
    try {
      let finish: () => void = () => undefined;
      let grow: (text: string) => void = () => undefined;
      jest
        .spyOn(chatOrchestrator, 'processMessage')
        .mockImplementationOnce((owner, text, options) => {
          chatStore.addMessage(owner, 'user', text);
          grow = partial => options?.onReplyText?.(partial);
          return new Promise(resolve => {
            finish = () => {
              const saved = chatStore.addMessage(
                owner,
                'assistant',
                'Hey! How can I help?',
              );
              resolve({reply: saved.content, assistantMessage: saved} as never);
            };
          });
        });
      const utils = render(
        <ThemeProvider userId={GUEST_USER_ID}>
          <ChatScreen userId={GUEST_USER_ID} />
        </ThemeProvider>,
      );
      fireEvent.changeText(utils.getByTestId('chat-text-input'), 'hi');
      await act(async () => {
        fireEvent.press(utils.getByTestId('chat-send-button'));
      });
      expect(utils.getByTestId('typing-bubble')).toBeTruthy();

      act(() => grow('Hey!'));
      // The question shows at once, with the first words below it.
      expect(utils.getByText('hi')).toBeTruthy();
      expect(utils.getByTestId('chat-streaming-content')).toHaveTextContent(
        /^Hey!/,
      );
      expect(utils.queryByTestId('typing-bubble')).toBeNull();

      act(() => grow('Hey! How can'));
      act(() => grow('Hey! How can I help?'));
      act(() => {
        jest.advanceTimersByTime(60);
      });
      expect(utils.getByTestId('chat-streaming-content')).toHaveTextContent(
        /^Hey! How can I help\?/,
      );

      await act(async () => {
        finish();
      });
      expect(utils.queryByTestId('chat-streaming-content')).toBeNull();
      expect(utils.getAllByText('Hey! How can I help?')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
