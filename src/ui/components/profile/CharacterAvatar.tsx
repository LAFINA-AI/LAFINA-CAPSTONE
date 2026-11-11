import React, {useId, useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  describeCharacterTraits,
  resolveCharacterTraits,
} from './characterAvatarGenerator';
import type {CharacterTraits} from './characterAvatarGenerator';

export interface CharacterAvatarProps {
  seed: string;
  size?: number;
  testID?: string;
}

const BACKDROP_ACCENTS = [
  {cx1: 24, cy1: 26, r1: 14, cx2: 96, cy2: 34, r2: 9},
  {cx1: 95, cy1: 24, r1: 13, cx2: 24, cy2: 74, r2: 8},
  {cx1: 22, cy1: 38, r1: 11, cx2: 98, cy2: 68, r2: 12},
  {cx1: 88, cy1: 22, r1: 15, cx2: 26, cy2: 28, r2: 7},
] as const;

function renderBackHair(traits: CharacterTraits): React.ReactNode {
  const {hairStyle, hairColor, outfitColor} = traits;
  const fill = hairColor.base;
  const shade = hairColor.shade;

  switch (hairStyle) {
    case 'bob':
      return (
        <Path
          d="M 25 56 C 24 25, 42 17, 60 17 C 78 17, 96 25, 95 56 C 95 77, 88 89, 80 89 L 40 89 C 32 89, 25 77, 25 56 Z"
          fill={shade}
        />
      );
    case 'longWavy':
      return (
        <Path
          d="M 23 55 C 22 24, 42 16, 60 16 C 78 16, 98 24, 97 55 C 101 76, 99 98, 92 110 C 84 114, 78 106, 75 96 L 45 96 C 42 106, 36 114, 28 110 C 21 98, 19 76, 23 55 Z"
          fill={shade}
        />
      );
    case 'curlyCloud':
      return (
        <G fill={fill}>
          <Circle cx={34} cy={36} r={14} />
          <Circle cx={47} cy={25} r={14} />
          <Circle cx={60} cy={22} r={15} />
          <Circle cx={73} cy={25} r={14} />
          <Circle cx={86} cy={36} r={14} />
          <Circle cx={29} cy={51} r={12} />
          <Circle cx={91} cy={51} r={12} />
          <Circle cx={31} cy={66} r={10.5} fill={shade} />
          <Circle cx={89} cy={66} r={10.5} fill={shade} />
        </G>
      );
    case 'spaceBuns':
      return (
        <G>
          <Circle cx={32} cy={28} r={12.5} fill={shade} />
          <Circle cx={88} cy={28} r={12.5} fill={shade} />
          <Circle cx={32} cy={28} r={9.5} fill={fill} />
          <Circle cx={88} cy={28} r={9.5} fill={fill} />
          <Path
            d="M 30 52 C 30 26, 44 19, 60 19 C 76 19, 90 26, 90 52 Z"
            fill={shade}
          />
        </G>
      );
    case 'highPonytail':
      return (
        <G>
          <Path
            d="M 64 20 C 84 14, 102 28, 98 54 C 95 66, 90 74, 84 76 C 85 62, 84 48, 76 34 Z"
            fill={shade}
          />
          <Circle cx={74} cy={24} r={4.5} fill={outfitColor.accent} />
          <Path
            d="M 29 52 C 29 25, 44 18, 60 18 C 76 18, 91 25, 91 52 Z"
            fill={shade}
          />
        </G>
      );
    case 'wavyShag':
      return (
        <Path
          d="M 24 55 C 24 25, 42 18, 60 18 C 78 18, 96 25, 96 55 C 97 74, 92 90, 84 95 L 78 86 L 42 86 L 36 95 C 28 90, 23 74, 24 55 Z"
          fill={shade}
        />
      );
    case 'shortCrop':
    case 'sidePart':
    default:
      return (
        <Path
          d="M 29 52 C 28 24, 44 17, 60 17 C 76 17, 92 24, 91 52 L 86 52 L 86 42 L 34 42 L 34 52 Z"
          fill={shade}
        />
      );
  }
}

