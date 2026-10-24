export const UPDATE_MANIFEST_SCHEMA = 1;
export const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;
export const MAX_APK_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_NOTES_CHARS = 4_000;
const MAX_MANIFEST_CHARS = 16 * 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.zip$/;
const SAFE_APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.apk$/;

export type UpdateErrorCode =
  | 'not_configured'
  | 'network_unavailable'
  | 'server_error'
  | 'verification_failed'
  | 'insufficient_storage'
  | 'download_failed'
  | 'cancelled'
  | 'restart_failed';

export class UpdateError extends Error {
  constructor(
    readonly code: UpdateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UpdateError';
  }
}

export interface ApkAsset {
  file: string;
  size: number;
  sha256: string;
  versionCode: number;
}

export interface UpdateManifest {
  schema: typeof UPDATE_MANIFEST_SCHEMA;
  product: string;
  version: string;
  platform: 'android';
  nativeVersionCode: number;
  file: string;
  size: number;
  sha256: string;
  signedAt: string;
  apk?: ApkAsset;
}

export interface SignedManifest {
  payload: string;
  signature: string;
}

interface ParsedVersion {
  core: [number, number, number];
  pre: string[];
}

export const parseVersion = (value: string): ParsedVersion | null => {
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      value.trim(),
    );
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split('.') : [],
  };
};

export const compareVersions = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return left ? 1 : right ? -1 : 0;
  for (let i = 0; i < 3; i += 1) {
    if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i];
  }
  if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y);
    } else if (xNumeric !== yNumeric) {
      return xNumeric ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};

export const isReleaseKey = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.length > 0 && BASE64.test(trimmed);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unreadable = (): never => {
  throw new UpdateError('server_error', 'The update on GitHub could not be read. Try again later.');
};

export const parseSignedManifest = (body: string): SignedManifest => {
  if (body.length > MAX_MANIFEST_CHARS) return unreadable();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return unreadable();
  }
  if (!isRecord(data)) return unreadable();
  const { payload, signature } = data as Record<string, unknown>;
  if (typeof payload !== 'string' || typeof signature !== 'string') return unreadable();
  if (!BASE64.test(payload) || !BASE64.test(signature)) return unreadable();
  return { payload, signature };
};

const refuse = (detail: string): never => {
  throw new UpdateError(
    'verification_failed',
    `The update could not be verified (${detail}), so it was not downloaded.`,
  );
};

export const readVerifiedManifest = (
  json: string,
  expected: { product: string },
): UpdateManifest => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return refuse('unreadable manifest');
  }
  if (!isRecord(data)) return refuse('unreadable manifest');

  if (data.schema !== UPDATE_MANIFEST_SCHEMA) refuse('unknown manifest version');
  if (data.product !== expected.product) refuse('signed for another app');
  if (data.platform !== 'android') refuse('built for another system');
  if (typeof data.version !== 'string' || !parseVersion(data.version)) refuse('invalid version');
  if (
    typeof data.nativeVersionCode !== 'number' ||
    !Number.isSafeInteger(data.nativeVersionCode) ||
    data.nativeVersionCode <= 0
  ) {
    refuse('invalid app build');
  }
  if (typeof data.file !== 'string' || !SAFE_FILE_NAME.test(data.file)) refuse('invalid file name');
  if (
    typeof data.size !== 'number' ||
    !Number.isSafeInteger(data.size) ||
    data.size <= 0 ||
    data.size > MAX_BUNDLE_BYTES
  ) {
    refuse('invalid size');
  }
  if (typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) {
    refuse('invalid checksum');
  }

  let apk: ApkAsset | undefined;
  if (data.apk !== undefined) {
    const entry = data.apk;
    if (
      !isRecord(entry) ||
      typeof entry.file !== 'string' ||
      !SAFE_APK_NAME.test(entry.file) ||
      typeof entry.size !== 'number' ||
      !Number.isSafeInteger(entry.size) ||
      entry.size <= 0 ||
      entry.size > MAX_APK_BYTES ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      entry.versionCode !== data.nativeVersionCode
    ) {
      return refuse('invalid app package');
    }
    apk = {
      file: entry.file,
      size: entry.size,
      sha256: entry.sha256,
      versionCode: entry.versionCode as number,
    };
  }

  return {
    schema: UPDATE_MANIFEST_SCHEMA,
    product: data.product as string,
    version: data.version as string,
    platform: 'android',
    nativeVersionCode: data.nativeVersionCode as number,
    file: data.file as string,
    size: data.size as number,
    sha256: data.sha256 as string,
    signedAt: typeof data.signedAt === 'string' ? data.signedAt : '',
    ...(apk ? { apk } : {}),
  };
};
