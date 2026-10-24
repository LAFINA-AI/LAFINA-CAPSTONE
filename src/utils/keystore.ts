import { NativeModules, Platform } from 'react-native';

const { AndroidKeystoreModule } = NativeModules;

export const secureKeystore = {
  /**
   * Encrypts sensitive string using Android Keystore AES-GCM or test fallback.
   */
  encryptString: async (plainText: string): Promise<string> => {
    if (Platform.OS === 'android') {
      if (
        !AndroidKeystoreModule ||
        typeof AndroidKeystoreModule.encryptString !== 'function'
      ) {
        throw new Error(
          'Android Keystore is unavailable. Cloud credentials were not saved.',
        );
      }
      try {
        return await AndroidKeystoreModule.encryptString(plainText);
      } catch {
        throw new Error(
          'Android Keystore encryption failed. Cloud credentials were not saved.',
        );
      }
    }
    // Non-Android test fallback. Production Android never stores this representation.
    return `mock_enc_${Buffer.from(plainText).toString('base64')}`;
  },

  /**
   * Decrypts ciphertext string using Android Keystore AES-GCM or test fallback.
   */
  decryptString: async (cipherText: string): Promise<string> => {
    if (Platform.OS === 'android') {
      if (
        !AndroidKeystoreModule ||
        typeof AndroidKeystoreModule.decryptString !== 'function'
      ) {
        throw new Error(
          'Android Keystore is unavailable. Cloud credentials cannot be renewed.',
        );
      }
      try {
        return await AndroidKeystoreModule.decryptString(cipherText);
      } catch {
        throw new Error(
          'Android Keystore decryption failed. Cloud credentials cannot be renewed.',
        );
      }
    }
    // Non-Android test fallback.
    if (cipherText.startsWith('mock_enc_')) {
      const b64 = cipherText.replace('mock_enc_', '');
      return Buffer.from(b64, 'base64').toString('utf-8');
    }
    return cipherText;
  },
};
