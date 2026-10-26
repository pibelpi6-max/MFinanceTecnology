"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Mapa do orçamento: a dinâmica dos módulos do sistema em torno da DRE.
 * À esquerda os módulos que alimentam a DRE (setas animadas, o fluxo vai em
 * direção a ela), à direita os que consomem dela. Cada card é um módulo
 * clicável; os que ainda não existem aparecem como "em breve".
 */

interface Node {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string[];
  sub: string[];
  note?: string;
  icon: string;
  dark?: boolean;
  href?: string;
}

const NODES: Node[] = [
  { key: "receita", x: 75, y: 59, w: 352, h: 101, title: ["Receita"], sub: ["Comercial · Marketing"], note: "preço × volume", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { key: "custos", x: 75, y: 223, w: 352, h: 102, title: ["Custos (ficha técnica)"], sub: ["Industrial · Suprimentos"], icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
  { key: "capex", x: 75, y: 369, w: 352, h: 101, title: ["Capex"], sub: ["Engenharia · Industrial"], icon: "M3 21V10l6 4V10l6 4V6h3v15zM3 21h18" },
  { key: "modelos", x: 75, y: 554, w: 352, h: 102, title: ["Modelos"], sub: ["FP&A"], icon: "M6 3v18M12 3v18M18 3v18M4 8h4M10 15h4M16 10h4" },
  { key: "matrix", x: 75, y: 718, w: 352, h: 102, title: ["Matrix"], sub: ["Gestores de centro de custo"], icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z", href: "/admin/orcamento/matriz" },
  { key: "workflow", x: 645, y: 59, w: 360, h: 120, title: ["Workflow Aprovação", "DRE"], sub: ["Diretoria · CFO"], icon: "M8 4h8v3H8zM6 5H5v16h14V5h-1M9 14l2 2 4-4", dark: true },
  { key: "dre", x: 645, y: 306, w: 360, h: 142, title: ["DRE"], sub: ["FP&A · Controladoria"], icon: "M3 4h18v16H3zM3 10h18M3 15h18M9 10v10", dark: true },
  { key: "rateio", x: 645, y: 575, w: 360, h: 120, title: ["Rateio"], sub: ["Controladoria"], icon: "M12 3v9h9a9 9 0 1 1-9-9zM15 3a9 9 0 0 1 6 6h-6z", dark: true },
  { key: "caixa", x: 1133, y: 111, w: 330, h: 127, title: ["Fluxo de caixa"], sub: ["Tesouraria"], icon: "M4 8h14l-4-4M20 16H6l4 4" },
  { key: "balanco", x: 1133, y: 385, w: 330, h: 127, title: ["Balanço"], sub: ["Contabilidade ·", "Controladoria"], icon: "M12 3v18M6 21h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" },
  { key: "indireto", x: 1133, y: 580, w: 330, h: 128, title: ["Fluxo de caixa", "Indireto"], sub: ["FP&A · Controladoria"], icon: "M4 8h14l-4-4M20 16H6l4 4" },
];

const BLUE = "#3E6FE0";
const GREEN = "#2BAE8B";
const MUTED = "#B4BAD0";
const AMBER = "#F59E0B";

/** Setas que alimentam a DRE: desenhadas da origem para o destino, com fluxo animado. */
const FEEDS = [
  "M427 100L641 340",
  "M251 223V162",
  "M427 277L641 375",
  "M427 384L641 379",
  "M427 604L641 400",
  "M427 768L641 425",
];

export function DreDiagram() {
  const router = useRouter();
  const t = useTranslations("orcamentos");

  return (
    <svg viewBox="0 0 1500 880" className="dre-map" role="group" aria-label="Mapa do orçamento">
      <defs>
        {[
          ["b", BLUE],
          ["o", AMBER],
          ["m", MUTED],
          ["g", GREEN],
        ].map(([id, color]) => (
          <marker key={id} id={`arr-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={color} />
          </marker>
        ))}
      </defs>

      {/* divisórias das zonas */}
      <line x1="641" y1="0" x2="641" y2="775" stroke="#C9CFE0" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" />
      <line x1="1005" y1="0" x2="1005" y2="775" stroke="#C9CFE0" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" />

      {/* conexões */}
      <g fill="none" strokeWidth="2.5" strokeLinecap="round">
        {FEEDS.map((d) => (
          <path key={d} d={d} stroke={BLUE} strokeDasharray="9 7" className="dre-flow" markerEnd="url(#arr-b)" />
        ))}
        <path d="M427 430H532V483H1131" stroke={AMBER} strokeDasharray="12 8" markerEnd="url(#arr-o)" />
        <path d="M825 179V303" stroke={MUTED} markerEnd="url(#arr-m)" />
        <path d="M825 575V451" stroke={MUTED} markerEnd="url(#arr-m)" />
        <path d="M1005 342L1131 196" stroke={GREEN} markerEnd="url(#arr-g)" />
        <path d="M1005 410L1131 447" stroke={GREEN} markerEnd="url(#arr-g)" />
        <path d="M1297 238V383" stroke={MUTED} markerEnd="url(#arr-m)" />
      </g>

      {/* partículas percorrendo as setas que alimentam a DRE */}
      <g className="dre-dots" fill={BLUE}>
        {FEEDS.map((d, i) => (
          <circle key={d} r="5">
            <animateMotion dur="2.6s" begin={`${(i * 0.45).toFixed(2)}s`} repeatCount="indefinite" path={d} />
          </circle>
        ))}
      </g>

      {/* rótulos das conexões */}
      <g fontStyle="italic" fontSize="18" fill="#6B7088">
        <text x="433" y="68" fill="#2F5BD0">Receita</text>
        <text x="433" y="90" fill="#2F5BD0">Deduções</text>
        <text x="433" y="112" fill="#2F5BD0">CPV</text>
        <text x="261" y="212" fill="#2F5BD0">Custo unit. total</text>
        <text x="433" y="266" fill="#2F5BD0">Custo Matéria-prima</text>
        <text x="433" y="373" fill="#2F5BD0">Depreciação</text>
        <text x="433" y="526" fill="#2F5BD0">Impostos</text>
        <text x="433" y="684" fill="#2F5BD0">Despesas</text>
        <text x="1008" y="223">condições</text>
        <text x="1008" y="245">financeiras</text>
        <text x="1310" y="343">saldo e</text>
        <text x="1310" y="365">capital de giro</text>
        <text x="640" y="507" fill="#B7791F">Imobilizado</text>
      </g>

      {/* módulos */}
      {NODES.map((n) => {
        const active = Boolean(n.href);
        const hero = n.key === "dre";
        const total = n.title.length * 28 + n.sub.length * 22 + (n.note ? 22 : 0);
        let y = n.y + (n.h - total) / 2 + 22;
        const tx = n.x + 100;
        const rows: React.ReactNode[] = [];
        n.title.forEach((l, i) => {
          rows.push(
            <text key={`t${i}`} x={tx} y={y} fontSize="22" fontWeight="700" fill={hero ? "#fff" : "#1C2033"}>
              {l}
            </text>
          );
          y += 28;
        });
        n.sub.forEach((l, i) => {
          rows.push(
            <text key={`s${i}`} x={tx} y={y - 2} fontSize="16" fontWeight="600" fill={hero ? "#DFE8FF" : "#6B7088"}>
              {l}
            </text>
          );
          y += 22;
        });
        if (n.note) {
          rows.push(
            <text key="n" x={tx} y={y - 2} fontSize="16" fontStyle="italic" fill="#8A90A8">
              {n.note}
            </text>
          );
        }
        return (
          <g
            key={n.key}
            className={`dre-node${active ? " is-active" : ""}${hero ? " is-hero" : ""}`}
            role={active ? "link" : undefined}
            tabIndex={active ? 0 : undefined}
            onClick={active ? () => router.push(n.href!) : undefined}
            onKeyDown={active ? (e) => e.key === "Enter" && router.push(n.href!) : undefined}
          >
            <title>{active ? n.title.join(" ") : `${n.title.join(" ")} — ${t("mod_soon")}`}</title>
            <rect
              className="dre-card"
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="16"
              fill={hero ? BLUE : "#fff"}
              stroke={hero ? BLUE : active ? BLUE : "#E6E8F0"}
              strokeWidth={active ? 2 : 1.5}
            />
            <rect x={n.x + 24} y={n.y + n.h / 2 - 28} width="56" height="56" rx="14" fill={hero ? "rgba(255,255,255,.2)" : "#E9EFFF"} />
            <g
              transform={`translate(${n.x + 24 + 28 - 12 * 1.5} ${n.y + n.h / 2 - 12 * 1.5}) scale(1.5)`}
              fill="none"
              stroke={hero ? "#fff" : BLUE}
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={n.icon} />
            </g>
            {rows}
            {!active && !hero && (
              <g>
                <rect x={n.x + 24} y={n.y - 11} width="74" height="22" rx="11" fill="#ECEEF5" stroke="#fff" strokeWidth="2" />
                <text x={n.x + 61} y={n.y + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#6B7088">
                  {t("mod_soon")}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* legendas das zonas */}
      <g fontSize="18" fontWeight="700" textAnchor="middle">
        <rect x="531" y="780" width="220" height="42" rx="21" fill="#E9EFFF" />
        <text x="641" y="808" fill="#2F5BD0">{t("zoneFeeds")}</text>
        <rect x="896" y="780" width="220" height="42" rx="21" fill="#DCF5EA" />
        <text x="1006" y="808" fill="#0B7A53">{t("zoneConsumes")}</text>
      </g>
    </svg>
  );
}
