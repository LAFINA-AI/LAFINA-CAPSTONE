import {
  errorCodes,
  isErrorWithCode,
  pick,
} from '@react-native-documents/picker';
import {NativeModules} from 'react-native';
import RNFS from 'react-native-fs';
import type {MaterialFileKind} from '../storage/materialStore';
import {readTextFileSafely} from './textFileReader';

export const MIME_PDF = 'application/pdf';
export const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_PPTX =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const MIME_TEXT = 'text/plain';
export const MIME_MARKDOWN = 'text/markdown';
export const MIME_CSV = 'text/csv';

export const SUPPORTED_MATERIAL_MIME_TYPES = [
  MIME_PDF,
  MIME_DOCX,
  MIME_PPTX,
  MIME_TEXT,
  MIME_MARKDOWN,
  MIME_CSV,
  'text/comma-separated-values',
];

export const MAX_MATERIAL_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_MATERIAL_PDF_PAGES = 100;
export const PDF_BATCH_SIZE = 10;

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  usedOcr: boolean;
}

export interface ExtractedDocument {
  fileName: string;
  fileKind: MaterialFileKind;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  pagesRead: number;
  ocrPages: number;
  pages: ExtractedPage[];
  warnings: string[];
}

export interface MaterialExtractProgress {
  pagesRead: number;
  totalPages: number;
  ocrPages: number;
  stage: string;
}

export type PickExtractOutcome =
  | {status: 'extracted'; document: ExtractedDocument}
  | {status: 'cancelled'}
  | {status: 'failed'; message: string};

interface VisionMaterialExtractor {
  extractDocumentPages?: (
    uri: string,
    startPage: number,
    batchSize: number,
    maxPages: number,
  ) => Promise<{
    pageCount?: number;
    pagesRead?: number;
    nextStartPage?: number;
    hasMore?: boolean;
    ocrPages?: number;
    pages?: Array<{pageNumber?: number; text?: string; usedOcr?: boolean}>;
  } | null>;
  extractDocumentText?: (
    uri: string,
    maxPages: number,
  ) => Promise<{
    text?: string;
    pageCount?: number;
    pagesRead?: number;
    ocrPages?: number;
  } | null>;
  extractOfficeDocumentPages?: (
    uri: string,
    fileName: string,
  ) => Promise<{
    kind?: string;
    pageCount?: number;
    pagesRead?: number;
    ocrPages?: number;
    pages?: Array<{pageNumber?: number; text?: string; usedOcr?: boolean}>;
  } | null>;
  getFileSize?: (uri: string) => Promise<number>;
  releasePdfCache?: (uri?: string | null) => Promise<boolean | void>;
}

function detectFileKind(
  fileName: string,
  mimeType: string,
): MaterialFileKind | 'legacy_office' {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (mime === MIME_PDF || lower.endsWith('.pdf')) return 'pdf';
  if (mime === MIME_DOCX || lower.endsWith('.docx')) return 'docx';
  if (mime === MIME_PPTX || lower.endsWith('.pptx')) return 'pptx';
  if (
    lower.endsWith('.doc') ||
    lower.endsWith('.ppt') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-powerpoint'
  ) {
    return 'legacy_office';
  }
  if (mime === MIME_MARKDOWN || lower.endsWith('.md')) return 'md';
  if (
    mime === MIME_CSV ||
    mime === 'text/comma-separated-values' ||
    lower.endsWith('.csv')
  ) {
    return 'csv';
  }
  return 'txt';
}

function splitPlainTextIntoPages(raw: string): ExtractedPage[] {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.includes('\f')) {
    return normalized
      .split('\f')
      .map((part, idx) => ({
        pageNumber: idx + 1,
        text: part.trim(),
        usedOcr: false,
      }))
      .filter(p => p.text.length > 0);
  }
  if (normalized.length <= 3500) {
    return [{pageNumber: 1, text: normalized, usedOcr: false}];
  }
  const paragraphs = normalized.split(/\n{2,}/);
  const pages: ExtractedPage[] = [];
  let buf = '';
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if (buf.length > 0 && buf.length + trimmed.length + 2 > 3500) {
      pages.push({pageNumber: pages.length + 1, text: buf, usedOcr: false});
      buf = '';
    }
    if (trimmed.length > 3500 && buf.length === 0) {
      for (let i = 0; i < trimmed.length; i += 3500) {
        const piece = trimmed.slice(i, i + 3500).trim();
        if (piece) {
          pages.push({
            pageNumber: pages.length + 1,
            text: piece,
            usedOcr: false,
          });
        }
      }
    } else {
      buf = buf ? `${buf}\n\n${trimmed}` : trimmed;
    }
  }
  if (buf) {
    pages.push({pageNumber: pages.length + 1, text: buf, usedOcr: false});
  }
  return pages;
}