function renderOutfit(traits: CharacterTraits): React.ReactNode {
  const {outfitStyle, outfitColor} = traits;
  const torsoPath = 'M 16 124 C 18 98, 36 90, 60 90 C 84 90, 102 98, 104 124 Z';

  if (outfitStyle === 'overalls') {
    return (
      <G>
        <Path d={torsoPath} fill="#F7F7FA" />
        <Path
          d="M 46 90 Q 60 98 74 90"
          stroke="#DCE0EB"
          strokeWidth={2}
          fill="none"
        />
        <Path d="M 38 92 L 46 91 L 47 124 L 36 124 Z" fill={outfitColor.base} />
        <Path d="M 74 91 L 82 92 L 84 124 L 73 124 Z" fill={outfitColor.base} />
        <Path
          d="M 38 103 L 82 103 L 85 124 L 35 124 Z"
          fill={outfitColor.base}
        />
        <Path
          d="M 46 112 L 74 112 L 75 124 L 45 124 Z"
          fill={outfitColor.shade}
        />
        <Circle cx={42} cy={106} r={2} fill="#F4C542" />
        <Circle cx={78} cy={106} r={2} fill="#F4C542" />
      </G>
    );
  }

  return (
    <G>
      <Path d={torsoPath} fill={outfitColor.base} />
      {outfitStyle === 'hoodie' && (
        <G>
          <Path
            d="M 38 92 Q 60 105 82 92 Q 74 87 60 88 Q 46 87 38 92 Z"
            fill={outfitColor.shade}
          />
          <Path
            d="M 46 92 Q 60 102 74 92"
            stroke={outfitColor.accent}
            strokeWidth={2}
            fill="none"
          />
          <Path
            d="M 51 98 L 51 114"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Path
            d="M 69 98 L 69 114"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Circle cx={51} cy={114.5} r={1.8} fill="#FFFFFF" />
          <Circle cx={69} cy={114.5} r={1.8} fill="#FFFFFF" />
        </G>
      )}
      {outfitStyle === 'sweater' && (
        <G>
          <Path
            d="M 43 91 Q 60 103 77 91"
            stroke={outfitColor.accent}
            strokeWidth={3.5}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={74} cy={106} r={4} fill={outfitColor.accent} />
          <Circle cx={74} cy={106} r={2} fill={outfitColor.shade} />
        </G>
      )}
      {outfitStyle === 'collared' && (
        <G>
          <Path d="M 47 90 L 60 104 L 73 90 Z" fill="#FFFFFF" />
          <Path
            d="M 45 90 L 56 99 L 60 93 L 49 88 Z"
            fill="#FFFFFF"
            stroke={outfitColor.shade}
            strokeWidth={1}
          />
          <Path
            d="M 75 90 L 64 99 L 60 93 L 71 88 Z"
            fill="#FFFFFF"
            stroke={outfitColor.shade}
            strokeWidth={1}
          />
        </G>
      )}
    </G>
  );
}

