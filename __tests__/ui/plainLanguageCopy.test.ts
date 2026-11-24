/**
 * Plain-language copy: students never see vendor names, and call cards show
 * friendly dates and times instead of raw "2026-11-25" / "14:00" values.
 */
import {hideVendorNames} from '../../src/utils/vendorNames';
import {
  shortDate,
  time12,
} from '../../src/ui/components/callLafina/cards/cardFormat';
import {describeOnlineChatFailure} from '../../src/ai/chatOrchestrator';
import {
  OFFLINE_REPLY_NOTE,
  SIGNED_OUT_REPLY_NOTE,
} from '../../src/ai/localConversation';

describe('hideVendorNames', () => {
  it('replaces vendor names and capitalises at a sentence start', () => {
    expect(hideVendorNames('ElevenLabs is busy.')).toBe(
      'The online voice is busy.',
    );
    expect(hideVendorNames('Could not reach DeepSeek. Try again.')).toBe(
      'Could not reach the online assistant. Try again.',
    );
    expect(hideVendorNames('Nothing to hide here.')).toBe(
      'Nothing to hide here.',
    );
  });
});

describe('call card date and time formatting', () => {
  it('formats ISO dates and 24-hour times for reading', () => {
    expect(shortDate('2026-11-25')).toBe('Wed, Nov 25');
    expect(time12('14:05')).toBe('2:05 PM');
    expect(time12('00:30')).toBe('12:30 AM');
    expect(shortDate('someday')).toBe('someday');
  });
});

describe('chat failure copy', () => {
  it('never names the online vendors', () => {
    for (const status of [
      'auth_required',
      'account_disabled',
      'offline',
      'rate_limited',
      'server_error',
    ]) {
      expect(describeOnlineChatFailure(status)).not.toMatch(
        /DeepSeek|ElevenLabs/,
      );
    }
    expect(OFFLINE_REPLY_NOTE).not.toMatch(/DeepSeek/);
    expect(SIGNED_OUT_REPLY_NOTE).not.toMatch(/DeepSeek/);
  });
});
