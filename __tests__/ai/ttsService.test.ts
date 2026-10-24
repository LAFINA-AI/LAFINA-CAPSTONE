import Tts from 'react-native-tts';
import { selectOfflineVoice, ttsService } from '../../src/ai/tts/ttsService';

describe('Phase 01 react-native-tts Service (Replacing Kokoro 82M)', () => {
  test('selectOfflineVoice filters out uninstalled and network-required voices and prefers en-US', () => {
    const chosen = selectOfflineVoice([
      {
        id: 'cloud-voice',
        name: 'Cloud Voice',
        language: 'en-US',
        networkConnectionRequired: true,
        notInstalled: false,
      },
      {
        id: 'missing-voice',
        name: 'Missing Voice',
        language: 'en-US',
        networkConnectionRequired: false,
        notInstalled: true,
      },
      {
        id: 'local-en-gb',
        name: 'Local UK',
        language: 'en-GB',
        quality: 300,
        networkConnectionRequired: false,
        notInstalled: false,
      },
      {
        id: 'local-en-us',
        name: 'Local US High',
        language: 'en-US',
        quality: 500,
        networkConnectionRequired: false,
        notInstalled: false,
      },
    ]);

    expect(chosen?.id).toBe('local-en-us');
  });

  test('ttsService initializes react-native-tts and speaks text locally', async () => {
    await ttsService.init();
    expect(Tts.getInitStatus).toHaveBeenCalled();
    expect(Tts.setDefaultLanguage).toHaveBeenCalledWith('en-US');

    await ttsService.speak('Reminder: Thesis defense at 2 PM');
    expect(Tts.speak).toHaveBeenCalledWith('Reminder: Thesis defense at 2 PM');

    await ttsService.stop();
    expect(Tts.stop).toHaveBeenCalled();
  });
});
