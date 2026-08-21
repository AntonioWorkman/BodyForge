import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Canvas, Circle, Line, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';

import { Text } from '@/components';
import { colors, layout, palette, spacing } from '@/design';
import { fire as fireHaptic } from '@/motion/haptics';

import type { Series, SeriesPoint } from './chartData';

/**
 * A real line chart over recorded data.
 *
 * Drawn in Skia from actual points — there is no image, no placeholder and no
 * synthesised trend. Tapping the plot selects the nearest point and reports the
 * underlying record, so every mark on screen can be traced to something the
 * player logged.
 */
interface LineChartProps {
  series: Series;
  height?: number;
  /** Suffix shown next to values, e.g. "lb" or "reps". */
  unit: string;
  /** Formats a point's timestamp for the readout. */
  formatDate: (t: number) => string;
  onSelectPoint?: (point: SeriesPoint) => void;
  testID?: string;
}

const PADDING = { left: 8, right: 8, top: 14, bottom: 22 };

export function LineChart({
  series,
  height = 170,
  unit,
  formatDate,
  onSelectPoint,
  testID,
}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<SeriesPoint | null>(null);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = Math.max(0, height - PADDING.top - PADDING.bottom);

  // A flat series would divide by zero; pad it so the line sits mid-plot.
  const { low, high } = useMemo(() => {
    const span = series.max - series.min;
    if (span > 0) {
      const margin = span * 0.15;
      return { low: series.min - margin, high: series.max + margin };
    }
    const value = series.max || 1;
    return { low: value * 0.95, high: value * 1.05 };
  }, [series.max, series.min]);

  const project = useCallback(
    (point: SeriesPoint) => {
      if (series.points.length === 0 || plotWidth <= 0) return { x: 0, y: 0 };

      const firstT = series.points[0]!.t;
      const lastT = series.points[series.points.length - 1]!.t;
      const spanT = lastT - firstT;

      const x =
        PADDING.left + (spanT > 0 ? ((point.t - firstT) / spanT) * plotWidth : plotWidth / 2);
      const y = PADDING.top + plotHeight - ((point.value - low) / (high - low)) * plotHeight;

      return { x, y };
    },
    [high, low, plotHeight, plotWidth, series.points],
  );

  const { linePath, areaPath, projected } = useMemo(() => {
    const line = Skia.Path.Make();
    const area = Skia.Path.Make();
    const points = series.points.map((point) => ({ point, ...project(point) }));

    points.forEach((entry, index) => {
      if (index === 0) {
        line.moveTo(entry.x, entry.y);
        area.moveTo(entry.x, PADDING.top + plotHeight);
        area.lineTo(entry.x, entry.y);
      } else {
        line.lineTo(entry.x, entry.y);
        area.lineTo(entry.x, entry.y);
      }
    });

    const last = points[points.length - 1];
    if (last) {
      area.lineTo(last.x, PADDING.top + plotHeight);
      area.close();
    }

    return { linePath: line, areaPath: area, projected: points };
  }, [plotHeight, project, series.points]);

  const handleTouch = useCallback(
    (x: number) => {
      if (projected.length === 0) return;
      let nearest = projected[0]!;
      for (const entry of projected) {
        if (Math.abs(entry.x - x) < Math.abs(nearest.x - x)) nearest = entry;
      }
      fireHaptic('selection');
      setSelected(nearest.point);
      onSelectPoint?.(nearest.point);
    },
    [onSelectPoint, projected],
  );

  if (series.points.length === 0) {
    return (
      <View style={[styles.empty, { height }]} testID={testID}>
        <Text variant="caption" color="textMuted" align="center">
          No data recorded in this range.
        </Text>
      </View>
    );
  }

  // A single record is a value, not a trend. Showing it as a lone dot in a
  // full-height plot reads as a broken chart, so it is stated plainly instead.
  if (series.points.length === 1) {
    const only = series.points[0]!;
    return (
      <View style={styles.single} testID={testID}>
        <Text variant="numeric" tabular>
          {formatValue(only.value)}
          <Text variant="bodyLarge" color="textMuted">
            {' '}
            {unit}
          </Text>
        </Text>
        <Text variant="caption" color="textMuted">
          {formatDate(only.t)} · one record so far
        </Text>
        <Text variant="caption" color="textMuted">
          Log another to see a trend.
        </Text>
      </View>
    );
  }

  const readout = selected ?? series.last;

  return (
    <View testID={testID}>
      <View style={styles.readout}>
        <Text variant="numeric" tabular>
          {formatValue(readout?.value ?? 0)}
          <Text variant="bodyLarge" color="textMuted">
            {' '}
            {unit}
          </Text>
        </Text>
        <Text variant="caption" color="textMuted">
          {readout ? formatDate(readout.t) : ''}
          {selected ? ' · tapped' : ' · latest'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={`Chart with ${series.points.length} recorded points`}
        accessibilityHint="Tap to inspect a point"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPress={(event) => handleTouch(event.nativeEvent.locationX)}
        style={{ height }}
      >
        {width > 0 ? (
          <Canvas style={StyleSheet.absoluteFill}>
            {/* Baseline, so a flat line still reads as sitting on something. */}
            <Line
              p1={vec(PADDING.left, PADDING.top + plotHeight)}
              p2={vec(PADDING.left + plotWidth, PADDING.top + plotHeight)}
              color={colors.borderSubtle}
              strokeWidth={1}
            />

            <Path path={areaPath} style="fill">
              <LinearGradient
                start={vec(0, PADDING.top)}
                end={vec(0, PADDING.top + plotHeight)}
                colors={[`${palette.royalViolet}33`, `${palette.royalViolet}00`]}
              />
            </Path>

            <Path
              path={linePath}
              style="stroke"
              strokeWidth={2}
              strokeJoin="round"
              strokeCap="round"
              color={palette.spectralLavender}
            />

            {projected.map((entry) => (
              <Circle
                key={entry.point.sourceId}
                cx={entry.x}
                cy={entry.y}
                r={entry.point.sourceId === selected?.sourceId ? 5 : 2.5}
                color={
                  entry.point.sourceId === selected?.sourceId
                    ? palette.spectralLavender
                    : `${palette.spectralLavender}99`
                }
              />
            ))}
          </Canvas>
        ) : null}
      </Pressable>

      <View style={styles.axis}>
        <Text variant="micro" color="textMuted">
          {series.first ? formatDate(series.first.t) : ''}
        </Text>
        <Text variant="micro" color="textMuted">
          {series.last ? formatDate(series.last.t) : ''}
        </Text>
      </View>
    </View>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: layout.hairline,
    borderColor: colors.borderSubtle,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  single: {
    gap: spacing.xxs,
    paddingVertical: spacing.lg,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.borderSubtle,
  },
  readout: { gap: spacing.xxs, marginBottom: spacing.sm },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
