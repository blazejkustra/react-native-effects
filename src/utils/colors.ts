import { NAMED_COLORS } from '../consts';

export type ColorInput = number | string;

/**
 * RGBA color values normalized to 0-1 range
 */
export type RGBA = {
  r: number;
  g: number;
  b: number;
  a: number;
};

/**
 * Converts various color formats to RGBA object
 * @param color - Can be:
 *   - Hex number (0xff0000)
 *   - Hex string ("#ff0000" or "ff0000")
 *   - RGB string ("rgb(255, 0, 0)")
 *   - RGBA string ("rgba(255, 0, 0, 0.5)")
 *   - Named color ("red", "blue", "purple", etc.)
 * @returns RGBA object with normalized values (0-1), alpha defaults to 1.0 for non-rgba formats
 */
export function colorToVec4(color: ColorInput): RGBA {
  'worklet';
  // Handle hex number
  if (typeof color === 'number') {
    return {
      r: ((color >> 16) & 0xff) / 255,
      g: ((color >> 8) & 0xff) / 255,
      b: (color & 0xff) / 255,
      a: 1.0,
    };
  }

  if (typeof color === 'string') {
    const trimmed = color.trim();

    // Handle rgba() format
    if (trimmed.startsWith('rgba(') && trimmed.endsWith(')')) {
      const rgbaMatch = trimmed.match(
        /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/
      );
      if (!rgbaMatch) {
        throw new Error(
          `[react-native-effects] Invalid RGBA format: ${color}. Expected rgba(r, g, b, a).`
        );
      }
      return {
        r: Math.max(0, Math.min(255, parseInt(rgbaMatch[1]!, 10))) / 255,
        g: Math.max(0, Math.min(255, parseInt(rgbaMatch[2]!, 10))) / 255,
        b: Math.max(0, Math.min(255, parseInt(rgbaMatch[3]!, 10))) / 255,
        a: Math.max(0, Math.min(1, parseFloat(rgbaMatch[4]!))),
      };
    }

    // Handle rgb() format
    if (trimmed.startsWith('rgb(') && trimmed.endsWith(')')) {
      const rgbMatch = trimmed.match(
        /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
      );
      if (!rgbMatch) {
        throw new Error(
          `[react-native-effects] Invalid RGB format: ${color}. Expected rgb(r, g, b).`
        );
      }
      return {
        r: Math.max(0, Math.min(255, parseInt(rgbMatch[1]!, 10))) / 255,
        g: Math.max(0, Math.min(255, parseInt(rgbMatch[2]!, 10))) / 255,
        b: Math.max(0, Math.min(255, parseInt(rgbMatch[3]!, 10))) / 255,
        a: 1.0,
      };
    }

    const lowerColor = trimmed.toLowerCase();

    // Handle named colors
    if (lowerColor in NAMED_COLORS) {
      const hexValue = NAMED_COLORS[lowerColor];
      if (hexValue !== undefined) {
        return {
          r: ((hexValue >> 16) & 0xff) / 255,
          g: ((hexValue >> 8) & 0xff) / 255,
          b: (hexValue & 0xff) / 255,
          a: 1.0,
        };
      }
    }

    // Handle hex string
    const hex = trimmed.replace('#', '');
    if (hex.length !== 6) {
      throw new Error(
        `[react-native-effects] Invalid hex color: ${color}. Must be 6 characters.`
      );
    }

    const num = parseInt(hex, 16);
    if (isNaN(num)) {
      throw new Error(
        `[react-native-effects] Invalid hex color: ${color}. Must be valid hexadecimal.`
      );
    }

    return {
      r: ((num >> 16) & 0xff) / 255,
      g: ((num >> 8) & 0xff) / 255,
      b: (num & 0xff) / 255,
      a: 1.0,
    };
  }

  throw new Error(
    `[react-native-effects] Invalid color format: ${color}. Expected hex number, hex string, rgb() string, or named color.`
  );
}
