import { money } from "./shared";
export function SalesChart({
  bars,
  monthly,
}: {
  bars: { key: string; amount: number }[];
  monthly: boolean;
}) {
  const high = Math.max(100, ...bars.map((b) => b.amount)),
    low = Math.min(0, ...bars.map((b) => b.amount));
  const top = 18,
    bottom = 172,
    left = 65,
    right = 735;
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top);
  const width = (right - left) / Math.max(bars.length, 1),
    baseline = y(0);
  return (
    <svg
      viewBox="0 0 750 210"
      className="sales-svg"
      role="img"
      aria-label="Net sales by date in PKR"
    >
      {[0, 0.5, 1].map((f) => {
        const value = low + (high - low) * f;
        return (
          <g key={f}>
            <line
              x1={left}
              x2={right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--border)"
            />
            <text
              x={left - 8}
              y={y(value) + 4}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="10"
            >
              {money(value)}
            </text>
          </g>
        );
      })}
      <line
        x1={left}
        x2={right}
        y1={baseline}
        y2={baseline}
        stroke="var(--muted)"
      />
      {bars.map((bar, index) => {
        const x = left + index * width + width * 0.18;
        const label = new Date(
          bar.key + (monthly ? "-15" : "") + "T12:00:00Z",
        ).toLocaleDateString("en-GB", {
          month: "short",
          ...(monthly ? {} : { day: "numeric" }),
        });
        return (
          <g key={bar.key}>
            <title>
              {bar.key}: PKR {money(bar.amount)}
            </title>
            <rect
              x={x}
              y={Math.min(y(bar.amount), baseline)}
              width={width * 0.64}
              height={Math.abs(y(bar.amount) - baseline)}
              rx="2"
              fill={bar.amount < 0 ? "var(--danger)" : "var(--chart)"}
            />
            {bars.length <= 13 && (
              <text
                x={x + width * 0.32}
                y={bar.amount < 0 ? y(bar.amount) + 12 : y(bar.amount) - 5}
                textAnchor="middle"
                fontSize="10"
                fill="var(--text)"
              >
                {money(bar.amount)}
              </text>
            )}
            {(bars.length <= 13 || index % 5 === 0) && (
              <text
                x={x + width * 0.32}
                y="193"
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted)"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
      <text x="8" y="205" fontSize="9" fill="var(--muted)">
        PKR
      </text>
    </svg>
  );
}
