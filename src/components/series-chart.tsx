'use client';

import type { DownloadPoint } from '@/lib/types';

// ONE hand-rolled chart for the whole app (plan section 12): spark mode in
// cards, full mode in the detail drawer. No tooltips, no zoom; full mode adds
// axis labels only.

interface SeriesChartProps {
  points: DownloadPoint[];
  mode: 'spark' | 'full';
  className?: string;
}

const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

interface Paths {
  line: string;
  area: string;
  max: number;
  firstX: number;
  lastX: number;
  baseY: number;
}

function buildPaths(
  points: DownloadPoint[],
  width: number,
  height: number,
  padX: number,
  padTop: number,
  padBottom: number,
): Paths | null {
  if (points.length === 0) return null;
  const max = points.reduce((acc, point) => Math.max(acc, point.downloads), 0);
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const xAt = (index: number) =>
    points.length === 1 ? padX + innerW / 2 : padX + (index / (points.length - 1)) * innerW;
  const yAt = (value: number) => padTop + innerH - (max === 0 ? 0 : (value / max) * innerH);
  const baseY = padTop + innerH;

  const segments = points.map(
    (point, index) => `${xAt(index).toFixed(2)},${yAt(point.downloads).toFixed(2)}`,
  );
  const line = `M${segments.join(' L')}`;
  const area = `${line} L${xAt(points.length - 1).toFixed(2)},${baseY.toFixed(2)} L${xAt(0).toFixed(2)},${baseY.toFixed(2)} Z`;
  return { line, area, max, firstX: xAt(0), lastX: xAt(points.length - 1), baseY };
}

export function SeriesChart({ points, mode, className }: SeriesChartProps) {
  if (mode === 'spark') {
    const width = 120;
    const height = 36;
    const pad = 2;
    const paths = buildPaths(points, width, height, pad, pad, pad);
    if (paths === null) {
      return (
        <div
          className={`flex items-center justify-center rounded bg-surface-subtle text-[11px] text-muted ${className ?? ''}`}
        >
          No data.
        </div>
      );
    }
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Daily downloads trend"
        className={`text-accent ${className ?? ''}`}
      >
        <path d={paths.area} fill="currentColor" fillOpacity={0.12} stroke="none" />
        <path
          d={paths.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const width = 560;
  const height = 220;
  const padX = 12;
  const padTop = 20;
  const padBottom = 28;
  const paths = buildPaths(points, width, height, padX, padTop, padBottom);
  if (paths === null) {
    return (
      <div
        className={`flex h-40 w-full items-center justify-center rounded bg-surface-subtle text-xs text-muted ${className ?? ''}`}
      >
        No data.
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Daily downloads, ${points.length} days`}
      className={`h-auto w-full text-accent ${className ?? ''}`}
    >
      <line
        x1={padX}
        x2={width - padX}
        y1={paths.baseY}
        y2={paths.baseY}
        className="stroke-border"
        strokeWidth={1}
      />
      <path d={paths.area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path
        d={paths.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <text x={padX} y={12} fontSize={11} className="fill-muted">
        {`max ${compactNumber.format(paths.max)} per day`}
      </text>
      {first !== undefined && (
        <text x={padX} y={height - 8} fontSize={11} className="fill-muted">
          {first.day}
        </text>
      )}
      {last !== undefined && (
        <text x={width - padX} y={height - 8} fontSize={11} textAnchor="end" className="fill-muted">
          {last.day}
        </text>
      )}
    </svg>
  );
}