export async function pickAndExtractMaterial(
  options: {
    onProgress?: (progress: MaterialExtractProgress) => void;
    isCancelled?: () => boolean;
  } = {},
): Promise<PickExtractOutcome> {
  const isCancelled = options.isCancelled ?? (() => false);
  let pickedFile: {
    uri: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  };

  try {
    const picked = await pick({type: SUPPORTED_MATERIAL_MIME_TYPES});
    const first = picked?.[0];
    if (!first || !first.uri) {
      return {status: 'cancelled'};
    }
    pickedFile = {
      uri: first.uri,
      name: first.name || 'lesson',
      mimeType: first.type || 'application/octet-stream',
      sizeBytes: typeof first.size === 'number' ? first.size : 0,
    };
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      error.code === errorCodes.OPERATION_CANCELED
    ) {
      return {status: 'cancelled'};
    }
    return {
      status: 'failed',
      message: 'Could not open that file. Try choosing it from local storage.',
    };
  }

  if (isCancelled()) return {status: 'cancelled'};

  const vision = NativeModules.LafinaVision as
    | VisionMaterialExtractor
    | undefined;

  let knownSize = pickedFile.sizeBytes;
  if (!knownSize) {
    const stat = await RNFS.stat(pickedFile.uri).catch(() => null);
    const statBytes = Number(stat?.size ?? 0);
    if (Number.isFinite(statBytes) && statBytes > 0) {
      knownSize = statBytes;
    }
  }
  if (!knownSize && vision?.getFileSize) {
    const nativeSize = await vision.getFileSize(pickedFile.uri).catch(() => -1);
    if (typeof nativeSize === 'number' && nativeSize > 0) {
      knownSize = nativeSize;
    }
  }
  if (knownSize > MAX_MATERIAL_FILE_BYTES) {
    return {
      status: 'failed',
      message: 'Choose a file smaller than 15 MB.',
    };
  }

  const kind = detectFileKind(pickedFile.name, pickedFile.mimeType);
  if (kind === 'legacy_office') {
    return {
      status: 'failed',
      message:
        'Older .doc or .ppt files are not supported. Save the file as .docx, .pptx, or PDF and try again.',
    };
  }

  try {
    const warnings: string[] = [];

    if (kind === 'pdf') {
      const pages: ExtractedPage[] = [];
      let pageCount = 0;
      let pagesRead = 0;
      let ocrPages = 0;

      if (vision?.extractDocumentPages) {
        let nextStartPage = 1;
        let hasMore = true;
        let batchIterations = 0;
        const maxBatches = Math.ceil(MAX_MATERIAL_PDF_PAGES / PDF_BATCH_SIZE) + 2;
        try {
          while (hasMore && batchIterations < maxBatches) {
            batchIterations += 1;
            if (isCancelled()) return {status: 'cancelled'};
            const batch = await vision.extractDocumentPages(
              pickedFile.uri,
              nextStartPage,
              PDF_BATCH_SIZE,
              MAX_MATERIAL_PDF_PAGES,
            );
            if (isCancelled()) return {status: 'cancelled'};
            if (!batch) {
              throw new Error(
                'Could not read that PDF. Make sure it is a valid PDF file.',
              );
            }
            pageCount = Math.max(pageCount, batch.pageCount ?? 0);
            pagesRead = Math.max(pagesRead, batch.pagesRead ?? 0);
            ocrPages += batch.ocrPages ?? 0;
            const batchPages = Array.isArray(batch.pages) ? batch.pages : [];
            for (const entry of batchPages) {
              const text =
                typeof entry.text === 'string' ? entry.text.trim() : '';
              if (!text) continue;
              pages.push({
                pageNumber:
                  typeof entry.pageNumber === 'number' && entry.pageNumber > 0
                    ? entry.pageNumber
                    : pages.length + 1,
                text,
                usedOcr: entry.usedOcr === true,
              });
            }
            options.onProgress?.({
              pagesRead,
              totalPages: Math.min(
                pageCount || pagesRead,
                MAX_MATERIAL_PDF_PAGES,
              ),
              ocrPages,
              stage: `Reading page ${pagesRead}${
                pageCount > 0
                  ? ` of ${Math.min(pageCount, MAX_MATERIAL_PDF_PAGES)}`
                  : ''
              }…`,
            });
            hasMore =
              batch.hasMore === true &&
              typeof batch.nextStartPage === 'number' &&
              batch.nextStartPage > nextStartPage &&
              batch.nextStartPage <= MAX_MATERIAL_PDF_PAGES;
            if (hasMore && typeof batch.nextStartPage === 'number') {
              nextStartPage = batch.nextStartPage;
            } else {
              hasMore = false;
            }
          }
        } finally {
          if (vision.releasePdfCache) {
            void vision.releasePdfCache(pickedFile.uri).catch(() => undefined);
          }
        }
      } else if (vision?.extractDocumentText) {
        const legacyMax = 20;
        const result = await vision.extractDocumentText(
          pickedFile.uri,
          legacyMax,
        );
        if (!result) {
          throw new Error(
            'Could not read that PDF. Make sure it is a valid PDF file.',
          );
        }
        pageCount = result.pageCount ?? 1;
        pagesRead = result.pagesRead ?? pageCount;
        ocrPages = result.ocrPages ?? 0;
        const text = (result.text ?? '').trim();
        if (text) {
          pages.push({
            pageNumber: 1,
            text,
            usedOcr: ocrPages > 0,
          });
        }
      } else {
        throw new Error('PDF extraction is unavailable in this build.');
      }

      if (isCancelled()) return {status: 'cancelled'};
      if (pages.length === 0) {
        return {
          status: 'failed',
          message:
            'No readable text was found in that PDF. Try a clearer scan or a text-based PDF.',
        };
      }
      if (pageCount > pagesRead) {
        warnings.push(
          `Indexed the first ${pagesRead} of ${pageCount} pages (100-page cap per file).`,
        );
      }
      if (ocrPages > 0) {
        warnings.push(
          `Used on-device OCR on ${ocrPages} scanned page${
            ocrPages === 1 ? '' : 's'
          }.`,
        );
      }
      return {
        status: 'extracted',
        document: {
          fileName: pickedFile.name,
          fileKind: 'pdf',
          mimeType: pickedFile.mimeType,
          sizeBytes: knownSize,
          pageCount: Math.max(1, pageCount),
          pagesRead: Math.max(1, pagesRead),
          ocrPages,
          pages,
          warnings,
        },
      };
    }

    if (kind === 'docx' || kind === 'pptx') {
      if (!vision?.extractOfficeDocumentPages) {
        throw new Error(
          'Word and PowerPoint extraction is unavailable in this build. Export the file as PDF instead.',
        );
      }
      options.onProgress?.({
        pagesRead: 0,
        totalPages: 1,
        ocrPages: 0,
        stage: `Reading ${kind.toUpperCase()} document…`,
      });
      const result = await vision.extractOfficeDocumentPages(
        pickedFile.uri,
        pickedFile.name,
      );
      if (isCancelled()) return {status: 'cancelled'};
      if (!result || !Array.isArray(result.pages)) {
        throw new Error('Could not read that Office document.');
      }
      const pages: ExtractedPage[] = [];
      for (const entry of result.pages) {
        const text = typeof entry.text === 'string' ? entry.text.trim() : '';
        if (!text) continue;
        pages.push({
          pageNumber:
            typeof entry.pageNumber === 'number' && entry.pageNumber > 0
              ? entry.pageNumber
              : pages.length + 1,
          text,
          usedOcr: false,
        });
      }
      if (pages.length === 0) {
        return {
          status: 'failed',
          message: 'No readable text was found in that document.',
        };
      }
      const actualKind: MaterialFileKind =
        result.kind === 'pptx' || result.kind === 'docx' ? result.kind : kind;
      return {
        status: 'extracted',
        document: {
          fileName: pickedFile.name,
          fileKind: actualKind,
          mimeType: pickedFile.mimeType,
          sizeBytes: knownSize,
          pageCount: Math.max(pages.length, result.pageCount ?? pages.length),
          pagesRead: Math.max(pages.length, result.pagesRead ?? pages.length),
          ocrPages: 0,
          pages,
          warnings,
        },
      };
    }

    // Plain text / Markdown / CSV
    options.onProgress?.({
      pagesRead: 0,
      totalPages: 1,
      ocrPages: 0,
      stage: 'Reading text file…',
    });
    const text = await readTextFileSafely(
      pickedFile.uri,
      MAX_MATERIAL_FILE_BYTES,
    );
    if (isCancelled()) return {status: 'cancelled'};
    const pages = splitPlainTextIntoPages(text);
    if (pages.length === 0) {
      return {status: 'failed', message: 'This file is empty.'};
    }
    return {
      status: 'extracted',
      document: {
        fileName: pickedFile.name,
        fileKind: kind,
        mimeType: pickedFile.mimeType,
        sizeBytes: knownSize,
        pageCount: pages.length,
        pagesRead: pages.length,
        ocrPages: 0,
        pages,
        warnings,
      },
    };
  } catch (error) {
    return {
      status: 'failed',
      message:
        (error instanceof Error && error.message) ||
        'Could not read the selected file.',
    };
  }
}
