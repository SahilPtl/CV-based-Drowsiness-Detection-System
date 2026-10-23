export default function EarChart({ history, thresholds }) {
  const width = 800,
    height = 145,
    left = 38,
    right = 16,
    top = 14,
    bottom = 27;
  const end = history.at(-1)?.t ?? 60000,
    start = end - 60000;
  const x = (t) => left + ((t - start) / 60000) * (width - left - right);
  const y = (v) =>
    top + (1 - Math.min(0.6, Math.max(0, v)) / 0.6) * (height - top - bottom);
  let path = "",
    pen = false,
    previous = null;
  for (const point of history) {
    if (point.ear === null || (previous !== null && point.t - previous > 500))
      pen = false;
    if (point.ear !== null) {
      path += `${pen ? "L" : "M"}${x(point.t).toFixed(1)},${y(point.ear).toFixed(1)} `;
      pen = true;
    }
    previous = point.t;
  }
  const hasData = history.some((p) => p.ear !== null);
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Average eye aspect ratio over the last 60 seconds. Gaps indicate unavailable observations."
      >
        {[0, 0.2, 0.4, 0.6].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
              className="chart-grid"
            />
            <text x="3" y={y(value) + 4}>
              {value.toFixed(1)}
            </text>
          </g>
        ))}
        {[60, 45, 30, 15, 0].map((seconds) => (
          <text
            key={seconds}
            x={x(end - seconds * 1000)}
            y={height - 4}
            textAnchor={seconds === 0 ? "end" : "middle"}
          >
            {seconds === 0 ? "now" : `−${seconds}s`}
          </text>
        ))}
        <line
          x1={left}
          x2={width - right}
          y1={y(thresholds.left)}
          y2={y(thresholds.left)}
          className="chart-threshold"
        />
        {Math.abs(thresholds.left - thresholds.right) > 0.001 && (
          <line
            x1={left}
            x2={width - right}
            y1={y(thresholds.right)}
            y2={y(thresholds.right)}
            className="chart-threshold secondary"
          />
        )}
        <path d={path} className="ear-line" />
      </svg>
      {!hasData && (
        <div className="chart-empty">Waiting for valid eye observations</div>
      )}
    </div>
  );
}
