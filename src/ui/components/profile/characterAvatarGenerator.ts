export interface AvatarBackdrop {
  id: string;
  label: string;
  topColor: string;
  bottomColor: string;
  sparkleColor: string;
  clashOutfitIds: readonly string[];
}

export interface AvatarSkinTone {
  id: string;
  base: string;
  shadow: string;
  blush: string;
}

export interface AvatarHairColor {
  id: string;
  base: string;
  shade: string;
  highlight: string;
}

export interface AvatarOutfitColor {
  id: string;
  base: string;
  shade: string;
  accent: string;
}

export type HairStyle =
  | 'bob'
  | 'longWavy'
  | 'shortCrop'
  | 'curlyCloud'
  | 'spaceBuns'
  | 'highPonytail'
  | 'sidePart'
  | 'wavyShag';

export type EyeStyle = 'bright' | 'happy' | 'calm' | 'wink' | 'starry';
export type BrowStyle = 'soft' | 'cheerful' | 'focused';
export type MouthStyle =
  | 'warmSmile'
  | 'openGrin'
  | 'catSmile'
  | 'smirk'
  | 'gentle';
export type CheekStyle = 'blush' | 'freckles' | 'both' | 'none';
export type OutfitStyle = 'hoodie' | 'sweater' | 'collared' | 'overalls';
export type AvatarAccessory =
  | 'none'
  | 'roundGlasses'
  | 'squareGlasses'
  | 'headphones'
  | 'beanie'
  | 'hairpin';

export interface CharacterTraits {
  seed: string;
  background: AvatarBackdrop;
  skin: AvatarSkinTone;
  hairStyle: HairStyle;
  hairColor: AvatarHairColor;
  eyeStyle: EyeStyle;
  browStyle: BrowStyle;
  mouthStyle: MouthStyle;
  cheekStyle: CheekStyle;
  outfitStyle: OutfitStyle;
  outfitColor: AvatarOutfitColor;
  accessory: AvatarAccessory;
  sparkleOffset: number;
}

export const AVATAR_BACKDROPS: readonly AvatarBackdrop[] = [
  {
    id: 'sunset',
    label: 'Sunset Coral',
    topColor: '#FF8A65',
    bottomColor: '#FF4F7B',
    sparkleColor: '#FFF3E0',
    clashOutfitIds: ['coral'],
  },
  {
    id: 'ocean',
    label: 'Indigo Sky',
    topColor: '#56CCF2',
    bottomColor: '#3F51B5',
    sparkleColor: '#E1F5FE',
    clashOutfitIds: ['cobalt', 'denim'],
  },
  {
    id: 'mint',
    label: 'Mint Breeze',
    topColor: '#5BE0C4',
    bottomColor: '#00897B',
    sparkleColor: '#E0F2F1',
    clashOutfitIds: ['teal'],
  },
  {
    id: 'lavender',
    label: 'Lavender Glow',
    topColor: '#C59BFF',
    bottomColor: '#6C3CE9',
    sparkleColor: '#F3E8FF',
    clashOutfitIds: ['plum'],
  },
  {
    id: 'amber',
    label: 'Warm Amber',
    topColor: '#FFD54F',
    bottomColor: '#F57C00',
    sparkleColor: '#FFF8E1',
    clashOutfitIds: ['mustard'],
  },
  {
    id: 'berry',
    label: 'Berry Rose',
    topColor: '#F48FB1',
    bottomColor: '#C2185B',
    sparkleColor: '#FCE4EC',
    clashOutfitIds: ['coral', 'plum'],
  },
  {
    id: 'cobalt',
    label: 'Azure Wave',
    topColor: '#64B5F6',
    bottomColor: '#1565C0',
    sparkleColor: '#E3F2FD',
    clashOutfitIds: ['cobalt', 'denim'],
  },
  {
    id: 'sage',
    label: 'Sage Meadow',
    topColor: '#9CCC65',
    bottomColor: '#2E7D32',
    sparkleColor: '#F1F8E9',
    clashOutfitIds: ['forest', 'teal'],
  },
];

export const AVATAR_SKIN_TONES: readonly AvatarSkinTone[] = [
  {id: 'porcelain', base: '#FFE0CC', shadow: '#F2BFA2', blush: '#FF8C94'},
  {id: 'ivory', base: '#FCD5B5', shadow: '#E5B28C', blush: '#F47C7C'},
  {id: 'honey', base: '#E8B88A', shadow: '#CE9461', blush: '#E57373'},
  {id: 'caramel', base: '#C88D5E', shadow: '#A86E42', blush: '#D96B6B'},
  {id: 'chestnut', base: '#9D6540', shadow: '#7D4B2B', blush: '#C96565'},
  {id: 'espresso', base: '#734429', shadow: '#57311B', blush: '#B85A5A'},
];

export const AVATAR_HAIR_COLORS: readonly AvatarHairColor[] = [
  {id: 'ink', base: '#202433', shade: '#131622', highlight: '#3E4663'},
  {id: 'espresso', base: '#3E2723', shade: '#281815', highlight: '#5D4037'},
  {id: 'chestnut', base: '#6D4230', shade: '#4E2C1E', highlight: '#8D5B45'},
  {id: 'auburn', base: '#A6462B', shade: '#7B2F1A', highlight: '#C96649'},
  {id: 'honey', base: '#D4A149', shade: '#AD7D2B', highlight: '#EBC273'},
  {id: 'indigo', base: '#343D6E', shade: '#22284D', highlight: '#5562A3'},
  {id: 'rosePlum', base: '#7A355C', shade: '#572240', highlight: '#A1527E'},
];

