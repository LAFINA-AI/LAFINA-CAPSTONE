import RNFS from 'react-native-fs';

const DEFAULT_MAX_TEXT_BYTES = 15 * 1024 * 1024;

function stripLeadingBom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

function sizeError(maxBytes: number): Error {
  const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
  return new Error(`Choose a file smaller than ${mb} MB.`);
}

/**
 * Reads a text/markdown/CSV file safely from a file:// or content:// URI,
 * falling back to UTF-16 BOM or single-byte decoding and rejecting binary files.
 */
export async function readTextFileSafely(
  uri: string,
  maxBytes = DEFAULT_MAX_TEXT_BYTES,
): Promise<string> {
  const stat = await RNFS.stat(uri).catch(() => null);
  if (stat && typeof stat.size === 'number' && stat.size > maxBytes) {
    throw sizeError(maxBytes);
  }
  try {
    const text = stripLeadingBom(await RNFS.readFile(uri, 'utf8'));
    if (text.length > maxBytes) {
      throw sizeError(maxBytes);
    }
    return text;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Choose a file smaller')) {
      throw err;
    }
    const b64 = await RNFS.readFile(uri, 'base64');
    if (typeof b64 !== 'string' || !b64) return '';
    if (b64.length > Math.ceil((maxBytes * 4) / 3) + 4) {
      throw sizeError(maxBytes);
    }
    const binary = globalThis.atob ? globalThis.atob(b64) : '';
    if (!binary) {
      throw new Error(
        'Could not decode this text file. Save it as UTF-8 or paste its text.',
      );
    }
    if (binary.length > maxBytes) {
      throw sizeError(maxBytes);
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      let out = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      }
      return stripLeadingBom(out);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      let out = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return stripLeadingBom(out);
    }
    let startOffset = 0;
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      startOffset = 3;
    }
    let suspicious = 0;
    let out = '';
    for (let i = startOffset; i < bytes.length; i += 1) {
      const code = bytes[i];
      if (
        code === 0 ||
        (code < 32 && code !== 9 && code !== 10 && code !== 13)
      ) {
        suspicious += 1;
      }
      out += String.fromCharCode(code);
    }
    if (bytes.length > 0 && suspicious / bytes.length > 0.05) {
      throw new Error(
        'This file appears to be binary or unsupported. Choose a text, PDF, Word, or PowerPoint file.',
      );
    }
    return stripLeadingBom(out);
  }
}
