import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import {
  deleteOfflineModel,
  getAllModelsStatus,
  getSelectedOfflineModelId,
  setSelectedOfflineModelId,
} from '../../src/ai/nlu/modelManager';
import { GUEST_USER_ID } from '../../src/constants';
import { db, initDatabase } from '../../src/storage';
import { ChatEngineSheet } from '../../src/ui/components/chat/ChatEngineSheet';
import { ThemeProvider } from '../../src/ui/contexts/ThemeContext';

describe('ChatEngineSheet Phone Spec AI Recommendation', () => {
  const rnfsMutable = RNFS as unknown as Record<string, unknown>;
  const originalPlatformOS = Platform.OS;
  const originalNativeExtractor = NativeModules.LafinaIntentExtractor;
  let mockFiles: Record<string, { size: number }> = {};
  let savedRnfsProps: Record<string, unknown> = {};

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    db.executeSync('DELETE FROM active_session');
    db.executeSync('DELETE FROM user_preferences');
    db.executeSync('DELETE FROM local_settings');

    mockFiles = {};
    savedRnfsProps = {
      exists: rnfsMutable.exists,
      stat: rnfsMutable.stat,
      mkdir: rnfsMutable.mkdir,
      unlink: rnfsMutable.unlink,
      downloadFile: rnfsMutable.downloadFile,
      stopDownload: rnfsMutable.stopDownload,
      moveFile: rnfsMutable.moveFile,
    };

    rnfsMutable.exists = jest.fn(async (filePath: string) =>
      Boolean(mockFiles[filePath]),
    );
    rnfsMutable.stat = jest.fn(async (filePath: string) => {
      if (!mockFiles[filePath]) {
        throw new Error('File does not exist');
      }
      return { size: mockFiles[filePath].size };
    });
    rnfsMutable.mkdir = jest.fn(async () => undefined);
    rnfsMutable.unlink = jest.fn(async (filePath: string) => {
      delete mockFiles[filePath];
    });
    rnfsMutable.downloadFile = jest.fn(
      ({
        toFile,
        progress,
      }: {
        toFile: string;
        progress?: (res: { bytesWritten: number; contentLength: number }) => void;
      }) => {
        const mockSize = String(toFile).includes('gemma-3-1b')
          ? 845000000
          : String(toFile).includes('gemma-3-270m')
            ? 193986560
            : 397800000;
        if (progress) {
          progress({ bytesWritten: mockSize, contentLength: mockSize });
        }
        return {
          jobId: 301,
          promise: Promise.resolve({ statusCode: 200 }).then(() => {
            mockFiles[toFile] = { size: mockSize };
            return { statusCode: 200 };
          }),
        };
      },
    );
    rnfsMutable.stopDownload = jest.fn();
    rnfsMutable.moveFile = jest.fn(async (from: string, to: string) => {
      mockFiles[to] = mockFiles[from] || { size: 845000000 };
      delete mockFiles[from];
    });
  });

  afterEach(async () => {
    await deleteOfflineModel('gemma-3-1b', GUEST_USER_ID);
    await deleteOfflineModel('gemma-3-270m', GUEST_USER_ID);
    setSelectedOfflineModelId('qwen2.5-0.5b', GUEST_USER_ID);

    Platform.OS = originalPlatformOS;
    if (originalNativeExtractor === undefined) {
      delete NativeModules.LafinaIntentExtractor;
    } else {
      NativeModules.LafinaIntentExtractor = originalNativeExtractor;
    }

    for (const [key, originalValue] of Object.entries(savedRnfsProps)) {
      if (originalValue === undefined) {
        delete rnfsMutable[key];
      } else {
        rnfsMutable[key] = originalValue;
      }
    }
  });

  test('recommends Gemma 3 1B on 8 GB phones and downloads & activates it in one tap', async () => {
    Platform.OS = 'android';
    NativeModules.LafinaIntentExtractor = {
      unloadModel: jest.fn(async () => true),
      getDeviceSpecs: jest.fn(async () => ({
        totalRamBytes: 7_900_000_000,
        availableRamBytes: 3_200_000_000,
        isLowRamDevice: false,
        isLowMemoryNow: false,
        cpuCores: 8,
        supports64Bit: true,
        primaryAbi: 'arm64-v8a',
        availableStorageBytes: 15_000_000_000,
        totalStorageBytes: 128_000_000_000,
        deviceLabel: 'Samsung SM-A546E',
        androidSdk: 34,
      })),
    };

    const modelsStatus = await getAllModelsStatus(GUEST_USER_ID);
    const onModelsUpdated = jest.fn(async () => undefined);

    const ui = render(
      <ThemeProvider userId={GUEST_USER_ID}>
        <ChatEngineSheet
          visible={true}
          onClose={jest.fn()}
          userId={GUEST_USER_ID}
          isOnlineMode={true}
          onToggleOnline={jest.fn()}
          selectedModelId={getSelectedOfflineModelId(GUEST_USER_ID)}
          modelsStatus={modelsStatus}
          onModelsUpdated={onModelsUpdated}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(ui.getByTestId('chat-engine-recommendation-card')).toBeTruthy();
      expect(
        ui.getByTestId('chat-engine-recommended-model').props.children,
      ).toBe('Gemma-3-1B-Instruct');
    });

    expect(ui.getByTestId('chat-engine-device-specs').props.children).toContain(
      '8 GB RAM',
    );
    expect(ui.getByTestId('chat-model-recommended-gemma-3-1b')).toBeTruthy();

    fireEvent.press(ui.getByTestId('chat-engine-download-recommended'));

    await waitFor(() => {
      expect(onModelsUpdated).toHaveBeenCalled();
      expect(getSelectedOfflineModelId(GUEST_USER_ID)).toBe('gemma-3-1b');
    });

    const refreshedStatuses = await getAllModelsStatus(GUEST_USER_ID);
    ui.rerender(
      <ThemeProvider userId={GUEST_USER_ID}>
        <ChatEngineSheet
          visible={true}
          onClose={jest.fn()}
          userId={GUEST_USER_ID}
          isOnlineMode={false}
          onToggleOnline={jest.fn()}
          selectedModelId={getSelectedOfflineModelId(GUEST_USER_ID)}
          modelsStatus={refreshedStatuses}
          onModelsUpdated={onModelsUpdated}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(ui.getByTestId('chat-engine-recommended-active')).toBeTruthy();
    });

    ui.unmount();
  });

  test('recommends Gemma 3 270M on 4 GB phones and flags Gemma 3 1B with RAM warning', async () => {
    Platform.OS = 'android';
    NativeModules.LafinaIntentExtractor = {
      unloadModel: jest.fn(async () => true),
      getDeviceSpecs: jest.fn(async () => ({
        totalRamBytes: 3_900_000_000,
        availableRamBytes: 1_500_000_000,
        isLowRamDevice: false,
        isLowMemoryNow: false,
        cpuCores: 8,
        supports64Bit: true,
        primaryAbi: 'arm64-v8a',
        availableStorageBytes: 6_000_000_000,
        totalStorageBytes: 64_000_000_000,
        deviceLabel: 'Redmi 13C',
        androidSdk: 34,
      })),
    };

    const modelsStatus = await getAllModelsStatus(GUEST_USER_ID);
    const ui = render(
      <ThemeProvider userId={GUEST_USER_ID}>
        <ChatEngineSheet
          visible={true}
          onClose={jest.fn()}
          userId={GUEST_USER_ID}
          isOnlineMode={false}
          onToggleOnline={jest.fn()}
          selectedModelId={getSelectedOfflineModelId(GUEST_USER_ID)}
          modelsStatus={modelsStatus}
          onModelsUpdated={jest.fn()}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        ui.getByTestId('chat-engine-recommended-model').props.children,
      ).toBe('Gemma-3-270M-Instruct');
    });

    expect(ui.getByTestId('chat-model-recommended-gemma-3-270m')).toBeTruthy();
    expect(
      ui.getByTestId('chat-model-compat-gemma-3-1b').props.children.props
        .children,
    ).toBe('Needs 6GB+ RAM');
    expect(
      ui.getByTestId('chat-model-compat-qwen2.5-0.5b').props.children.props
        .children,
    ).toContain('Taglish');

    ui.unmount();
  });
});