export const AVATAR_OUTFIT_COLORS: readonly AvatarOutfitColor[] = [
  {id: 'charcoal', base: '#2F3545', shade: '#1E222E', accent: '#6B748F'},
  {id: 'coral', base: '#E85D75', shade: '#C43E57', accent: '#FF9EAA'},
  {id: 'cobalt', base: '#3B6FD8', shade: '#2851A8', accent: '#8AB4FF'},
  {id: 'teal', base: '#1E9E89', shade: '#137766', accent: '#7AE5D2'},
  {id: 'mustard', base: '#D99B26', shade: '#B07914', accent: '#FFE082'},
  {id: 'plum', base: '#7B4BC2', shade: '#5A3199', accent: '#C6A8FF'},
  {id: 'forest', base: '#3A7D56', shade: '#27593C', accent: '#8CD4AA'},
  {id: 'denim', base: '#456990', shade: '#2E4968', accent: '#90B8E0'},
];

const HAIR_STYLES: readonly HairStyle[] = [
  'bob',
  'longWavy',
  'shortCrop',
  'curlyCloud',
  'spaceBuns',
  'highPonytail',
  'sidePart',
  'wavyShag',
];

const BEANIE_SAFE_HAIR_STYLES: readonly HairStyle[] = [
  'bob',
  'longWavy',
  'shortCrop',
  'curlyCloud',
  'sidePart',
  'wavyShag',
];

const EYE_STYLES: readonly EyeStyle[] = [
  'bright',
  'happy',
  'calm',
  'wink',
  'starry',
];

const BROW_STYLES: readonly BrowStyle[] = ['soft', 'cheerful', 'focused'];

const MOUTH_STYLES: readonly MouthStyle[] = [
  'warmSmile',
  'openGrin',
  'catSmile',
  'smirk',
  'gentle',
];

const CHEEK_STYLES: readonly CheekStyle[] = [
  'blush',
  'freckles',
  'both',
  'none',
];

const OUTFIT_STYLES: readonly OutfitStyle[] = [
  'hoodie',
  'sweater',
  'collared',
  'overalls',
];

const ACCESSORIES: readonly AvatarAccessory[] = [
  'none',
  'roundGlasses',
  'squareGlasses',
  'headphones',
  'beanie',
  'hairpin',
];

const HAIR_LABELS: Record<HairStyle, string> = {
  bob: 'sleek bob',
  longWavy: 'long wavy',
  shortCrop: 'tousled crop',
  curlyCloud: 'curly',
  spaceBuns: 'space buns',
  highPonytail: 'high ponytail',
  sidePart: 'side-parted',
  wavyShag: 'layered',
};

const ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  none: '',
  roundGlasses: 'round glasses',
  squareGlasses: 'square glasses',
  headphones: 'headphones',
  beanie: 'knit beanie',
  hairpin: 'star hairpin',
};

function hashWithSalt(seed: string, salt: number): number {
  let hash = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: string, salt: number): T {
  const idx = hashWithSalt(seed, salt) % items.length;
  return items[idx];
}

/** Deterministically maps a seed string to a harmonious set of character traits. */
export function resolveCharacterTraits(seed: string): CharacterTraits {
  const normalized = seed.trim() || 'lafina-default-character';
  const background = pick(AVATAR_BACKDROPS, normalized, 11);
  const skin = pick(AVATAR_SKIN_TONES, normalized, 23);
  const rawHairStyle = pick(HAIR_STYLES, normalized, 37);
  const hairColor = pick(AVATAR_HAIR_COLORS, normalized, 53);
  const eyeStyle = pick(EYE_STYLES, normalized, 71);
  const browStyle = pick(BROW_STYLES, normalized, 89);
  const mouthStyle = pick(MOUTH_STYLES, normalized, 107);
  const cheekStyle = pick(CHEEK_STYLES, normalized, 127);
  const outfitStyle = pick(OUTFIT_STYLES, normalized, 149);
  const accessory = pick(ACCESSORIES, normalized, 173);

  const safeOutfits = AVATAR_OUTFIT_COLORS.filter(
    candidate => !background.clashOutfitIds.includes(candidate.id),
  );
  const outfitColor = pick(
    safeOutfits.length > 0 ? safeOutfits : AVATAR_OUTFIT_COLORS,
    normalized,
    197,
  );

  const hairStyle =
    accessory === 'beanie' &&
    (rawHairStyle === 'spaceBuns' || rawHairStyle === 'highPonytail')
      ? pick(BEANIE_SAFE_HAIR_STYLES, normalized, 211)
      : rawHairStyle;

  const sparkleOffset = hashWithSalt(normalized, 233) % 4;

  return {
    seed: normalized,
    background,
    skin,
    hairStyle,
    hairColor,
    eyeStyle,
    browStyle,
    mouthStyle,
    cheekStyle,
    outfitStyle,
    outfitColor,
    accessory,
    sparkleOffset,
  };
}

/** Checks whether two character trait sets look noticeably different from one another. */
export function areTraitsVisuallyDistinct(
  a: CharacterTraits,
  b: CharacterTraits,
): boolean {
  return (
    a.hairStyle !== b.hairStyle ||
    a.background.id !== b.background.id ||
    a.accessory !== b.accessory
  );
}

/** Builds a descriptive accessibility label for the rendered character avatar. */
export function describeCharacterTraits(traits: CharacterTraits): string {
  const parts = [
    `${traits.background.label} backdrop`,
    `${HAIR_LABELS[traits.hairStyle]} hair`,
  ];
  const acc = ACCESSORY_LABELS[traits.accessory];
  if (acc) {
    parts.push(acc);
  }
  return `Character avatar with ${parts.join(', ')}`;
}
