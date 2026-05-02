import { useEffect, useRef } from "react";
import uPlot, { type AlignedData, type Options } from "uplot";
import "uplot/dist/uPlot.min.css";

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

export interface TelemetryChartProps {
  /** Shared time axis, seconds. */
  time: number[];
  series: ChartSeries[];
  height: number;
  yLabel: string;
  /** Optional cursor x, in seconds (for external scrubber sync). */
  cursorTime?: number | null;
  /** Called when user moves the mouse over the chart. */
  onCursor?: (timeSec: number | null) => void;
  /** Optional fixed y-axis range. */
  yRange?: [number, number];
}

export function TelemetryChart({
  time,
  series,
  height,
  yLabel,
  cursorTime,
  onCursor,
  yRange,
}: TelemetryChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;

  useEffect(() => {
    if (!containerRef.current) return;
    const data: AlignedData = [time, ...series.map((s) => s.values)];

    const opts: Options = {
      width: containerRef.current.clientWidth,
      height,
      padding: [10, 12, 0, 0],
      legend: { show: true, live: true },
      cursor: {
        drag: { x: false, y: false },
        focus: { prox: 16 },
      },
      scales: {
        x: { time: false },
        y: yRange ? { range: yRange as [number, number] } : {},
      },
      axes: [
        {
          stroke: "#9ca3af",
          grid: { stroke: "rgba(255,255,255,0.04)" },
          ticks: { stroke: "rgba(255,255,255,0.08)", size: 6 },
          values: (_u, ts) => ts.map((t) => `${t.toFixed(1)}s`),
        },
        {
          label: yLabel,
          stroke: "#9ca3af",
          grid: { stroke: "rgba(255,255,255,0.04)" },
          ticks: { stroke: "rgba(255,255,255,0.08)", size: 6 },
        },
      ],
      series: [
        { label: "t" },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: 1.5,
          points: { show: false },
        })),
      ],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            if (idx == null || idx < 0 || idx >= time.length) {
              onCursorRef.current?.(null);
              return;
            }
            onCursorRef.current?.(time[idx]);
          },
        ],
      },
    };

    const plot = new uPlot(opts, data, containerRef.current);
    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && plotRef.current) {
        plotRef.current.setSize({
          width: containerRef.current.clientWidth,
          height,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, series, height, yLabel]);

  // Drive the cursor from outside (e.g., scrubber).
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    if (cursorTime == null) return;
    const idx = closestIndex(time, cursorTime);
    if (idx >= 0) {
      const left = plot.valToPos(time[idx], "x");
      const top = plot.valToPos(plot.data[1]?.[idx] ?? 0, "y");
      plot.setCursor({ left, top }, true);
    }
  }, [cursorTime, time]);

  return <div ref={containerRef} className="chart" />;
}

function closestIndex(arr: number[], v: number): number {
  if (arr.length === 0) return -1;
  let lo = 0;
  let hi = arr.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= v) lo = mid;
    else hi = mid;
  }
  return Math.abs(arr[lo] - v) < Math.abs(arr[hi] - v) ? lo : hi;
}
