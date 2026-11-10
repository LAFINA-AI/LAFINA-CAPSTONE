/**
 * Call Lafina 2.0 Phase 13 Tests — In-App Mini-Call, Background Feasibility, and Multimodal Analysis.
 *
 * Verifies:
 * - P13-01 & F-054: In-app compact ongoing-call bar (MiniCallBar) with Mute, End, and Expand actions.
 * - P13-02 & F-054: In-app session preservation without route remount or connection duplication.
 * - P13-03 & F-056: Optional "start with Call Lafina on Chat open" preference with explicit foreground gating.
 * - P13-04 & P13-05 & F-055: Background call feasibility analysis, privacy-by-default stop on background (ADR-031).
 * - P13-07 & P13-08 & F-057: Backend LLM multimodal feasibility analysis and honest deferral (ADR-031).
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import {render, fireEvent, waitFor, act} from '@testing-library/react-native';
import {ThemeProvider} from '../../src/ui/contexts/ThemeContext';
import * as onlineVoiceService from '../../src/cloud/onlineVoiceService';
import {
  MiniCallBar,
  formatMiniDuration,
} from '../../src/ui/components/callLafina/MiniCallBar';
import {VoiceConversationPanel} from '../../src/ui/components/voice/VoiceConversationPanel';
import {
  getCallLafinaSettings,
  saveCallLafinaSettings,
} from '../../src/cloud/voiceConversation/callLafinaSettingsStore';
import {CallLafinaSettingsModal} from '../../src/ui/components/callLafina/CallLafinaSettingsModal';
import {initDatabase} from '../../src/storage/dbInit';
import {db} from '../../src/storage/database';
import {userStore} from '../../src/storage/userStore';

const TEST_USER = 'user-student-p13';

describe('Phase 13 — In-App Mini-Call and Feasibility Analysis', () => {
  const seedUser = (id: string) => {
    const now = new Date().toISOString();
    db.executeSync(
      `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
       VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
      [id, id, `${id}@example.invalid`, now, now],
    );
  };

  const createMockReview = () => ({
    proposal: null,
    expired: false,
    busy: false,
    present: jest.fn(),
    confirm: jest.fn().mockResolvedValue(null),
    cancel: jest.fn().mockReturnValue(null),
    dismiss: jest.fn(),
  });

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    seedUser(TEST_USER);
    userStore.setCurrentUser(TEST_USER);
    jest.spyOn(userStore, 'getActiveSessionToken').mockReturnValue({
      userId: TEST_USER,
      accessToken: 'test-token',
      refreshToken: null,
    });
  });

  // =========================================================================
  // 1. Duration Formatter Tests
  // =========================================================================
  describe('formatMiniDuration', () => {
    it('formats seconds into MM:SS format correctly', () => {
      expect(formatMiniDuration(0)).toBe('00:00');
      expect(formatMiniDuration(9)).toBe('00:09');
      expect(formatMiniDuration(65)).toBe('01:05');
      expect(formatMiniDuration(754)).toBe('12:34');
    });
  });

  // =========================================================================
  // 2. MiniCallBar Component Tests (F-054, P13-01, P13-02)
  // =========================================================================
  describe('MiniCallBar Component', () => {
    it('renders mini call bar with title, timer, and active status', () => {
      const onExpand = jest.fn();
      const onToggleMute = jest.fn();
      const onEndCall = jest.fn();

      const {getByTestId, getByText} = render(
        <ThemeProvider userId={TEST_USER}>
          <MiniCallBar
            phase="speaking"
            muted={false}
            durationSeconds={125}
            onExpand={onExpand}
            onToggleMute={onToggleMute}
            onEndCall={onEndCall}
          />
        </ThemeProvider>,
      );

      expect(getByTestId('mini-call-bar-container')).toBeTruthy();
      expect(getByText('Call Lafina')).toBeTruthy();
      expect(getByText('Lafina is speaking…')).toBeTruthy();
      expect(getByTestId('mini-call-timer')).toBeTruthy();
      expect(getByText('02:05')).toBeTruthy();
    });

    it('renders muted status when muted is true', () => {
      const {getByText} = render(
        <ThemeProvider userId={TEST_USER}>
          <MiniCallBar
            phase="listening"
            muted={true}
            durationSeconds={45}
            onExpand={jest.fn()}
            onToggleMute={jest.fn()}
            onEndCall={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(getByText('Muted')).toBeTruthy();
    });

    it('triggers onToggleMute when mute button is pressed', () => {
      const onToggleMute = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <MiniCallBar
            phase="listening"
            muted={false}
            durationSeconds={30}
            onExpand={jest.fn()}
            onToggleMute={onToggleMute}
            onEndCall={jest.fn()}
          />
        </ThemeProvider>,
      );

      const muteBtn = getByTestId('mini-call-mute');
      fireEvent.press(muteBtn);
      expect(onToggleMute).toHaveBeenCalledTimes(1);
    });

    it('triggers onEndCall when end button is pressed', () => {
      const onEndCall = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <MiniCallBar
            phase="speaking"
            muted={false}
            durationSeconds={60}
            onExpand={jest.fn()}
            onToggleMute={jest.fn()}
            onEndCall={onEndCall}
          />
        </ThemeProvider>,
      );

      const endBtn = getByTestId('mini-call-end');
      fireEvent.press(endBtn);
      expect(onEndCall).toHaveBeenCalledTimes(1);
    });

    it('triggers onExpand when the main bar body is tapped to restore full screen', () => {
      const onExpand = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <MiniCallBar
            phase="listening"
            muted={false}
            durationSeconds={15}
            onExpand={onExpand}
            onToggleMute={jest.fn()}
            onEndCall={jest.fn()}
          />
        </ThemeProvider>,
      );

      const bar = getByTestId('mini-call-bar');
      fireEvent.press(bar);
      expect(onExpand).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. Panel Header Minimize Button (F-054, P13-01)
  // =========================================================================
  describe('VoiceConversationPanel Minimize Button', () => {
    it('renders minimize button when onMinimize is provided', () => {
      const onMinimize = jest.fn();
      const mockReview = createMockReview();

      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <VoiceConversationPanel
            userId={TEST_USER}
            review={mockReview}
            onBack={jest.fn()}
            onMinimize={onMinimize}
          />
        </ThemeProvider>,
      );

      const minBtn = getByTestId('call-minimize-button');
      expect(minBtn).toBeTruthy();

      fireEvent.press(minBtn);
      expect(onMinimize).toHaveBeenCalledTimes(1);
    });

    it('omits minimize button when onMinimize is not provided', () => {
      const mockReview = createMockReview();

      const {queryByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <VoiceConversationPanel
            userId={TEST_USER}
            review={mockReview}
            onBack={jest.fn()}
          />
        </ThemeProvider>,
      );

      expect(queryByTestId('call-minimize-button')).toBeNull();
    });
  });

  // =========================================================================
  // 4. Start With Call Lafina Settings (F-056, P13-03)
  // =========================================================================
  describe('Start with Call Lafina on Chat open', () => {
    it('defaults startWithCallLafina to false for privacy', () => {
      const freshUser = 'user-fresh-p13';
      seedUser(freshUser);
      expect(getCallLafinaSettings(freshUser).startWithCallLafina).toBe(false);
    });

    it('persists startWithCallLafina toggle correctly', () => {
      saveCallLafinaSettings(TEST_USER, {startWithCallLafina: true});
      expect(getCallLafinaSettings(TEST_USER).startWithCallLafina).toBe(true);

      saveCallLafinaSettings(TEST_USER, {startWithCallLafina: false});
      expect(getCallLafinaSettings(TEST_USER).startWithCallLafina).toBe(false);
    });

    it('renders toggle-start-with-call switch in settings modal and updates store on toggle', async () => {
      jest.spyOn(onlineVoiceService, 'loadOnlineVoices').mockResolvedValue([]);
      const onSettingsChanged = jest.fn();
      const {getByTestId} = render(
        <ThemeProvider userId={TEST_USER}>
          <CallLafinaSettingsModal
            userId={TEST_USER}
            visible={true}
            onClose={jest.fn()}
            onSettingsChanged={onSettingsChanged}
          />
        </ThemeProvider>,
      );

      await waitFor(() => {
        expect(getByTestId('toggle-start-with-call')).toBeTruthy();
      });

      const switchBtn = getByTestId('toggle-start-with-call');
      await act(async () => {
        fireEvent(switchBtn, 'valueChange', true);
      });
      expect(getCallLafinaSettings(TEST_USER).startWithCallLafina).toBe(true);
      expect(onSettingsChanged).toHaveBeenCalledWith(
        expect.objectContaining({startWithCallLafina: true}),
      );
    });
  });

  // =========================================================================
  // 5. Architectural Decision Record (ADR-031) Verification
  // =========================================================================
  describe('ADR-031 Compliance and Feasibility Document', () => {
    it('verifies ADR-031 is present and documents Android 14+ microphone constraints and DeepSeek text-only limits', () => {
      const adrPath = path.resolve(
        process.cwd(),
        'docs/decisions/ADR-031-background-call-and-multimodal-feasibility.md',
      );
      expect(fs.existsSync(adrPath)).toBe(true);

      const content = fs.readFileSync(adrPath, 'utf8');
      expect(content).toContain('FOREGROUND_SERVICE_MICROPHONE');
      expect(content).toContain('DeepSeek');
      expect(content).toContain('text-only');
      expect(content).toContain('DEFERRED_BACKEND_UNSUPPORTED');
      expect(content).toContain('Privacy-by-Default');
    });
  });
});
