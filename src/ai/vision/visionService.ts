import {NativeModules, Platform} from 'react-native';
import {pick, types} from '@react-native-documents/picker';
import {
  parseScannedSchedule,
  type ParsedScheduleResult,
} from './scheduleParser';
import {parseUstpCor, type ParsedUstpCorResult} from './ustpCorParser';
import {chooseCorReading} from './corExtraction';
import type {CorPageWords, CorWord} from './corLayoutParser';

interface NativeVisionModule {
  isAvailable(): Promise<boolean>;
  takePhoto(): Promise<{uri: string; path: string} | null>;
  recognizeText(uriString: string): Promise<{
    text: string;
    structuredText?: string;
    blockCount: number;
    imageWidth?: number;
    imageHeight?: number;
    words?: CorWord[];
  }>;
  /** Exact PDF text layer as positioned words; null when the file is not a PDF. */
  extractPdfWords?(uriString: string): Promise<CorPageWords | null>;
}

const LafinaVision: NativeVisionModule | undefined = NativeModules.LafinaVision;

/** The PDF text layer reads in about a second; past this, fall back to OCR. */
const PDF_TEXT_TIMEOUT_MS = 15000;
/** OCR of one page takes a few seconds; past this, the import reports a failure. */
const OCR_TIMEOUT_MS = 60000;

/** Rejects if a native call does not settle in time (a stuck call never blocks the import). */
const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

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
    return {uri: result.uri, path: result.path};
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
      if (
        err?.code === 'OPERATION_CANCELLED' ||
        err?.message?.includes('cancel')
      ) {
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
      if (
        err?.code === 'OPERATION_CANCELLED' ||
        err?.message?.includes('cancel')
      ) {
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

  /**
   * Reads a USTP COR for the review flow, choosing the most trustworthy reading:
   * the PDF's own text layer when available (exact), otherwise OCR read by
   * column layout or as text, whichever passes more of the automatic checks.
   * The result carries `checks` describing anything the student should verify.
   */
  extractUstpCorFromUri: async (
    uri: string,
  ): Promise<{text: string; parsed: ParsedUstpCorResult}> => {
    if (Platform.OS === 'android' && LafinaVision?.extractPdfWords) {
      try {
        const pdfWords = await withTimeout(
          LafinaVision.extractPdfWords(uri),
          PDF_TEXT_TIMEOUT_MS,
          'Reading the PDF text took too long.',
        );
        if (pdfWords && pdfWords.words.length > 0) {
          const reading = chooseCorReading({pdfWords});
          if (reading) return reading;
        }
      } catch (error) {
        // A damaged or protected PDF still gets the OCR path below.
        console.warn('[visionService] PDF text layer unavailable:', error);
      }
    }
    if (Platform.OS !== 'android' || !LafinaVision?.recognizeText) {
      return {text: '', parsed: parseUstpCor('')};
    }
    const ocr = await withTimeout(
      LafinaVision.recognizeText(uri),
      OCR_TIMEOUT_MS,
      'Reading the COR took too long. Try the COR PDF from the student portal.',
    );
    const ocrText = (ocr?.structuredText || ocr?.text || '').trim();
    const ocrWords: CorPageWords | null =
      ocr?.words && ocr.words.length > 0
        ? {
            source: 'ocr',
            pageWidth: ocr.imageWidth ?? 0,
            pageHeight: ocr.imageHeight ?? 0,
            words: ocr.words,
          }
        : null;
    const reading = chooseCorReading({ocrWords, ocrText});
    return reading ?? {text: ocrText, parsed: parseUstpCor(ocrText)};
  },
};
