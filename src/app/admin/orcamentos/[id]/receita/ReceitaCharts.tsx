"use client";

interface Props {
  months: string[];
  net: number[];
  deductions: number[];
  products: { name: string; value: number }[];
  labels: { monthly: string; net: string; deductions: string; byProduct: string; empty: string };
  format: (n: number) => string;
}

const W = 640;
const H = 240;
const PAD = { l: 8, r: 8, t: 12, b: 28 };

export function ReceitaCharts({ months, net, deductions, products, labels, format }: Props) {
  const gross = net.map((n, i) => n + deductions[i]);
  const max = Math.max(...gross, 0);
  const hasData = max > 0;
  const bw = (W - PAD.l - PAD.r) / 12;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (max > 0 ? v / max : 0));

  const sorted = [...products].filter((p) => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
  const top = sorted[0]?.value ?? 0;

  return (
    <div className="rec-charts">
      <section className="rec-chart">
        <h3>{labels.monthly}</h3>
        {hasData ? (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.monthly}>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="#E3E7F2" strokeDasharray="3 4" />
              ))}
              {months.map((m, i) => {
                const x = PAD.l + i * bw + bw * 0.18;
                const w = bw * 0.64;
                return (
                  <g key={i}>
                    <rect x={x} y={y(net[i])} width={w} height={y(0) - y(net[i])} rx={3} fill="#3E6FE0">
                      <title>{`${m} · ${labels.net}: ${format(net[i])}`}</title>
                    </rect>
                    <rect x={x} y={y(gross[i])} width={w} height={y(net[i]) - y(gross[i])} rx={3} fill="#B9C9F3">
                      <title>{`${m} · ${labels.deductions}: ${format(deductions[i])}`}</title>
                    </rect>
                    <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b7088">{m}</text>
                  </g>
                );
              })}
            </svg>
            <div className="rec-legend">
              <span><i style={{ background: "#3E6FE0" }} />{labels.net}</span>
              <span><i style={{ background: "#B9C9F3" }} />{labels.deductions}</span>
            </div>
          </>
        ) : <p className="rec-empty">{labels.empty}</p>}
      </section>

      <section className="rec-chart">
        <h3>{labels.byProduct}</h3>
        {sorted.length > 0 ? (
          <ul className="rec-bars">
            {sorted.map((p) => (
              <li key={p.name}>
                <span className="rec-bar-name" title={p.name}>{p.name}</span>
                <span className="rec-bar-track"><span style={{ width: `${(p.value / top) * 100}%` }} /></span>
                <span className="rec-bar-val">{format(p.value)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="rec-empty">{labels.empty}</p>}
      </section>
    </div>
  );
}
