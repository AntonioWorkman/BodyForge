import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { colors } from '@/design';
import type { ColorToken } from '@/design';

/**
 * The icon set.
 *
 * Original geometry rather than a stock icon pack: a small vocabulary of
 * straight lines, one arc and one diamond, so the icons read as part of the
 * System's own language. Everything is stroked at a single weight on a 24-unit
 * grid, and icons appear only where they are functional — tabs, controls, and
 * status — never as decoration next to headings.
 */
export type GlyphName =
  | 'system'
  | 'status'
  | 'skills'
  | 'history'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'close'
  | 'plus'
  | 'minus'
  | 'check'
  | 'pause'
  | 'play'
  | 'list'
  | 'locked'
  | 'timer'
  | 'trend'
  | 'info';

interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: ColorToken;
  /** Stroke weight. Larger glyphs carry a slightly heavier line. */
  strokeWidth?: number;
}

export function Glyph({ name, size = 22, color = 'textSecondary', strokeWidth = 1.6 }: GlyphProps) {
  const stroke = colors[color];
  const common: StrokeProps = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderGlyph(name, common, stroke)}
    </Svg>
  );
}

/** The stroke attributes every glyph shape shares. */
interface StrokeProps {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
}

function renderGlyph(name: GlyphName, s: StrokeProps, stroke: string) {
  switch (name) {
    // A monolith: the System itself, standing.
    case 'system':
      return (
        <>
          <Path {...s} d="M12 3 5 8v13h14V8Z" />
          <Line {...s} x1="12" y1="11" x2="12" y2="17" />
        </>
      );

    // A figure reduced to a mark: head over shoulders.
    case 'status':
      return (
        <>
          <Circle {...s} cx="12" cy="8" r="3.2" />
          <Path {...s} d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </>
      );

    // A branching path: one node splitting into two.
    case 'skills':
      return (
        <>
          <Circle {...s} cx="6" cy="18" r="2.2" />
          <Circle {...s} cx="18" cy="6" r="2.2" />
          <Circle {...s} cx="18" cy="18" r="2.2" />
          <Path {...s} d="M8.2 18h3.3a3 3 0 0 0 3-3V9" />
          <Line {...s} x1="15.8" y1="18" x2="8.2" y2="18" />
        </>
      );

    // A record of time: a dial with a mark behind it.
    case 'history':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="8.2" />
          <Polyline {...s} points="12,7.5 12,12 15.5,14" />
        </>
      );

    // Adjustment: two travel lines with settings on them.
    case 'settings':
      return (
        <>
          <Line {...s} x1="4" y1="9" x2="20" y2="9" />
          <Line {...s} x1="4" y1="16" x2="20" y2="16" />
          <Circle {...s} cx="10" cy="9" r="2.2" fill={colors.background} />
          <Circle {...s} cx="15" cy="16" r="2.2" fill={colors.background} />
        </>
      );

    case 'chevron-left':
      return <Polyline {...s} points="14.5,5 8,12 14.5,19" />;
    case 'chevron-right':
      return <Polyline {...s} points="9.5,5 16,12 9.5,19" />;
    case 'chevron-down':
      return <Polyline {...s} points="5,9.5 12,16 19,9.5" />;

    case 'close':
      return (
        <>
          <Line {...s} x1="6" y1="6" x2="18" y2="18" />
          <Line {...s} x1="18" y1="6" x2="6" y2="18" />
        </>
      );

    case 'plus':
      return (
        <>
          <Line {...s} x1="12" y1="5" x2="12" y2="19" />
          <Line {...s} x1="5" y1="12" x2="19" y2="12" />
        </>
      );

    case 'minus':
      return <Line {...s} x1="5" y1="12" x2="19" y2="12" />;

    case 'check':
      return <Polyline {...s} points="4.5,12.5 9.5,17.5 19.5,7" />;

    case 'pause':
      return (
        <>
          <Line {...s} x1="9" y1="5.5" x2="9" y2="18.5" />
          <Line {...s} x1="15" y1="5.5" x2="15" y2="18.5" />
        </>
      );

    case 'play':
      return <Path {...s} d="M8 5.5 19 12 8 18.5Z" />;

    case 'list':
      return (
        <>
          <Line {...s} x1="4" y1="7" x2="20" y2="7" />
          <Line {...s} x1="4" y1="12" x2="20" y2="12" />
          <Line {...s} x1="4" y1="17" x2="14" y2="17" />
        </>
      );

    // Locked: a closed form, distinguishable by shape and not only by dimming.
    case 'locked':
      return (
        <>
          <Rect {...s} x="5.5" y="10.5" width="13" height="9.5" rx="2" />
          <Path {...s} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </>
      );

    case 'timer':
      return (
        <>
          <Circle {...s} cx="12" cy="13.5" r="7" />
          <Line {...s} x1="12" y1="13.5" x2="12" y2="9.5" />
          <Line {...s} x1="9.5" y1="3.5" x2="14.5" y2="3.5" />
          <Line {...s} x1="12" y1="3.5" x2="12" y2="6.5" />
        </>
      );

    case 'trend':
      return (
        <>
          <Polyline {...s} points="4,17 9.5,11 13.5,14.5 20,7" />
          <Polyline {...s} points="15.5,7 20,7 20,11.5" />
        </>
      );

    case 'info':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="8.2" />
          <Line {...s} x1="12" y1="11" x2="12" y2="16.5" />
          <Circle cx="12" cy="7.8" r="1" fill={stroke} />
        </>
      );

    default:
      return null;
  }
}
