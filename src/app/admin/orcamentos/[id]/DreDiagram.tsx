"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Mapa do orçamento: tudo gira em torno da DRE. À esquerda ficam os módulos
 * que alimentam a DRE, à direita os que consomem dela. Só os módulos que já
 * existem são clicáveis (hoje: Matrix); os demais aparecem como "em breve".
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

const BLUE = "#1BA1E2";
const ORANGE = "#F59E0B";
const GRAY = "#9AA0A6";

export function DreDiagram() {
  const router = useRouter();
  const t = useTranslations("orcamentos");

  return (
    <svg viewBox="0 0 1500 880" className="dre-map" role="group" aria-label="Mapa do orçamento">
      <defs>
        {[
          ["b", BLUE],
          ["o", ORANGE],
          ["g", GRAY],
          ["y", "#FFC000"],
        ].map(([id, color]) => (
          <marker key={id} id={`arr-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={color} />
          </marker>
        ))}
      </defs>

      {/* divisórias */}
      <line x1="641" y1="0" x2="641" y2="775" stroke={BLUE} strokeWidth="2" strokeDasharray="6 5" />
      <line x1="1005" y1="0" x2="1005" y2="775" stroke="#FFC000" strokeWidth="2" strokeDasharray="6 5" />

      {/* conexões */}
      <g fill="none" strokeWidth="2">
        <path d="M427 100L641 340" stroke={BLUE} markerEnd="url(#arr-b)" />
        <path d="M251 223V162" stroke={BLUE} markerEnd="url(#arr-b)" />
        <path d="M427 277L641 375" stroke={BLUE} strokeDasharray="10 5 2 5" markerEnd="url(#arr-b)" />
        <path d="M427 384L641 379" stroke={BLUE} markerEnd="url(#arr-b)" />
        <path d="M427 430H532V483H1131" stroke={ORANGE} strokeDasharray="14 7" markerEnd="url(#arr-o)" />
        <path d="M427 604L641 400" stroke={BLUE} markerEnd="url(#arr-b)" />
        <path d="M427 768L641 425" stroke={BLUE} strokeDasharray="10 5 2 5" markerEnd="url(#arr-b)" />
        <path d="M825 179V303" stroke={GRAY} markerEnd="url(#arr-g)" />
        <path d="M825 575V451" stroke={GRAY} markerEnd="url(#arr-g)" />
        <path d="M1005 342L1131 196" stroke="#FFC000" markerEnd="url(#arr-y)" />
        <path d="M1005 410L1131 447" stroke="#FFC000" markerEnd="url(#arr-y)" />
        <path d="M1297 238V383" stroke={GRAY} markerEnd="url(#arr-g)" />
      </g>

      {/* rótulos das conexões */}
      <g fontStyle="italic" fontSize="19" fill="#1F6FB5">
        <text x="433" y="68">Receita</text>
        <text x="433" y="90">Deduções</text>
        <text x="433" y="112">CPV</text>
        <text x="261" y="212">Custo unit. total</text>
        <text x="433" y="266">Custo Matéria-prima</text>
        <text x="433" y="373">Depreciação</text>
        <text x="433" y="526">Impostos</text>
        <text x="433" y="684">Despesas</text>
        <text x="1008" y="223">condições</text>
        <text x="1008" y="245">financeiras</text>
        <text x="1310" y="343" fill="#1F6FB5">saldo e</text>
        <text x="1310" y="365">capital de giro</text>
        <text x="640" y="507" fill="#D97706">Imobilizado</text>
      </g>

      {/* módulos */}
      {NODES.map((n) => {
        const active = Boolean(n.href);
        const lines = n.title.length + n.sub.length + (n.note ? 1 : 0);
        const total = n.title.length * 30 + n.sub.length * 23 + (n.note ? 22 : 0);
        let y = n.y + (n.h - total) / 2 + 24;
        const cx = n.x + n.w / 2 + 30;
        const rows: React.ReactNode[] = [];
        n.title.forEach((l, i) => {
          rows.push(
            <text key={`t${i}`} x={cx} y={y} textAnchor="middle" fontSize="23" fontWeight="700" fill="#fff">
              {l}
            </text>
          );
          y += 30;
        });
        n.sub.forEach((l, i) => {
          rows.push(
            <text key={`s${i}`} x={cx} y={y - 3} textAnchor="middle" fontSize="19" fontWeight="700" fill="#FFC95C">
              {l}
            </text>
          );
          y += 23;
        });
        if (n.note) {
          rows.push(
            <text key="n" x={cx} y={y - 3} textAnchor="middle" fontSize="19" fontStyle="italic" fill="#fff">
              {n.note}
            </text>
          );
        }
        void lines;
        return (
          <g
            key={n.key}
            className={`dre-node${active ? " is-active" : ""}`}
            role={active ? "link" : undefined}
            tabIndex={active ? 0 : undefined}
            onClick={active ? () => router.push(n.href!) : undefined}
            onKeyDown={active ? (e) => e.key === "Enter" && router.push(n.href!) : undefined}
          >
            <title>{active ? n.title.join(" ") : `${n.title.join(" ")} — ${t("mod_soon")}`}</title>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="16" fill={n.dark ? "#04215E" : "#14366B"} />
            <g transform={`translate(${n.x + 30} ${n.y + n.h / 2 - 20}) scale(1.7)`} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d={n.icon} />
            </g>
            {rows}
          </g>
        );
      })}

      {/* legendas das zonas */}
      <g fontSize="21" fontWeight="700" fill="#fff" textAnchor="middle">
        <rect x="531" y="773" width="218" height="52" rx="4" fill="#00B0F0" />
        <text x="640" y="808">{t("zoneFeeds")}</text>
        <rect x="897" y="772" width="218" height="52" rx="4" fill="#F5A623" />
        <text x="1006" y="807">{t("zoneConsumes")}</text>
      </g>
    </svg>
  );
}