function renderEyes(traits: CharacterTraits): React.ReactNode {
  const {eyeStyle} = traits;
  const ink = '#1E1E2C';

  switch (eyeStyle) {
    case 'happy':
      return (
        <G stroke={ink} strokeWidth={2.6} strokeLinecap="round" fill="none">
          <Path d="M 41 57 Q 46 50.5 51 57" />
          <Path d="M 69 57 Q 74 50.5 79 57" />
        </G>
      );
    case 'calm':
      return (
        <G>
          <Circle cx={46} cy={56.5} r={4.2} fill={ink} />
          <Circle cx={74} cy={56.5} r={4.2} fill={ink} />
          <Circle cx={44.6} cy={55} r={1.4} fill="#FFFFFF" />
          <Circle cx={72.6} cy={55} r={1.4} fill="#FFFFFF" />
          <Path
            d="M 40.5 53.8 Q 46 52.5 51.5 53.8"
            stroke={ink}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 68.5 53.8 Q 74 52.5 79.5 53.8"
            stroke={ink}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      );
    case 'wink':
      return (
        <G>
          <Circle cx={46} cy={56} r={4.6} fill={ink} />
          <Circle cx={44.5} cy={54.3} r={1.7} fill="#FFFFFF" />
          <Circle cx={47.3} cy={57.4} r={0.85} fill="#FFFFFF" />
          <Path
            d="M 40.5 53.3 Q 46 49.8 51.5 53.3"
            stroke={ink}
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 69 56.5 Q 74 51.5 79 56.5"
            stroke={ink}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      );
    case 'starry':
      return (
        <G>
          <Circle cx={46} cy={56} r={4.8} fill={ink} />
          <Circle cx={74} cy={56} r={4.8} fill={ink} />
          <Path
            d="M 45 52.2 L 45.8 54.2 L 47.8 55 L 45.8 55.8 L 45 57.8 L 44.2 55.8 L 42.2 55 L 44.2 54.2 Z"
            fill="#FFFFFF"
          />
          <Path
            d="M 73 52.2 L 73.8 54.2 L 75.8 55 L 73.8 55.8 L 73 57.8 L 72.2 55.8 L 70.2 55 L 72.2 54.2 Z"
            fill="#FFFFFF"
          />
          <Circle cx={47.8} cy={58} r={0.85} fill="#FFFFFF" />
          <Circle cx={75.8} cy={58} r={0.85} fill="#FFFFFF" />
        </G>
      );
    case 'bright':
    default:
      return (
        <G>
          <Circle cx={46} cy={56} r={4.6} fill={ink} />
          <Circle cx={74} cy={56} r={4.6} fill={ink} />
          <Circle cx={44.5} cy={54.3} r={1.7} fill="#FFFFFF" />
          <Circle cx={72.5} cy={54.3} r={1.7} fill="#FFFFFF" />
          <Circle cx={47.3} cy={57.4} r={0.85} fill="#FFFFFF" />
          <Circle cx={75.3} cy={57.4} r={0.85} fill="#FFFFFF" />
          <Path
            d="M 40.5 53.3 Q 46 49.8 51.5 53.3"
            stroke={ink}
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 68.5 53.3 Q 74 49.8 79.5 53.3"
            stroke={ink}
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      );
  }
}

function renderBrows(traits: CharacterTraits): React.ReactNode {
  const stroke = traits.hairColor.shade;
  switch (traits.browStyle) {
    case 'cheerful':
      return (
        <G stroke={stroke} strokeWidth={2.2} strokeLinecap="round" fill="none">
          <Path d="M 40.5 45 Q 46 41.8 51.5 44.8" />
          <Path d="M 68.5 44.8 Q 74 41.8 79.5 45" />
        </G>
      );
    case 'focused':
      return (
        <G stroke={stroke} strokeWidth={2.2} strokeLinecap="round" fill="none">
          <Path d="M 40.5 46.5 L 51.5 47.3" />
          <Path d="M 68.5 47.3 L 79.5 46.5" />
        </G>
      );
    case 'soft':
    default:
      return (
        <G stroke={stroke} strokeWidth={2.2} strokeLinecap="round" fill="none">
          <Path d="M 40.5 46 Q 46 43.5 51.5 46" />
          <Path d="M 68.5 46 Q 74 43.5 79.5 46" />
        </G>
      );
  }
}

function renderCheeks(traits: CharacterTraits): React.ReactNode {
  const {cheekStyle, skin} = traits;
  if (cheekStyle === 'none') return null;
  const showBlush = cheekStyle === 'blush' || cheekStyle === 'both';
  const showFreckles = cheekStyle === 'freckles' || cheekStyle === 'both';

  return (
    <G>
      {showBlush && (
        <G fill={skin.blush} fillOpacity={0.38}>
          <Ellipse cx={41} cy={63.5} rx={5.5} ry={3} />
          <Ellipse cx={79} cy={63.5} rx={5.5} ry={3} />
        </G>
      )}
      {showFreckles && (
        <G fill={skin.shadow} fillOpacity={0.7}>
          <Circle cx={38.5} cy={62} r={0.9} />
          <Circle cx={41.5} cy={63.5} r={0.9} />
          <Circle cx={44.5} cy={61.8} r={0.9} />
          <Circle cx={75.5} cy={61.8} r={0.9} />
          <Circle cx={78.5} cy={63.5} r={0.9} />
          <Circle cx={81.5} cy={62} r={0.9} />
        </G>
      )}
    </G>
  );
}

