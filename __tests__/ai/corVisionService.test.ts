/**
 * visionService.extractUstpCorFromUri: which reading is used, and that a
 * stuck or failing native call never blocks the COR import.
 */
import {
  buildSyntheticCorPage,
  toOcrPage,
  type SynthCor,
} from '../fixtures/corSynthetic';
import type {CorPageWords} from '../../src/ai/vision/corLayoutParser';

const COR: SynthCor = {
  registrationNo: '123456',
  studentNo: '2023000001',
  fullName: 'DELA CRUZ, JUAN MIGUEL S',
  gender: 'M',
  age: 21,
  college: 'COLLEGE OF INFORMATION TECHNOLOGY AND COMPUTING',
  program: 'B.S. in Information Technology',
  major: 'N/A',
  yearLevel: '4th Year - Baccalaureate',
  curriculum: 'CITC-BSIT-2018-2019',
  term: '1st Semester AY 2026-2027',
  campusLine: 'USTP CDO CAMPUS',
  courses: [
    {
      code: 'GnS',
      title: 'Gender and Society',
      lec: 3,
      lab: 0,
      credit: 3,
      section: 'IT4R11_Track2',
      sessions: [
        {
          dayCode: 'TF',
          start: '1:00 PM',
          end: '2:30 PM',
          room: '',
          faculty: 'Ana Reyes',
        },
      ],
    },
  ],
};

const pdfPage = buildSyntheticCorPage(COR);
const ocrPage = toOcrPage(pdfPage, {scale: 3});

const loadService = (native: Record<string, jest.Mock>) => {
  jest.resetModules();
  const RN = require('react-native');
  RN.Platform.OS = 'android';
  RN.NativeModules.LafinaVision = native;
  return require('../../src/ai/vision/visionService')
    .visionService as typeof import('../../src/ai/vision/visionService').visionService;
};

const ocrResult = (page: CorPageWords) => ({
  text: '',
  structuredText: '',
  blockCount: 1,
  imageWidth: page.pageWidth,
  imageHeight: page.pageHeight,
  words: page.words,
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a portal PDF is read from its text layer without running OCR', async () => {
  const native = {
    extractPdfWords: jest.fn().mockResolvedValue(pdfPage),
    recognizeText: jest.fn(),
  };
  const service = loadService(native);
  const {parsed} = await service.extractUstpCorFromUri('content://cor.pdf');
  expect(parsed.checks?.level).toBe('exact');
  expect(native.recognizeText).not.toHaveBeenCalled();
});

test('an image (no PDF text) is read with OCR word boxes', async () => {
  const native = {
    extractPdfWords: jest.fn().mockResolvedValue(null),
    recognizeText: jest.fn().mockResolvedValue(ocrResult(ocrPage)),
  };
  const service = loadService(native);
  const {parsed} = await service.extractUstpCorFromUri('content://cor.png');
  expect(parsed.extraction?.method).toBe('ocr_layout');
  expect(parsed.checks?.level).toBe('checked');
  expect(parsed.courses[0].sessions[0].days).toEqual(['Tuesday', 'Friday']);
});

test('a failing PDF reader falls back to OCR', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const native = {
    extractPdfWords: jest.fn().mockRejectedValue(new Error('damaged')),
    recognizeText: jest.fn().mockResolvedValue(ocrResult(ocrPage)),
  };
  const service = loadService(native);
  const {parsed} = await service.extractUstpCorFromUri('content://cor.pdf');
  expect(parsed.extraction?.method).toBe('ocr_layout');
});

test('a PDF reader that never answers falls back to OCR after the time limit', async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const native = {
    extractPdfWords: jest.fn().mockReturnValue(new Promise(() => {})),
    recognizeText: jest.fn().mockResolvedValue(ocrResult(ocrPage)),
  };
  const service = loadService(native);
  const pending = service.extractUstpCorFromUri('content://cor.pdf');
  await jest.advanceTimersByTimeAsync(15000);
  const {parsed} = await pending;
  expect(native.recognizeText).toHaveBeenCalled();
  expect(parsed.extraction?.method).toBe('ocr_layout');
});

test('OCR that never answers rejects instead of hanging the import', async () => {
  jest.useFakeTimers();
  const native = {
    extractPdfWords: jest.fn().mockResolvedValue(null),
    recognizeText: jest.fn().mockReturnValue(new Promise(() => {})),
  };
  const service = loadService(native);
  const outcome = service.extractUstpCorFromUri('content://cor.png').then(
    () => 'resolved',
    (error: Error) => error.message,
  );
  await jest.advanceTimersByTimeAsync(60000);
  expect(await outcome).toMatch(/took too long/);
});
