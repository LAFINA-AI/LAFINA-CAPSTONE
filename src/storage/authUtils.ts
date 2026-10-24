const SALT_PREFIX = 'lafina_salt_key_';
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordValidationResult {
  isValid: boolean;
  error: string | null;
}

let hCache: number[] | undefined;
let kCache: number[] | undefined;

/**
 * A self-contained, pure JS implementation of SHA-256.
 */
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';

  const words: number[] = [];
  const asciiLength = ascii.length * 8;

  if (!hCache || !kCache) {
    hCache = [];
    kCache = [];

    const isPrime = (n: number) => {
      for (let factor = 2; factor * factor <= n; factor++) {
        if (n % factor === 0) return false;
      }
      return true;
    };

    let primeCounter = 0;
    let candidate = 2;
    while (primeCounter < 64) {
      if (isPrime(candidate)) {
        if (primeCounter < 8) {
          hCache[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        }
        kCache[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        primeCounter++;
      }
      candidate++;
    }
  }

  const h = hCache;
  const k = kCache;

  const asciiBytes: number[] = [];
  for (let c = 0; c < ascii.length; c++) {
    asciiBytes.push(ascii.charCodeAt(c));
  }
  asciiBytes.push(0x80);

  while (asciiBytes.length % 64 !== 56) {
    asciiBytes.push(0);
  }

  for (i = 0; i < asciiBytes.length; i += 4) {
    words.push(
      (asciiBytes[i] << 24) |
        (asciiBytes[i + 1] << 16) |
        (asciiBytes[i + 2] << 8) |
        asciiBytes[i + 3],
    );
  }

  words.push((asciiLength / maxWord) | 0);
  words.push(asciiLength | 0);

  const hCopy = [...h];

  for (j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldH = [...hCopy];

    for (i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const s1 =
        rightRotate(hCopy[4], 6) ^
        rightRotate(hCopy[4], 11) ^
        rightRotate(hCopy[4], 25);
      const ch = (hCopy[4] & hCopy[5]) ^ (~hCopy[4] & hCopy[6]);
      const temp1 = (hCopy[7] + s1 + ch + k[i] + w[i]) | 0;
      const s0 =
        rightRotate(hCopy[0], 2) ^
        rightRotate(hCopy[0], 13) ^
        rightRotate(hCopy[0], 22);
      const maj =
        (hCopy[0] & hCopy[1]) ^
        (hCopy[0] & hCopy[2]) ^
        (hCopy[1] & hCopy[2]);
      const temp2 = (s0 + maj) | 0;

      hCopy[7] = hCopy[6];
      hCopy[6] = hCopy[5];
      hCopy[5] = hCopy[4];
      hCopy[4] = (hCopy[3] + temp1) | 0;
      hCopy[3] = hCopy[2];
      hCopy[2] = hCopy[1];
      hCopy[1] = hCopy[0];
      hCopy[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hCopy[i] = (hCopy[i] + oldH[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    let hex = (hCopy[i] >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    result += hex;
  }

  return result;
}

export const hashPassword = async (password: string): Promise<string> => {
  return sha256(SALT_PREFIX + password);
};

export const verifyPassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
};

export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

export const validatePassword = (
  password: string,
): PasswordValidationResult => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: 'Passwords must contain at least 6 characters.',
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      isValid: false,
      error: 'Passwords must contain no more than 128 characters.',
    };
  }
  return { isValid: true, error: null };
};