function renderMouth(traits: CharacterTraits): React.ReactNode {
  const ink = '#1E1E2C';
  switch (traits.mouthStyle) {
    case 'openGrin':
      return (
        <G>
          <Path d="M 51 67.5 Q 60 77.5 69 67.5 Z" fill="#8C273E" />
          <Path
            d="M 55.5 72.3 Q 60 69.5 64.5 72.3 Q 60 75 55.5 72.3 Z"
            fill="#FF7B89"
          />
          <Path
            d="M 51 67.5 Q 60 77.5 69 67.5"
            stroke={ink}
            strokeWidth={1.8}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      );
    case 'catSmile':
      return (
        <Path
          d="M 52 69 Q 56 73 60 69 Q 64 73 68 69"
          stroke={ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case 'smirk':
      return (
        <Path
          d="M 53 70.5 Q 61 73 67 67.5"
          stroke={ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
      );
    case 'gentle':
      return (
        <Path
          d="M 55 69.5 Q 60 72.8 65 69.5"
          stroke={ink}
          strokeWidth={2.1}
          strokeLinecap="round"
          fill="none"
        />
      );
    case 'warmSmile':
    default:
      return (
        <Path
          d="M 52 68.2 Q 60 75 68 68.2"
          stroke={ink}
          strokeWidth={2.2}
          strokeLinecap="round"
          fill="none"
        />
      );
  }
}

function renderFrontHair(traits: CharacterTraits): React.ReactNode {
  const {hairStyle, hairColor} = traits;
  const fill = hairColor.base;
  const hi = hairColor.highlight;

  switch (hairStyle) {
    case 'bob':
      return (
        <G>
          <Path
            d="M 31 50 C 31 28, 45 20, 60 20 C 75 20, 89 28, 89 50 C 86 42, 81 38, 72 39 C 65 40, 56 41, 47 39 C 39 38, 34 42, 31 50 Z"
            fill={fill}
          />
          <Path
            d="M 42 29 Q 60 23 78 29"
            stroke={hi}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeOpacity={0.5}
            fill="none"
          />
        </G>
      );
    case 'longWavy':
      return (
        <G>
          <Path
            d="M 30 53 C 30 27, 44 18, 60 18 C 76 18, 90 27, 90 53 C 87 40, 78 32, 62 34 C 60 35, 60 35, 58 34 C 42 32, 33 40, 30 53 Z"
            fill={fill}
          />
          <Path
            d="M 40 28 Q 52 22 60 27 Q 68 22 80 28"
            stroke={hi}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeOpacity={0.45}
            fill="none"
          />
        </G>
      );
    case 'shortCrop':
      return (
        <G>
          <Path
            d="M 31 50 C 31 26, 44 18, 60 18 C 76 18, 89 26, 89 50 C 86 41, 82 37, 77 38 L 72 42 L 66 36 L 57 42 L 50 36 L 42 41 C 37 38, 33 42, 31 50 Z"
            fill={fill}
          />
          <Path
            d="M 44 26 Q 58 21 74 26"
            stroke={hi}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeOpacity={0.45}
            fill="none"
          />
        </G>
      );
    case 'curlyCloud':
      return (
        <G fill={fill}>
          <Circle cx={38} cy={37} r={7.8} />
          <Circle cx={49} cy={33} r={8.2} />
          <Circle cx={61} cy={32} r={8.4} />
          <Circle cx={73} cy={33.5} r={8} />
          <Circle cx={83} cy={38} r={7.5} />
        </G>
      );
    case 'spaceBuns':
      return (
        <G>
          <Path
            d="M 32 54 C 31 27, 45 20, 60 20 C 75 20, 89 27, 88 54 C 86 43, 81 38, 74 39 L 70 43 L 64 38 L 56 38 L 50 43 L 46 39 C 39 38, 34 43, 32 54 Z"
            fill={fill}
          />
          <Path
            d="M 44 27 Q 60 23 76 27"
            stroke={hi}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeOpacity={0.45}
            fill="none"
          />
        </G>
      );
    case 'highPonytail':
      return (
        <G>
          <Path
            d="M 32 51 C 32 26, 45 19, 60 19 C 76 19, 88 27, 88 51 C 83 41, 74 37, 62 35 C 50 38, 39 42, 32 51 Z"
            fill={fill}
          />
          <Path
            d="M 42 29 Q 60 22 76 28"
            stroke={hi}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeOpacity={0.45}
            fill="none"
          />
        </G>
      );
    case 'sidePart':
      return (
        <G>
          <Path
            d="M 32 50 C 32 25, 46 18, 62 18 C 77 18, 88 27, 88 49 C 83 38, 73 33, 66 32 C 56 38, 43 40, 32 50 Z"
            fill={fill}
          />
          <Path
            d="M 42 29 Q 57 22 75 27"
            stroke={hi}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeOpacity={0.45}
            fill="none"
          />
        </G>
      );
    case 'wavyShag':
    default:
      return (
        <G>
          <Path
            d="M 30 56 C 30 27, 44 19, 60 19 C 76 19, 90 27, 90 56 C 87 44, 82 39, 76 41 L 68 37 L 60 42 L 52 37 L 44 41 C 38 39, 33 44, 30 56 Z"
            fill={fill}
          />
          <Path
            d="M 42 28 Q 60 22 78 28"
            stroke={hi}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeOpacity={0.45}
            fill="none"
          />
        </G>
      );
  }
}

function renderAccessory(traits: CharacterTraits): React.ReactNode {
  const {accessory, outfitColor} = traits;
  const frameColor = '#2B2D42';

  switch (accessory) {
    case 'roundGlasses':
      return (
        <G>
          <Circle
            cx={46}
            cy={56}
            r={8.5}
            fill="#FFFFFF"
            fillOpacity={0.14}
            stroke={frameColor}
            strokeWidth={2.2}
          />
          <Circle
            cx={74}
            cy={56}
            r={8.5}
            fill="#FFFFFF"
            fillOpacity={0.14}
            stroke={frameColor}
            strokeWidth={2.2}
          />
          <Path
            d="M 54.5 55.5 Q 60 53 65.5 55.5"
            stroke={frameColor}
            strokeWidth={2.2}
            fill="none"
          />
          <Path
            d="M 33 54 L 37.5 55.5 M 82.5 55.5 L 87 54"
            stroke={frameColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </G>
      );
    case 'squareGlasses':
      return (
        <G>
          <Rect
            x={37}
            y={49}
            width={18}
            height={13}
            rx={4}
            fill="#FFFFFF"
            fillOpacity={0.14}
            stroke={frameColor}
            strokeWidth={2.2}
          />
          <Rect
            x={65}
            y={49}
            width={18}
            height={13}
            rx={4}
            fill="#FFFFFF"
            fillOpacity={0.14}
            stroke={frameColor}
            strokeWidth={2.2}
          />
          <Path d="M 55 54.5 L 65 54.5" stroke={frameColor} strokeWidth={2.2} />
          <Path
            d="M 32.5 53 L 37 54 M 83 54 L 87.5 53"
            stroke={frameColor}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </G>
      );
    case 'headphones':
      return (
        <G>
          <Path
            d="M 26 56 C 24 14, 96 14, 94 56"
            stroke="#2D3142"
            strokeWidth={5.2}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M 35 25 Q 60 15.5 85 25"
            stroke="#4F5670"
            strokeWidth={2.2}
            strokeLinecap="round"
            fill="none"
          />
          <Rect
            x={20}
            y={46}
            width={10}
            height={22}
            rx={5}
            fill={outfitColor.accent}
            stroke="#2D3142"
            strokeWidth={2}
          />
          <Rect
            x={90}
            y={46}
            width={10}
            height={22}
            rx={5}
            fill={outfitColor.accent}
            stroke="#2D3142"
            strokeWidth={2}
          />
        </G>
      );
    case 'beanie':
      return (
        <G>
          <Circle cx={60} cy={11} r={5.5} fill={outfitColor.accent} />
          <Path
            d="M 29 42 C 30 16, 46 11, 60 11 C 74 11, 90 16, 91 42 Z"
            fill={outfitColor.accent}
          />
          <Rect
            x={27}
            y={34}
            width={66}
            height={11}
            rx={5.5}
            fill={outfitColor.base}
          />
          <G stroke={outfitColor.shade} strokeWidth={1.6} strokeLinecap="round">
            <Path d="M 39 35.5 L 39 43.5" />
            <Path d="M 49 35.5 L 49 43.5" />
            <Path d="M 60 35.5 L 60 43.5" />
            <Path d="M 71 35.5 L 71 43.5" />
            <Path d="M 81 35.5 L 81 43.5" />
          </G>
        </G>
      );
    case 'hairpin':
      return (
        <G>
          <Path
            d="M 77 30.5 L 78.6 34.4 L 82.5 36 L 78.6 37.6 L 77 41.5 L 75.4 37.6 L 71.5 36 L 75.4 34.4 Z"
            fill="#FFD166"
            stroke="#E09F1F"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </G>
      );
    case 'none':
    default:
      return null;
  }
}

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  seed,
  size = 112,
  testID = 'character-avatar',
}) => {
  const reactId = useId();
  const gradientId = useMemo(
    () => `charAvatarBg_${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [reactId],
  );
  const traits = useMemo(() => resolveCharacterTraits(seed), [seed]);
  const accent = BACKDROP_ACCENTS[traits.sparkleOffset];
  const label = useMemo(() => describeCharacterTraits(traits), [traits]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: traits.background.bottomColor,
        },
      ]}
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Svg width="100%" height="100%" viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={traits.background.topColor} />
            <Stop offset="1" stopColor={traits.background.bottomColor} />
          </LinearGradient>
        </Defs>

        <Rect
          x={0}
          y={0}
          width={120}
          height={120}
          fill={`url(#${gradientId})`}
        />

        <Circle
          cx={accent.cx1}
          cy={accent.cy1}
          r={accent.r1}
          fill={traits.background.sparkleColor}
          fillOpacity={0.22}
        />
        <Circle
          cx={accent.cx2}
          cy={accent.cy2}
          r={accent.r2}
          fill={traits.background.sparkleColor}
          fillOpacity={0.18}
        />

        {renderBackHair(traits)}
        {renderOutfit(traits)}

        {/* Neck & Chin Shadow */}
        <Rect
          x={50}
          y={76}
          width={20}
          height={18}
          rx={8}
          fill={traits.skin.base}
        />
        <Ellipse cx={60} cy={83} rx={10} ry={4.5} fill={traits.skin.shadow} />

        {/* Ears */}
        <Ellipse cx={32} cy={58} rx={5} ry={7} fill={traits.skin.base} />
        <Ellipse cx={88} cy={58} rx={5} ry={7} fill={traits.skin.base} />
        <Path
          d="M 31.5 55 Q 29.5 58 31.5 61 M 88.5 55 Q 90.5 58 88.5 61"
          stroke={traits.skin.shadow}
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />

        {/* Head */}
        <Path
          d="M 33 55 C 33 34, 45 26, 60 26 C 75 26, 87 34, 87 55 C 87 74, 75 84, 60 84 C 45 84, 33 74, 33 55 Z"
          fill={traits.skin.base}
        />

        {renderCheeks(traits)}
        {renderEyes(traits)}
        {renderBrows(traits)}

        {/* Minimal Nose */}
        <Path
          d="M 58.5 62 Q 60 64 61.5 62"
          stroke={traits.skin.shadow}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />

        {renderMouth(traits)}
        {renderFrontHair(traits)}
        {renderAccessory(traits)}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
