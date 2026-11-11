import { NativeModules, Platform } from 'react-native';
import { pick, types } from '@react-native-documents/picker';
import { parseScannedSchedule, type ParsedScheduleResult } from './scheduleParser';
import { parseUstpCor, type ParsedUstpCorResult } from './ustpCorParser';

interface NativeVisionModule {
  isAvailable(): Promise<boolean>;
  takePhoto(): Promise<{ uri: string; path: string } | null>;
  recognizeText(uriString: string): Promise<{
    text: string;
    structuredText?: string;
    blockCount: number;
  }>;
}

const LafinaVision: NativeVisionModule | undefined = NativeModules.LafinaVision;

export interface PhotoCaptureResult {
  uri: string;
  path?: string;
  name?: string;
  fileName?: string;
  mimeType?: string;
}

export const visionService = {
  /**
   * Whether the native camera and text recognition service is available.
   */
  isAvailable: async (): Promise<boolean> => {
    if (Platform.OS !== 'android' || !LafinaVision) return false;
    try {
      return await LafinaVision.isAvailable();
    } catch {
      return false;
    }
  },

  /**
   * Opens the native camera to capture a photo of a schedule, syllabus, or notes.
   * Resolves with the captured file URI, or null if the user cancelled.
   */
  takePhoto: async (): Promise<PhotoCaptureResult | null> => {
    if (Platform.OS !== 'android' || !LafinaVision?.takePhoto) {
      throw new Error('Camera is only supported on Android devices.');
    }
    const result = await LafinaVision.takePhoto();
    if (!result?.uri) return null;
    return { uri: result.uri, path: result.path };
  },

  /**
   * Opens the system photo picker to choose an existing photo or screenshot.
   * Resolves with the photo URI, or null if cancelled.
   */
  pickImageFromGallery: async (): Promise<PhotoCaptureResult | null> => {
    try {
      const [res] = await pick({
        type: [types.images],
      });
      if (!res?.uri) return null;
      return {
        uri: res.uri,
        name: res.name || undefined,
        fileName: res.name || undefined,
        mimeType: res.type || undefined,
      };
    } catch (err: any) {
      if (err?.code === 'OPERATION_CANCELLED' || err?.message?.includes('cancel')) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Opens the system document picker to choose a USTP COR PDF or image screenshot.
   */
  pickCorDocument: async (): Promise<PhotoCaptureResult | null> => {
    try {
      const [res] = await pick({
        type: [types.pdf, types.images],
      });
      if (!res?.uri) return null;
      return {
        uri: res.uri,
        name: res.name || undefined,
        fileName: res.name || undefined,
        mimeType: res.type || undefined,
      };
    } catch (err: any) {
      if (err?.code === 'OPERATION_CANCELLED' || err?.message?.includes('cancel')) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Performs on-device ML Kit OCR to recognize text in the given image/PDF URI.
   */
  recognizeText: async (uri: string): Promise<string> => {
    if (Platform.OS !== 'android' || !LafinaVision?.recognizeText) {
      return '';
    }
    const result = await LafinaVision.recognizeText(uri);
    return (result?.text || '').trim();
  },

  /**
   * Performs coordinate-sorted OCR tailored for multi-column tables like USTP CORs.
   */
  recognizeCorText: async (uri: string): Promise<string> => {
    if (Platform.OS !== 'android' || !LafinaVision?.recognizeText) {
      return '';
    }
    const result = await LafinaVision.recognizeText(uri);
    return (result?.structuredText || result?.text || '').trim();
  },

  /**
   * High-level flow: extracts text from an image URI and parses schedule classes.
   */
  scanScheduleFromUri: async (uri: string): Promise<ParsedScheduleResult> => {
    const text = await visionService.recognizeText(uri);
    return parseScannedSchedule(text);
  },

  /**
   * High-level flow: extracts coordinate-sorted text from a USTP COR PDF or image URI
   * and parses both Student General Information and the Enrolled Subjects Schedule.
   */
  scanUstpCorFromUri: async (uri: string): Promise<ParsedUstpCorResult> => {
    const text = await visionService.recognizeCorText(uri);
    return parseUstpCor(text);
  },
};
