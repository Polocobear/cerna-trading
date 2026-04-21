import { useId, useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

function createPath(data: number[], width: number, height: number): string {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return data
    .map((value, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function createFillPath(data: number[], width: number, height: number): string {
  const linePath = createPath(data, width, height);
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color,
  strokeWidth = 1.5,
}: SparklineProps) {
  const gradientId = useId();
  const sparkColor = color ?? (data[data.length - 1] >= data[0] ? 'var(--positive)' : 'var(--negative)');
  const path = useMemo(() => (data.length >= 2 ? createPath(data, width, height) : ''), [data, height, width]);
  const fillPath = useMemo(
    () => (data.length >= 2 ? createFillPath(data, width, height) : ''),
    [data, height, width]
  );

  if (data.length < 2) {
    return <div className="h-8 w-[120px] rounded-full shimmer" aria-hidden="true" />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="30 day portfolio value trend"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sparkColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={sparkColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={fillPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={sparkColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1000"
        strokeDashoffset="1000"
        style={{ animation: 'sparkline-draw 800ms ease-out forwards' }}
      />
    </svg>
  );
}
