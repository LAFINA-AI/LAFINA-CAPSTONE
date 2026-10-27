import {resolveTheme} from '../src/core/theme/theme';

/** WCAG sRGB relative luminance, independently calculated from actual token values. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => {
    const encoded = parseInt(hex.slice(index, index + 2), 16) / 255;
    return encoded <= 0.04045
      ? encoded / 12.92
      : Math.pow((encoded + 0.055) / 1.055, 2.4);
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe('enabled Send icon contrast', () => {
  it('matches reference ratios for black, white, equal colors and mid-gray', () => {
    expect(contrast('#000000', '#FFFFFF')).toBe(21);
    expect(contrast('#CC3747', '#CC3747')).toBe(1);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.478, 3);
  });

  it('reproduces the independently reported failing historical dark pair', () => {
    expect(contrast('#FFFFFF', '#FF8F96')).toBeCloseTo(2.1826, 4);
    expect(contrast('#FFFFFF', '#FF8F96')).toBeLessThan(3);
  });

  it.each(['light', 'dark'] as const)(
    'keeps the enabled icon at least 3:1 on its actual %s background',
    mode => {
      const {colors} = resolveTheme(mode, null);
      expect(contrast(colors.onPrimary, colors.accent)).toBeGreaterThanOrEqual(
        3,
      );
    },
  );
});
