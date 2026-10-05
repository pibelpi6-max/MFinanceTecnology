"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { ColumnsModal } from "./ColumnsModal";
import { FilterDropdown } from "./FilterDropdown";
import { usePersistedPrefs } from "./usePersistedPrefs";
import { useSingleExpand } from "@/hooks/useSingleExpand";
import type { ExpandPhase } from "@/hooks/useSingleExpand";
import type { DataTableProps, ColPref, RowMeta, ColumnMeta } from "./types";

/**
 * Anima a altura real do conteúdo expandido (medida via scrollHeight) para
 * criar um efeito de "empurrar" suave, em vez de opacity/translateY sobre
 * uma altura que já muda instantaneamente.
 */
function ExpandAnimator({
  phase,
  onDone,
  className,
  children,
}: {
  phase: ExpandPhase;
  onDone: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | "none">(phase === "open" ? "none" : 0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    if (phase === "opening") {
      const target = el.scrollHeight;
      setMaxHeight(0);
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setMaxHeight(target));
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    }
    if (phase === "closing") {
      const current = el.scrollHeight;
      setMaxHeight(current);
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setMaxHeight(0));
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    }
    if (phase === "open") {
      setMaxHeight("none");
    }
  }, [phase]);

  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "max-height") return;
    onDone();
  }

  return (
    <div
      style={{
        maxHeight: maxHeight === "none" ? "none" : `${maxHeight}px`,
        overflow: "hidden",
        opacity: phase === "closing" ? 0 : 1,
        transition: "max-height 280ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease",
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div ref={innerRef} className={className}>
        {children}
      </div>
    </div>
  );
}

/**
 * DataTable genérico — substitui o EscolasTable monolítico.
 * Suporta drag/resize/persist/filter/search/sticky/etc com customização opcional por cadastro.
 *
 * 🚧 WIP — sendo construído incrementalmente (Etapa 4 de 11).
 * Atual: scaffold + resize + persistência de widths + drag-and-drop + sticky Ações + dividers.
 * Use o EscolasTable.tsx antigo até a Etapa 9 estar completa.
 */

/** Altura da barra fixa do topo (topbar + breadcrumb). Usada pelo sticky header e pelo clip do ghost de drag. */
const STICKY_TOP_OFFSET = 56;

function norm(v: string) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function strip(v: string) { return v.replace(/[()\-\/\.\s]/g, ""); }

export function DataTable<T extends {
 id: string }>({
  items,
  columns,
  prefsKey,
  initialPrefs,
  onEdit,
  onDelete,
  editIcon,
  editLabel,
  deleteIcon,
  deleteLabel,
  canDelete,
  renderExpanded,
  expandedRowId,
  onNew,
  newLabel,
  extraActions,
  onImport,
  emptyMessage = "Nenhum registro cadastrado",
  emptyIcon,
  buildTree,
  drawerForRow,
  closeDrawerSignal,
  infoColumnKey,
  hasHighlight,
  rowIcon,
  isIndentedRow,
  isDimmedRow,
  rowBorderBottom,
  bodyTextClassName = "text-sm",
}: DataTableProps<T>) {
  const tCommon = useTranslations("common");
  const tt = useTranslations("common.tooltips");
  // ── Persistência ──────────────────────────────────────────
  const persist = usePersistedPrefs(prefsKey, initialPrefs);

  // ── Sort por coluna ────────────────────────────────────────
  const [sort, setSort] = useState<
    { col: string; dir: "asc" | "desc" } | undefined
  >(() => initialPrefs?.sort);

  // ── Busca global ──────────────────────────────────────────
  const [search, setSearch] = useState("");
  const isSearching = search.trim().length > 0;

  // ── Filtros por coluna ────────────────────────────────────
  const [appliedFilters, setAppliedFilters] = useState<
    Record<string, Set<string>>
  >(() => {
    const saved = initialPrefs?.filters ?? {};
    const result: Record<string, Set<string>> = {};
    for (const [colKey, vals] of Object.entries(saved)) {
      if (vals.length > 0) result[colKey] = new Set(vals);
    }
    return result;
  });
  const [pendingFilters, setPendingFilters] = useState<
    Record<string, Set<string>>
  >({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const tableCardRef  = useRef<HTMLDivElement>(null);
  const fakeScrollRef = useRef<HTMLDivElement>(null);
  const fakeInnerRef  = useRef<HTMLDivElement>(null);
  const fakeThumbRef  = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const totalAppliedFilters = Object.values(appliedFilters).reduce(
    (sum, s) => sum + s.size,
    0,
  );
  const isFiltering = totalAppliedFilters > 0;

  // Valor usado tanto pra montar as opcoes/contagem do dropdown quanto pro
  // filtro real bater linha por linha -- os dois PRECISAM usar exatamente a
  // mesma logica, senao a contagem mostra um numero que o filtro real nunca
  // encontra (aconteceu com colunas que tem getText customizado, tipo
  // Escola: a contagem usava getText mas o filtro real comparava contra o
  // valor bruto da celula, que e' outra coisa).
  function getFilterValue(col: ColumnMeta<T>, item: T): string {
    const rawValue = (item as Record<string, unknown>)[col.key];
    if (col.filterValueLabels) {
      // Usa o valor BRUTO da celula como chave do filtro sempre que
      // possivel (em vez de tentar "adivinhar" a chave a partir do texto
      // ja traduzido/exibido). O texto exibido pode vir de uma fonte
      // diferente da traducao usada em filterValueLabels (ex: status
      // customizado por tenant com rotulo proprio) e nao tem garantia de
      // bater -- isso fazia o filtro nunca casar com o valor real gravado
      // no banco, mesmo com a opcao certa marcada.
      if (typeof rawValue === "string" && rawValue) return rawValue;
      if (col.getText) {
        const text = col.getText(item);
        return Object.entries(col.filterValueLabels).find(([, label]) => label === text)?.[0] ?? text;
      }
      return "";
    }
    if (col.getText) return col.getText(item);
    if (typeof rawValue === "string") return rawValue;
    if (typeof rawValue === "number") return String(rawValue);
    return "";
  }
  function getOptions(colKey: string): Array<[string, number]> {
    const col = columns.find((c) => c.key === colKey);
    if (!col) return [];
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      const v = getFilterValue(col, item);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function handleOpenFilter(colKey: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (openFilterCol === colKey) {
      setOpenFilterCol(null);
      setDropdownPos(null);
      return;
    }
    setPendingFilters((prev) => ({
      ...prev,
      [colKey]: new Set(appliedFilters[colKey] ?? new Set()),
    }));
    const th = thRefs.current[colKey];
    const card = tableCardRef.current;
    if (th && card) {
      const thRect = th.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const dropdownWidth = 220;
      const top = thRect.bottom - cardRect.top;
      let left = thRect.right - cardRect.left - dropdownWidth;
      left = Math.min(left, cardRect.width - dropdownWidth);
      left = Math.max(0, left);
      setDropdownPos({ top, left });
    }
    setOpenFilterCol(colKey);
  }

  function togglePendingFilter(val: string) {
    if (!openFilterCol) return;
    setPendingFilters((prev) => {
      const current = prev[openFilterCol] ?? new Set<string>();
      const next = new Set(current);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return { ...prev, [openFilterCol]: next };
    });
  }

  function serializeFilters(
    f: Record<string, Set<string>>,
  ): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(f)) {
      if (v.size > 0) out[k] = Array.from(v);
    }
    return out;
  }

  function applyFilter() {
    if (!openFilterCol) return;
    const newFilters = {
      ...appliedFilters,
      [openFilterCol]: new Set(pendingFilters[openFilterCol] ?? new Set()),
    };
    setAppliedFilters(newFilters);
    persist({ filters: serializeFilters(newFilters) });
    setOpenFilterCol(null);
    setDropdownPos(null);
  }

  function clearPendingFilter() {
    if (!openFilterCol) return;
    setPendingFilters((prev) => ({
      ...prev,
      [openFilterCol]: new Set(),
    }));
  }

  function removeAppliedFilterValue(colKey: string, val: string) {
    const current = appliedFilters[colKey] ?? new Set<string>();
    const next = new Set(current);
    next.delete(val);
    const newFilters = { ...appliedFilters, [colKey]: next };
    setAppliedFilters(newFilters);
    persist({ filters: serializeFilters(newFilters) });
  }

  function clearAllFilters() {
    setAppliedFilters({});
    persist({ filters: {} });
    setSearch("");
  }

  function handleHeaderClick(e: React.MouseEvent, colKey: string) {
    e.stopPropagation();
    setSort((prev) => {
      let next: { col: string; dir: "asc" | "desc" } | undefined;
      if (prev?.col === colKey) {
        next = prev.dir === "asc" ? { col: colKey, dir: "desc" } : undefined;
      } else {
        next = { col: colKey, dir: "asc" };
      }
      persist({ sort: next });
      return next;
    });
  }

  // ── Drawer de info por linha ──────────────────────────────
  const [viewingItem, setViewingItem] = useState<T | null>(null);
  useEffect(() => {
    if (closeDrawerSignal === undefined) return;
    setViewingItem(null);
  }, [closeDrawerSignal]);

  // ── Expansão de linha: máquina de estados centralizada ────
  // `expandedRowId` controla de fora (Escolas, por ex.) qual linha deve
  // estar aberta; o hook cuida de nunca ter duas animações concorrentes e
  // de sempre tocar a saída antes de desmontar o conteúdo. Compartilhado
  // com CursosPageClient (Curso → Turma) para não duplicar a lógica.
  const {
    render: expandRender,
    handleAnimationEnd: handleExpandAnimationEnd,
  } = useSingleExpand<string>(expandedRowId);
  const expandedRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (expandRender?.phase !== "opening") return;
    const t = setTimeout(() => {
      const el = expandedRowRef.current;
      if (!el) return;
      // compensa a barra fixa do topo (topbar + breadcrumb) - senao a linha
      // clicada fica escondida atras dela e so o conteudo expandido aparece
      el.style.scrollMarginTop = `${STICKY_TOP_OFFSET + 8}px`;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 320);
    return () => clearTimeout(t);
  }, [expandRender?.id, expandRender?.phase]);

  // ── Estado das colunas (ordem + visibilidade) ─────────────
  const DEFAULT_COL_STATE: ColPref[] = columns.map((c) => ({
    key: c.key,
    on: c.defaultVisible !== false,
  }));

  // Remove entradas duplicadas por key, mantendo a primeira ocorrencia —
  // autocura preferencias ja corrompidas (salvas antes de um bug de reorder),
  // alem de proteger qualquer setColState futuro.
  const dedupeColState = (list: ColPref[]): ColPref[] => {
    const seen = new Set<string>();
    const out: ColPref[] = [];
    for (const c of list) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      out.push(c);
    }
    return out;
  };

  const [colState, setColState] = useState<ColPref[]>(() => {
    if (initialPrefs?.cols) {
      const savedKeys = new Set(initialPrefs.cols.map((c) => c.key));
      const missing = DEFAULT_COL_STATE.filter((c) => !savedKeys.has(c.key));
      return dedupeColState([...initialPrefs.cols, ...missing]);
    }
    return dedupeColState(DEFAULT_COL_STATE);
  });

  const ALL_COL_KEYS = new Set(columns.map((c) => c.key));

  // Modal de colunas
  const [colModalOpen, setColModalOpen] = useState(false);

  function handleToggle(key: string) {
    const newState = dedupeColState(
      colState.map((c) => (c.key === key ? { ...c, on: !c.on } : c)),
    );
    colOrderRef.current = newState
      .filter((c) => c.on && ALL_COL_KEYS.has(c.key))
      .map((c) => c.key);
    setColState(newState);
    persist({ cols: newState });
  }

  function handlePanelReorder(fromKey: string, toKey: string) {
    const visible = colState.filter((c) => c.on);
    const hidden = colState.filter((c) => !c.on);
    const fromIdx = visible.findIndex((c) => c.key === fromKey);
    const toIdx = visible.findIndex((c) => c.key === toKey);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const newVisible = [...visible];
    const [moved] = newVisible.splice(fromIdx, 1);
    newVisible.splice(toIdx, 0, moved);
    const newState = dedupeColState([...newVisible, ...hidden]);
    colOrderRef.current = newState.filter((c) => c.on).map((c) => c.key);
    setColState(newState);
    persist({ cols: newState });
  }
  const visibleKeys = colState
    .filter((c) => c.on && ALL_COL_KEYS.has(c.key))
    .map((c) => c.key);
  const orderedCols = visibleKeys
    .map((k) => columns.find((c) => c.key === k)!)
    .filter(Boolean);

  const colOrderRef = useRef<string[]>(visibleKeys);
  useEffect(() => {
    colOrderRef.current = colState
      .filter((c) => c.on && ALL_COL_KEYS.has(c.key))
      .map((c) => c.key);
  }, [colState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Larguras das colunas (lazy init pra evitar flash) ─────
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const defaults = Object.fromEntries(
      columns.map((c) => [c.key, c.width ?? 150]),
    );
    return initialPrefs?.widths
      ? { ...defaults, ...initialPrefs.widths }
      : defaults;
  });

  const colWidthsRef = useRef<Record<string, number>>(colWidths);
  useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);

  // Refs pra dividers verticais e Ações sticky
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const acoesThRef = useRef<HTMLTableCellElement>(null);
  const [barLefts, setBarLefts] = useState<Record<string, number>>({});
  const [resizeHoverCol, setResizeHoverCol] = useState<string | null>(null);

  const updateBarLefts = useCallback(() => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) return;
    const wRect = wrapper.getBoundingClientRect();
    const lefts: Record<string, number> = {};
    colOrderRef.current.forEach((key) => {
      const th = thRefs.current[key];
      if (th) lefts[key] = th.getBoundingClientRect().right - wRect.left;
    });
    setBarLefts(lefts);
  }, []);

  useLayoutEffect(() => {
    updateBarLefts();
  }, [colWidths, colState, updateBarLefts]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateBarLefts, { passive: true });
    return () => el.removeEventListener("scroll", updateBarLefts);
  }, [updateBarLefts]);

  useEffect(() => {
    if (!openFilterCol) return;

    function repositionDropdown() {
      const th = thRefs.current[openFilterCol!];
      const card = tableCardRef.current;
      if (!th || !card) return;
      const thRect = th.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const dropdownWidth = 220;
      const top = thRect.bottom - cardRect.top;
      let left = thRect.right - cardRect.left - dropdownWidth;
      left = Math.min(left, cardRect.width - dropdownWidth);
      left = Math.max(0, left);
      setDropdownPos({ top, left });
    }

    function getScrollParent(node: HTMLElement | null): HTMLElement | null {
      if (!node) return null;
      const { overflow, overflowY } = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(overflow + overflowY)) return node;
      return getScrollParent(node.parentElement);
    }

    const scrollEl = getScrollParent(tableCardRef.current);
    if (!scrollEl) return;

    scrollEl.addEventListener("scroll", repositionDropdown, { passive: true });
    return () => scrollEl.removeEventListener("scroll", repositionDropdown);
  }, [openFilterCol]);

  useEffect(() => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(updateBarLefts);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [updateBarLefts]);

  // ── Sticky header via DOM direto (sem re-render) ──────────
  useEffect(() => {
    function getScrollParent(node: HTMLElement | null): HTMLElement | null {
      if (!node) return null;
      const { overflow, overflowY } = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(overflow + overflowY)) return node;
      return getScrollParent(node.parentElement);
    }
    const scrollEl = getScrollParent(tableCardRef.current);
    if (!scrollEl) return;
    const topBarHeight = STICKY_TOP_OFFSET;
    let ticking = false;
    function update() {
      const card = tableCardRef.current;
      const thead = theadRef.current;
      if (!card || !thead) return;
      const rect = card.getBoundingClientRect();
      const bottom = rect.bottom - thead.offsetHeight;
      if (rect.top < topBarHeight && bottom > topBarHeight) {
        const offset = topBarHeight - rect.top;
        thead.style.transform = `translateY(${offset}px)`;
        const isDark = document.documentElement.classList.contains("dark");
        const bg = isDark ? "#171E2C" : "#f7f7f5";
        thead.style.boxShadow = `0 -20px 0 0 ${bg}, 0 2px 8px rgba(0,0,0,0.15)`;
        // Force solid background on Ações th via inline style — bypasses
        // compositor layer issues that can make the CSS class bg invisible
        if (acoesThRef.current) {
          acoesThRef.current.style.backgroundColor = bg;
        }
      } else {
        thead.style.transform = "";
        thead.style.boxShadow = "";
        if (acoesThRef.current) {
          acoesThRef.current.style.backgroundColor = "";
        }
      }
      ticking = false;
    }
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, []);

  // ── Fake scrollbar horizontal fixa ────────────────────────
  // Sync bidirecional: tableRef ↔ fakeScrollRef
  useEffect(() => {
    const wrapper = tableRef.current;
    const fake = fakeScrollRef.current;
    if (!wrapper || !fake) return;
    let syncing = false;
    function syncFromWrapper() {
      if (syncing) return;
      syncing = true;
      fake!.scrollLeft = wrapper!.scrollLeft;
      syncing = false;
    }
    function syncFromFake() {
      if (syncing) return;
      syncing = true;
      wrapper!.scrollLeft = fake!.scrollLeft;
      syncing = false;
    }
    wrapper.addEventListener("scroll", syncFromWrapper, { passive: true });
    fake.addEventListener("scroll", syncFromFake, { passive: true });
    return () => {
      wrapper.removeEventListener("scroll", syncFromWrapper);
      fake.removeEventListener("scroll", syncFromFake);
    };
  }, [mounted]);

  // Largura interna + visibilidade + posição — função unificada, sem rAF
  useEffect(() => {
    const wrapper = tableRef.current;
    const fake    = fakeScrollRef.current;
    const inner   = fakeInnerRef.current;
    if (!wrapper || !fake || !inner) return;

    // Encontra o container que realmente scrolla verticalmente
    // Começa do parentElement para não matchear o próprio wrapper (overflow-x: auto)
    function getScrollParent(node: HTMLElement | null): HTMLElement | null {
      if (!node) return null;
      const { overflow, overflowY } = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(overflow + overflowY)) return node;
      return getScrollParent(node.parentElement);
    }
    const scrollEl = getScrollParent(wrapper.parentElement) ?? window;

    function update() {
      // Sem scroll horizontal → esconde tudo, mostra real
      if (wrapper!.scrollWidth <= wrapper!.clientWidth) {
        fake!.style.display = "none";
        wrapper!.classList.remove("hide-scrollbar");
        return;
      }
      // Atualiza largura interna antes de verificar visibilidade
      inner!.style.width = wrapper!.scrollWidth + "px";

      const rect = wrapper!.getBoundingClientRect();
      const realVisible = rect.bottom <= window.innerHeight;

      if (realVisible) {
        // Scrollbar real dentro do viewport → mostra real, esconde fake
        fake!.style.display = "none";
        wrapper!.classList.remove("hide-scrollbar");
      } else {
        // Scrollbar real fora do viewport → mostra fake, esconde real
        fake!.style.display = "block";
        wrapper!.classList.add("hide-scrollbar");
        fake!.style.left  = rect.left + "px";
        fake!.style.width = rect.width + "px";
      }
    }

    // scrollEl = admin-page-content (overflow-y: auto) — quem realmente scrolla
    scrollEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });

    const ro = new ResizeObserver(update);
    ro.observe(wrapper);
    const table = wrapper.querySelector("table");
    if (table) ro.observe(table);

    update();

    return () => {
      scrollEl.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
      wrapper.classList.remove("hide-scrollbar");
    };
  }, [mounted]);

  // ── Thumb visual custom do fake scrollbar ─────────────────
  useEffect(() => {
    const fake  = fakeScrollRef.current;
    const thumb = fakeThumbRef.current;
    if (!fake || !thumb) return;

    let isDragging      = false;
    let dragStartX      = 0;
    let dragStartScroll = 0;
    let hovered         = false;

    function getMetrics() {
      const { scrollLeft, scrollWidth, clientWidth } = fake!;
      const thumbW  = Math.max(48, (clientWidth / scrollWidth) * clientWidth);
      const maxLeft = clientWidth - thumbW;
      const thumbLeft = scrollWidth > clientWidth
        ? (scrollLeft / (scrollWidth - clientWidth)) * maxLeft
        : 0;
      return { thumbW, thumbLeft, scrollWidth, clientWidth };
    }

    function updateThumb() {
      // Segue a visibilidade do container (gerenciada pelo useEffect principal)
      if (fake!.style.display === "none") {
        thumb!.style.display = "none";
        return;
      }
      const { scrollWidth, clientWidth, thumbW, thumbLeft } = getMetrics();
      if (scrollWidth <= clientWidth) { thumb!.style.display = "none"; return; }
      const rect = fake!.getBoundingClientRect();
      thumb!.style.display = "block";
      thumb!.style.width   = thumbW + "px";
      thumb!.style.left    = (rect.left + thumbLeft) + "px";
    }

    function applyHover(on: boolean) {
      hovered = on;
      if (isDragging) return;
      thumb!.style.height = on ? "12px" : "5px";
      thumb!.style.bottom = on ? "4px"  : "7.5px";
    }

    // Drag no thumb
    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      e.stopPropagation();
      isDragging      = true;
      dragStartX      = e.clientX;
      dragStartScroll = fake!.scrollLeft;
      thumb!.style.backgroundColor = "#2F56C4";
      thumb!.style.height = "12px";
      thumb!.style.bottom = "4px";
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!isDragging) return;
      const { scrollWidth, clientWidth, thumbW } = getMetrics();
      const maxLeft     = clientWidth - thumbW;
      const scrollRange = scrollWidth - clientWidth;
      const dx          = e.clientX - dragStartX;
      fake!.scrollLeft  = Math.max(0, Math.min(scrollRange,
        dragStartScroll + (dx / maxLeft) * scrollRange));
    }
    function onPointerUp() {
      if (!isDragging) return;
      isDragging = false;
      thumb!.style.backgroundColor = "#3E6FE0";
      applyHover(hovered);
    }

    // Clique na trilha (não no thumb)
    function onTrackClick(e: MouseEvent) {
      if (e.target === thumb) return;
      const rect  = fake!.getBoundingClientRect();
      const { scrollWidth, clientWidth, thumbW } = getMetrics();
      const clickX  = e.clientX - rect.left;
      const maxLeft = clientWidth - thumbW;
      const left    = Math.max(0, Math.min(maxLeft, clickX - thumbW / 2));
      fake!.scrollLeft = (left / maxLeft) * (scrollWidth - clientWidth);
    }

    // Hover: fake e thumb são irmãos — tratar como uma área unificada
    function onEnter() { applyHover(true); }
    function onLeave(e: MouseEvent) {
      const to = e.relatedTarget as Node | null;
      if (to && (fake!.contains(to) || thumb === to || thumb!.contains(to))) return;
      applyHover(false);
    }

    // MutationObserver: sincroniza display do thumb com o container
    const mo = new MutationObserver(updateThumb);
    mo.observe(fake, { attributes: true, attributeFilter: ["style"] });

    thumb.addEventListener("pointerdown",  onPointerDown);
    thumb.addEventListener("pointermove",  onPointerMove);
    thumb.addEventListener("pointerup",    onPointerUp);
    thumb.addEventListener("pointercancel",onPointerUp);
    fake.addEventListener ("scroll",       updateThumb, { passive: true });
    fake.addEventListener ("click",        onTrackClick);
    fake.addEventListener ("mouseenter",   onEnter);
    fake.addEventListener ("mouseleave",   onLeave);
    thumb.addEventListener("mouseenter",   onEnter);
    thumb.addEventListener("mouseleave",   onLeave);

    const ro = new ResizeObserver(updateThumb);
    ro.observe(fake);
    updateThumb();

    return () => {
      thumb.removeEventListener("pointerdown",  onPointerDown);
      thumb.removeEventListener("pointermove",  onPointerMove);
      thumb.removeEventListener("pointerup",    onPointerUp);
      thumb.removeEventListener("pointercancel",onPointerUp);
      fake.removeEventListener ("scroll",       updateThumb);
      fake.removeEventListener ("click",        onTrackClick);
      fake.removeEventListener ("mouseenter",   onEnter);
      fake.removeEventListener ("mouseleave",   onLeave);
      thumb.removeEventListener("mouseenter",   onEnter);
      thumb.removeEventListener("mouseleave",   onLeave);
      mo.disconnect();
      ro.disconnect();
    };
  }, [mounted]);

  // ── Medição automática quando não há widths salvos ────────
  const [measured, setMeasured] = useState(!!initialPrefs?.widths);
  const tableRef = useRef<HTMLDivElement>(null);

  const measureText = useCallback((text: string, isHeader = false) => {
    const el = document.createElement("span");
    el.style.cssText =
      "visibility:hidden;position:absolute;whiteSpace:nowrap;fontSize:13px;fontFamily:inherit;";
    if (isHeader)
      el.style.cssText +=
        "fontSize:11px;fontWeight:500;letterSpacing:0.05em;";
    el.textContent = text;
    document.body.appendChild(el);
    const w = el.getBoundingClientRect().width;
    document.body.removeChild(el);
    return w;
  }, []);

  // Extrai texto pesquisável de uma célula
  const getCellText = useCallback(
    (col: (typeof columns)[number], item: T): string => {
      if (col.getText) return col.getText(item);
      if (col.render) {
        const rendered = col.render(item);
        if (typeof rendered === "string") return rendered;
        if (typeof rendered === "number") return String(rendered);
      }
      return "";
    },
    [columns],
  );

  useLayoutEffect(() => {
    if (measured || items.length === 0) return;
    const PAD = 48;
    const widths: Record<string, number> = {};
    columns.forEach((col) => {
      let max = measureText(col.label.toUpperCase(), true) + PAD;
      items.forEach((item) => {
        const text = col.getText
          ? col.getText(item)
          : col.render
            ? String(col.render(item) ?? "")
            : "—";
        const w = measureText(text, false) + PAD;
        if (w > max) max = w;
      });
      widths[col.key] = Math.max(Math.ceil(max), col.minWidth ?? 50);
    });
    setColWidths(
      initialPrefs?.widths ? { ...widths, ...initialPrefs.widths } : widths,
    );
    setMeasured(true);
  }, [items, columns, measured, measureText, initialPrefs?.widths]);

  // ── Drag-and-drop de colunas ──────────────────────────────
  const [ghostCol, setGhostCol] = useState<string | null>(null);
  const [ghostFixedX, setGhostFixedX] = useState(0);
  const [ghostFixedY, setGhostFixedY] = useState(0);
  const [ghostWidth, setGhostWidth] = useState(0);
  const [ghostHeight, setGhostHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const lastPositions = useRef<Record<string, number>>({});
  const prefsToSaveRef = useRef<ColPref[] | null>(null);

  const onColMouseDown = (e: React.MouseEvent, key: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const thEl = (e.currentTarget as HTMLElement).closest(
      "th[data-col]",
    ) as HTMLElement | null;
    if (!thEl) return;
    const outerEl = tableRef.current;
    if (!outerEl) return;
    const thRect = thEl.getBoundingClientRect();
    const tableRect = outerEl.getBoundingClientRect();
    const colW = thRect.width;
    const startMouseX = e.clientX;
    const startLeft = thRect.left;

    let started = false;
    let lastTarget: string | null = null;
    let prevMouseX = e.clientX;

    // Largura fixa pro ghost, igual em qualquer tabela/coluna (nao usa a largura
    // real da coluna — colunas como "email" podem ser bem mais largas que outras
    // e isso fazia o ghost variar de tamanho entre telas).
    const GHOST_W = 180;
    // Offset do clique dentro do ghost, clampado pra caber na largura fixa —
    // garante que o ghost nasce e segue sob o cursor, nao sob a borda esquerda
    // da coluna original (que pode estar bem longe do cursor em colunas largas).
    const grabOffset = Math.min(
      Math.max(startMouseX - startLeft, 12),
      GHOST_W - 12,
    );

    const startGhost = () => {
      started = true;
      setResizeHoverCol(null);
      setGhostCol(key);
      setGhostWidth(GHOST_W);
      setGhostFixedX(startMouseX - grabOffset);
      const clippedTop = Math.max(tableRect.top, STICKY_TOP_OFFSET);
      const clippedDelta = clippedTop - tableRect.top;
      setGhostFixedY(clippedTop);
      setGhostHeight(tableRect.height - clippedDelta);
      setIsDragging(true);
    };

    const onMove = (ev: MouseEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - startMouseX) < 4) return;
        startGhost();
      }
      const currentX = ev.clientX - grabOffset;
      setGhostFixedX(currentX);
      const movingRight = ev.clientX > prevMouseX;
      const movingLeft = ev.clientX < prevMouseX;
      prevMouseX = ev.clientX;
      const ghostLeadingEdge = movingRight ? currentX + GHOST_W : currentX;
      const ths = Array.from(
        tableRef.current?.querySelectorAll("th[data-col]") ?? [],
      ) as HTMLElement[];
      let targetKey: string | null = null;
      ths.forEach((th) => {
        if (th.dataset.col === key) return;
        const r = th.getBoundingClientRect();
        const dragIdx = colOrderRef.current.indexOf(key);
        const targetIdx = colOrderRef.current.indexOf(th.dataset.col ?? "");
        if (
          movingRight &&
          targetIdx > dragIdx &&
          ghostLeadingEdge >= r.left + 20
        )
          targetKey = th.dataset.col ?? null;
        if (
          movingLeft &&
          targetIdx < dragIdx &&
          ghostLeadingEdge <= r.right - 20
        )
          targetKey = th.dataset.col ?? null;
      });
      if (targetKey !== null && targetKey !== lastTarget) {
        lastTarget = targetKey;
        const positions: Record<string, number> = {};
        tableRef.current
          ?.querySelectorAll("th[data-col]")
          .forEach((t: Element) => {
            const el = t as HTMLElement;
            positions[el.dataset.col ?? ""] = el.getBoundingClientRect().left;
          });
        lastPositions.current = positions;
        setColState((prev) => {
          const visible = prev.filter((c) => c.on);
          const hidden = prev.filter((c) => !c.on);
          const fromIdx = visible.findIndex((c) => c.key === key);
          const toIdx = visible.findIndex((c) => c.key === targetKey);
          const newVisible = [...visible];
          const [moved] = newVisible.splice(fromIdx, 1);
          newVisible.splice(toIdx, 0, moved);
          const newState = dedupeColState([...newVisible, ...hidden]);
          colOrderRef.current = newState.filter((c) => c.on).map((c) => c.key);
          prefsToSaveRef.current = newState;
          return newState;
        });
      } else if (targetKey === null) {
        lastTarget = null;
      }
    };

    const onUp = () => {
      if (started) {
        setGhostCol(null);
        setGhostFixedX(0);
        setGhostFixedY(0);
        setGhostHeight(0);
        setGhostWidth(0);
        setIsDragging(false);
        if (prefsToSaveRef.current) {
          persist({ cols: prefsToSaveRef.current });
          prefsToSaveRef.current = null;
        }
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    const cleanup = () => {
      setGhostCol(null);
      setGhostFixedX(0);
      setGhostFixedY(0);
    };
    window.addEventListener("mouseup", cleanup);
    return () => window.removeEventListener("mouseup", cleanup);
  }, []);

  useEffect(() => {
    if (!tableRef.current) return;
    const allCells: HTMLElement[] = [];
    const rafIds: number[] = [];
    tableRef.current.querySelectorAll("th[data-col]").forEach((t: Element) => {
      const th = t as HTMLElement;
      const k = th.dataset.col as string;
      if (k === ghostCol) return;
      const oldX = lastPositions.current[k];
      if (oldX === undefined) return;
      const newX = th.getBoundingClientRect().left;
      const delta = oldX - newX;
      if (Math.abs(delta) < 2) return;
      const cells = tableRef.current!.querySelectorAll(`[data-col="${k}"]`);
      cells.forEach((el: Element) => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.transition = "none";
        htmlEl.style.transform = `translateX(${delta}px)`;
        allCells.push(htmlEl);
      });
      const rafId = requestAnimationFrame(() => {
        cells.forEach((el: Element) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.transition = "transform 0.18s cubic-bezier(.4,0,.2,1)";
          htmlEl.style.transform = "translateX(0)";
        });
      });
      rafIds.push(rafId);
    });
    const cleanup = setTimeout(() => {
      allCells.forEach((el) => {
        el.style.transition = "";
        el.style.transform = "";
      });
      setRenderTick((t) => t + 1);
    }, 220);
    return () => {
      rafIds.forEach((id) => cancelAnimationFrame(id));
      clearTimeout(cleanup);
    };
  }, [colState]); // eslint-disable-line react-hooks/exhaustive-deps

  void renderTick;

  // ── Handler de resize ─────────────────────────────────────
  const resizing = useRef<{
    key: string;
    startX: number;
    startW: number;
  } | null>(null);

  const onResizeStart = useCallback(
    (e: React.MouseEvent, key: string) => {
      e.preventDefault();
      e.stopPropagation();
      resizing.current = { key, startX: e.clientX, startW: colWidths[key] };
      const onMove = (ev: MouseEvent) => {
        const r = resizing.current;
        if (!r) return;
        setColWidths((prev) => ({
          ...prev,
          [r.key]: Math.max(30, r.startW + ev.clientX - r.startX),
        }));
      };
      const onUp = () => {
        resizing.current = null;
        setResizeHoverCol(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        persist({ widths: colWidthsRef.current });
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [colWidths, persist],
  );

  // ── Construção de rows (com hierarquia opcional) ─────────
  // Sem buildTree: lista plana.
  // Com buildTree: hierarquia, ignorada quando busca/filtros ativos.

  // ── Filtragem: filtros aplicados + busca ─────────────────
  const filteredItems = items.filter((item) => {
    for (const [colKey, valSet] of Object.entries(appliedFilters)) {
      if (valSet.size === 0) continue;
      const col = columns.find((c) => c.key === colKey);
      const v = col ? getFilterValue(col, item) : "";
      if (!valSet.has(v)) return false;
    }
    if (isSearching) {
      const q = norm(search);
      return columns.some((col) => {
        const text = norm(getCellText(col, item));
        if (text.includes(q) || strip(text).includes(strip(q))) return true;
        if (col.filterValueLabels && !col.searchByTextOnly) {
          const rawValue = (item as Record<string, unknown>)[col.key];
          if (typeof rawValue === "string") {
            const translated = col.filterValueLabels[rawValue];
            if (translated && norm(translated).includes(q)) return true;
          }
        }
        return false;
      });
    }
    return true;
  });

  // ── Sort por coluna (aplicado APÓS filtros) ───────────────
  const sortedItems = (() => {
    if (!sort) return filteredItems;
    const sortCol = columns.find((c) => c.key === sort.col);
    if (!sortCol || sortCol.sortable === false || !sortCol.getText)
      return filteredItems;
    const collator = new Intl.Collator("pt-BR", {
      sensitivity: "base",
      numeric: true,
    });
    const copy = [...filteredItems].sort((a, b) =>
      collator.compare(sortCol.getText!(a), sortCol.getText!(b)),
    );
    return sort.dir === "desc" ? copy.reverse() : copy;
  })();

  // Determina as linhas finais (com ou sem hierarquia)
  // sort ativo → usa flat (igual à busca/filtros): hierarquia pode misturar — esperado
  const rows: RowMeta<T>[] =
    buildTree && !isSearching && !isFiltering && !sort
      ? buildTree(items).filter((r) =>
          Object.entries(appliedFilters).every(([colKey, valSet]) => {
            if (valSet.size === 0) return true;
            const col = columns.find((c) => c.key === colKey);
            const v = col ? getFilterValue(col, r.item) : "";
            return valSet.has(v);
          }),
        )
      : sortedItems.map((item) => ({ item, depth: 0 }));

  const importButton = onImport ? (
    <Button type="button" variant="secondary" onClick={onImport}>
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
      Importar
    </Button>
  ) : null;

  // ── Render: empty state da lista inteira ──────────────────
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
          <Button type="button" variant="accent-blue" size="sm" className="px-4" onClick={onNew}>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            {newLabel}
          </Button>
          {importButton}
          </div>
          {extraActions}
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
          {emptyIcon && (
            <div className="mb-3 text-[#5cb88a]">
              {emptyIcon}
            </div>
          )}
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {emptyMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: botão Novo + busca + botão Colunas */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
        <Button type="button" variant="accent-blue" size="sm" className="px-4" onClick={onNew}>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          {newLabel}
        </Button>
        {importButton}
        </div>
        {extraActions}
        <div className="flex items-center gap-1">
          {/* Campo de busca */}
          <div className="relative w-full sm:w-64">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              placeholder="Buscar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#5cb88a] focus:outline-none focus:ring-2 focus:ring-[#5cb88a]/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#5cb88a]"
            />
          </div>
          <Tooltip text="Colunas">
            <button
              type="button"
              onClick={() => setColModalOpen(true)}
              className={[
                "flex h-9 w-9 items-center justify-center rounded-lg transition-colors -mr-[10px]",
                colModalOpen
                  ? "text-[#5cb88a]"
                  : "text-gray-400 hover:text-[#5cb88a]",
              ].join(" ")}
              aria-label={tt("columns")}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Chips de filtros ativos */}
      {totalAppliedFilters > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">Filtros ativos:</span>
          {Object.entries(appliedFilters).flatMap(([colKey, valSet]) =>
            Array.from(valSet).map((val) => {
              const col = columns.find((c) => c.key === colKey);
              const label = col?.filterValueLabels?.[val] ?? val;
              const colLabel = col?.label ?? colKey;
              return (
                <span
                  key={`${colKey}-${val}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#5cb88a]/30 bg-[#5cb88a]/10 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-[#0F6E56]"
                >
                  {colLabel}: {label}
                  <button
                    type="button"
                    onClick={() => removeAppliedFilterValue(colKey, val)}
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#5cb88a]/20 text-[#0F6E56] hover:bg-[#5cb88a]/40"
                  >
                    <svg
                      className="h-2 w-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </span>
              );
            }),
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-[13px] font-medium text-[#5cb88a] dark:text-[#5cb88a] hover:underline dark:hover:text-[#5cb88a]"
          >
            limpar tudo
          </button>
        </div>
      )}

      {/* Modal de colunas */}
      <ColumnsModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={columns}
        colState={colState}
        onToggle={handleToggle}
        onReorder={handlePanelReorder}
      />

      {/* Tabela */}
      <div
        ref={tableCardRef}
        className="relative rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
      >
        <div ref={tableRef} className="relative overflow-x-auto">
          <div ref={tableWrapperRef} style={{ position: "relative" }}>
            <table
              className={`w-full ${bodyTextClassName}`}
              style={{ tableLayout: measured ? "fixed" : "auto" }}
            >
              <colgroup>
                {orderedCols.map((col) => (
                  <col key={col.key} style={{ width: colWidths[col.key] }} />
                ))}
                {/* Spacer obrigatório: absorve espaço extra em table-layout:fixed */}
                <col />
                {/* Ações: 104px fixo (editar + excluir) */}
                <col style={{ width: "104px" }} />
              </colgroup>
              <thead
                ref={theadRef}
                className="relative z-40 bg-[#f7f7f5] dark:bg-[#171E2C]"
              >
                <tr>
                  {orderedCols.map((col, i) => {
                    const isFiltered = (appliedFilters[col.key]?.size ?? 0) > 0;
                    const isOpen = openFilterCol === col.key;
                    const isSortable =
                      col.sortable !== false && col.getText !== undefined;
                    const isActiveSortCol = sort?.col === col.key;
                    const sortDir = isActiveSortCol ? sort!.dir : undefined;
                    return (
                      <th
                        key={col.key}
                        data-col={col.key}
                        ref={(el) => {
                          thRefs.current[col.key] = el;
                        }}
                        className={[
                          "relative px-4 py-3 text-left text-xs tracking-wider bg-[#f7f7f5] dark:bg-[#171E2C] group",
                          isActiveSortCol
                            ? "font-bold text-[#5cb88a]"
                            : "font-medium text-gray-500 dark:text-gray-400",
                        ].join(" ")}
                        style={{
                          visibility:
                            ghostCol === col.key ? "hidden" : "visible",
                          borderLeft:
                            orderedCols[i - 1]?.key === ghostCol
                              ? "none"
                              : undefined,
                          background: isFiltered
                            ? "rgba(92,184,138,0.06)"
                            : resizeHoverCol === col.key ||
                                (ghostCol !== null && ghostCol !== col.key)
                              ? "rgba(29,158,117,0.1)"
                              : undefined,
                        }}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Drag handle */}
                          <span
                            onMouseDown={(e) => onColMouseDown(e, col.key)}
                            className="inline-flex items-center justify-center p-1 -m-1 cursor-grab active:cursor-grabbing shrink-0"
                            aria-label={tt("dragColumn")}
                          >
                            <svg
                              className="h-3 w-3 text-gray-500 dark:text-gray-400 opacity-40 group-hover:opacity-100 group-hover:text-[#5cb88a] transition-[opacity,color]"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <circle cx="9" cy="6" r="1.5" />
                              <circle cx="15" cy="6" r="1.5" />
                              <circle cx="9" cy="12" r="1.5" />
                              <circle cx="15" cy="12" r="1.5" />
                              <circle cx="9" cy="18" r="1.5" />
                              <circle cx="15" cy="18" r="1.5" />
                            </svg>
                          </span>
                          {/* Label + sort chevron */}
                          {isSortable ? (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => handleHeaderClick(e, col.key)}
                              className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer group/sort"
                            >
                              <Tooltip
                                text={col.label}
                                onlyWhenTruncated
                                side="top"
                                fullWidth
                              >
                                <span
                                  data-truncate
                                  className="block truncate min-w-0"
                                >
                                  {col.label}
                                </span>
                              </Tooltip>
                              <span className="inline-flex flex-col leading-[0.7] gap-[2px]">
                                <span
                                  className={`text-[8px] ${sort?.col === col.key && sort.dir === "asc" ? "text-[#5cb88a]" : "text-gray-300 dark:text-gray-600"}`}
                                >
                                  ▲
                                </span>
                                <span
                                  className={`text-[8px] ${sort?.col === col.key && sort.dir === "desc" ? "text-[#5cb88a]" : "text-gray-300 dark:text-gray-600"}`}
                                >
                                  ▼
                                </span>
                              </span>
                            </button>
                          ) : (
                            <Tooltip
                              text={col.label}
                              onlyWhenTruncated
                              side="top"
                              fullWidth
                            >
                              <span
                                data-truncate
                                className="block truncate min-w-0"
                              >
                                {col.label}
                              </span>
                            </Tooltip>
                          )}
                          {/* Ícone de filtro (funil) */}
                          {col.filterable && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => handleOpenFilter(col.key, e)}
                              className={[
                                "ml-auto shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-colors",
                                isFiltered || isOpen
                                  ? "text-[#5cb88a]"
                                  : "text-gray-300 hover:text-[#5cb88a] dark:text-gray-600 dark:hover:text-[#5cb88a]",
                              ].join(" ")}
                              aria-label={`Filtrar ${col.label}`}
                            >
                              <svg
                                className="h-3 w-3"
                                fill={isFiltered ? "rgba(92,184,138,0.2)" : "none"}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591L15.75 12.75V19.5a.75.75 0 0 1-.44.693l-3 1.5a.75.75 0 0 1-1.06-.693v-5.443L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z"
                                />
                              </svg>
                            </button>
                          )}
                        </div>
                        {/* Resize handle */}
                        <div
                          onMouseDown={(e) => onResizeStart(e, col.key)}
                          onMouseEnter={() => {
                            if (!ghostCol) setResizeHoverCol(col.key);
                          }}
                          onMouseLeave={() => {
                            if (!resizing.current) setResizeHoverCol(null);
                          }}
                          style={{
                            position: "absolute",
                            right: "-10px",
                            top: 0,
                            height: "100%",
                            width: "20px",
                            cursor: "col-resize",
                            zIndex: 20,
                          }}
                        />
                        {/* Divider interno de coluna */}
                        {!ghostCol && (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "15%",
                              height: "70%",
                              width: 1,
                              background: "rgba(128,128,128,0.4)",
                              pointerEvents: "none",
                              zIndex: 1,
                            }}
                          />
                        )}
                      </th>
                    );
                  })}
                  {/* Spacer obrigatório */}
                  <th
                    aria-hidden
                    className="bg-[#f7f7f5] dark:bg-[#171E2C]"
                    style={{ padding: 0, border: 0 }}
                  />
                  {/* th Ações sticky */}
                  <th
                    ref={acoesThRef}
                    className="relative px-4 py-3 text-center text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 sticky right-0 !bg-[#f7f7f5] dark:!bg-[#171E2C] z-[60]"
                    style={{
                      boxShadow: "inset 1px 0 0 rgba(128,128,128,0.4)",
                    }}
                  >
                    <span className="inline-block -translate-x-[5px]">
                      {tCommon("actions")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800" style={{ position: "relative", zIndex: 1 }}>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={orderedCols.length + 2}
                      className="px-4 py-16 text-center"
                    >
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Nenhum registro encontrado
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map(({ item, depth }) => (
                    <>
                    <tr
                      key={item.id}
                      ref={expandRender?.id === item.id ? expandedRowRef : undefined}
                      className={[
                        "group transition-colors",
                        isDragging ? "" : "hover:bg-[rgba(92,184,138,0.08)]",
                      ].join(" ")}
                      style={{
                        opacity: (expandedRowId !== undefined ? expandedRowId === item.id : expandedRowId === item.id) ? 1 : isDimmedRow?.(item) ? 0.55 : 1,
                        transition: "opacity 150ms ease",
                      }}
                    >
                      {orderedCols.map((col, colIdx) => {
                        const isFirstCol = colIdx === 0;
                        const infoKey = infoColumnKey ?? orderedCols[0]?.key;
                        const isInfoCol = col.key === infoKey;
                        const drawerConfig =
                          isInfoCol && drawerForRow ? drawerForRow(item) : null;
                        const hasDrawer = isInfoCol && !!drawerConfig;
                        const highlighted = hasDrawer && hasHighlight ? hasHighlight(item) : false;
                        return (
                          <td
                            key={col.key}
                            data-col={col.key}
                            className="px-4 py-3 overflow-hidden text-gray-600 dark:text-gray-400"
                            style={{
                              maxWidth: colWidths[col.key],
                              visibility:
                                ghostCol === col.key ? "hidden" : "visible",
                              background:
                                resizeHoverCol === col.key ||
                                (ghostCol !== null && ghostCol !== col.key)
                                  ? "rgba(29,158,117,0.07)"
                                  : undefined,
                              paddingLeft: undefined,
                                borderBottom: rowBorderBottom?.(item) ? "2px solid #5cb88a" : undefined,
                            }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isInfoCol && rowIcon && rowIcon(item)}
                              {/* Botão "i" vinculado à coluna infoColumnKey (ou primeira coluna) */}
                              {isInfoCol && drawerForRow && (
                                <Tooltip
                                  text={
                                    highlighted ? tt("viewDetails") : tt("noInfo")
                                  }
                                  side="top"
                                >
                                  <button
                                    type="button"
                                                                        onClick={(e) => {
                                      e.stopPropagation();
                                      if (highlighted) setViewingItem(item);
                                    }}
                                    aria-label={
                                      highlighted
                                        ? tt("viewDetails")
                                        : tt("noInfo")
                                    }
                                    style={{
                                      fontFamily:
                                        "Georgia, 'Times New Roman', serif",
                                    }}
                                    className={[
                                      "shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-semibold leading-none transition-colors",
                                      highlighted
                                        ? "border border-[#5cb88a] bg-transparent text-[#5cb88a] hover:bg-[#5cb88a] hover:text-white cursor-pointer dark:border-[#5cb88a] dark:text-[#5cb88a] dark:hover:bg-[#5cb88a] dark:hover:text-white"
                                        : "border border-gray-300 bg-transparent text-gray-400 cursor-default dark:border-gray-700 dark:text-gray-500",
                                    ].join(" ")}
                                  >
                                    i
                                  </button>
                                </Tooltip>
                              )}
                              {!col.noTooltip ? (
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <Tooltip
                                    text={col.getText?.(item) ?? ""}
                                    onlyWhenTruncated
                                    side="top"
                                    fullWidth
                                  >
                                    <div
                                      data-truncate
                                      className="block truncate min-w-0"
                                    >
                                      {col.render
                                        ? col.render(item)
                                        : (col.getText?.(item) ?? "—")}
                                    </div>
                                  </Tooltip>
                                </div>
                              ) : (
                                <div className="block truncate flex-1 min-w-0">
                                  {col.render
                                    ? col.render(item)
                                    : (col.getText?.(item) ?? "—")}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      {/* Spacer */}
                      <td
  aria-hidden
  style={{
    padding: 0,
    border: 0,
    width: 0,
    minWidth: 0,
    maxWidth: 0,
    overflow: "hidden"
  }}
/>
                      {/* td Ações sticky */}
                      {/*
                        Cores sólidas pré-calculadas (não rgba translúcido).
                        A <tr> pinta bg-[rgba(92,184,138,X)] e as <td>s normais são
                        transparentes, então essa cor aparece só UMA vez (composta sobre
                        o fundo branco/gray-900 do container). Esta <td> é sticky e por
                        isso precisa de um fundo PRÓPRIO opaco (para cobrir colunas que
                        passam por baixo dela durante o scroll horizontal) — se esse
                        fundo próprio também fosse o mesmo rgba translúcido, o navegador
                        pintaria a mesma cor DUAS vezes empilhadas (uma da <tr>, outra da
                        <td>), dobrando a opacidade efetiva (0.15 → ~0.28) e criando a
                        faixa/banda visível só na coluna Ações. A correção é usar o
                        equivalente sólido já "achatado" dessa mesma cor, para que a
                        <td> pinte uma única camada opaca idêntica ao resultado visual
                        do resto da linha, sem re-compor alpha sobre alpha.
                      */}
                      <td
                          className="px-2 py-3 text-center sticky right-0 z-20 bg-white dark:bg-gray-900 group-hover:bg-[#f2f9f6] dark:group-hover:bg-[#17252f]"
                          style={rowBorderBottom?.(item) ? { borderBottom: "2px solid #5cb88a" } : undefined}
                        >
                        <div className="flex items-center justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => onEdit(item)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#5cb88a]/10 hover:text-[#5cb88a]"
                            aria-label={editLabel ?? tCommon("edit")}
                            title={editLabel ?? tCommon("edit")}
                          >
                            {editIcon ?? (
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                              />
                            </svg>
                            )}
                          </button>
                          {onDelete && (canDelete?.(item) ?? true) && (
                            <button
                              type="button"
                              onClick={() => onDelete(item)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                              aria-label={deleteLabel ?? tCommon("delete")}
                              title={deleteLabel ?? tCommon("delete")}
                            >
                              {deleteIcon ?? (
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
                                />
                              </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {renderExpanded && expandRender?.id === item.id && (
                      <tr>
                        <td colSpan={orderedCols.length + 2} className="p-2">
                          <ExpandAnimator
                            phase={expandRender.phase}
                            onDone={() => handleExpandAnimationEnd(item.id, expandRender.phase)}
                            className="overflow-hidden rounded-lg border border-[#5cb88a]/20 bg-[rgba(92,184,138,0.03)] px-6 py-4 dark:bg-[rgba(92,184,138,0.05)]"
                          >
                            {renderExpanded(item)}
                          </ExpandAnimator>
                        </td>
                      </tr>
                    )}
                    </>
                  ))
                )}
              </tbody>
            </table>

            {/* Dividers verticais: agora internos a cada <th> (ver divider interno acima) */}

            {/* Barra verde de hover no resize handle */}
            {!ghostCol &&
              resizeHoverCol &&
              (() => {
                const col = orderedCols.find((c) => c.key === resizeHoverCol);
                if (!col) return null;
                const left = barLefts[col.key];
                if (left === undefined) return null;
                const headerHeight =
                  theadRef.current?.getBoundingClientRect().height ?? 0;
                return (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left,
                        width: 6,
                        height: headerHeight,
                        background: "#86efac",
                        pointerEvents: "none",
                        zIndex: 46,
                        transform: "translateX(-3px)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: headerHeight,
                        left,
                        width: 1,
                        height: `calc(100% - ${headerHeight}px)`,
                        background: "var(--color-primary)",
                        pointerEvents: "none",
                        zIndex: 46,
                        transform: "translateX(-0.5px)",
                      }}
                    />
                  </>
                );
              })()}

            {/* Divider antes da coluna Ações */}
            {(() => {
              if (!acoesThRef.current) return null;
              const containerRect = acoesThRef.current
                .closest('[style*="position"]')
                ?.getBoundingClientRect();
              const acoesRect = acoesThRef.current.getBoundingClientRect();
              if (!containerRect) return null;
              const left = acoesRect.left - containerRect.left;
              const headerHeight =
                theadRef.current?.getBoundingClientRect().height ?? 0;
              return (
                <div
                  style={{
                    position: "absolute",
                    top: headerHeight * 0.15,
                    left,
                    width: 1,
                    height: headerHeight * 0.7,
                    background: "rgba(128,128,128,0.4)",
                    zIndex: 45,
                    pointerEvents: "none",
                  }}
                />
              );
            })()}

            {/* Ghost da coluna sendo arrastada (portal) */}
            {ghostCol &&
              typeof window !== "undefined" &&
              createPortal(
                <div
                  style={{
                    position: "fixed",
                    top: ghostFixedY,
                    left: ghostFixedX,
                    width: ghostWidth,
                    height: ghostHeight,
                    pointerEvents: "none",
                    zIndex: 9999,
                    background: "#eefcf6",
                    boxShadow: "0 4px 16px rgba(15,23,42,0.18)",
                    borderLeft: "2px solid rgba(29,158,117,0.5)",
                    borderRight: "2px solid rgba(29,158,117,0.5)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "9px 12px",
                      fontSize: 11,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "0.06em",
                      color: "#1D9E75",
                      background: "#d8f7e9",
                      borderBottom: "1px solid rgba(29,158,117,0.2)",
                    }}
                  >
                    {columns.find((c) => c.key === ghostCol)?.label}
                  </div>
                  {rows.map(({ item }, i) => {
                    const col = columns.find((c) => c.key === ghostCol);
                    const text = col?.getText
                      ? col.getText(item)
                      : col?.render
                        ? String(col.render(item) ?? "")
                        : "—";
                    return (
                      <div
                        key={i}
                        style={{
                          padding: "9px 12px",
                          fontSize: 13,
                          color: "#166a4c",
                          background: i % 2 === 0 ? "#eefcf6" : "#e4f9ef",
                          borderBottom: "0.5px solid rgba(29,158,117,0.15)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {text}
                      </div>
                    );
                  })}
                </div>,
                document.body,
              )}
          </div>
        </div>
        {/* Dropdown de filtro */}
        <FilterDropdown
          open={!!openFilterCol}
          position={dropdownPos}
          column={
            openFilterCol
              ? columns.find((c) => c.key === openFilterCol)!
              : columns[0]
          }
          options={openFilterCol ? getOptions(openFilterCol) : []}
          pendingSelection={
            openFilterCol
              ? (pendingFilters[openFilterCol] ?? new Set())
              : new Set()
          }
          onTogglePending={togglePendingFilter}
          onApply={applyFilter}
          onClear={clearPendingFilter}
          onClose={() => {
            setOpenFilterCol(null);
            setDropdownPos(null);
          }}
        />
      </div>

      <p className="px-1 text-xs text-gray-400">
        {rows.length} registro{rows.length !== 1 ? "s" : ""}
        {(isSearching || isFiltering) &&
          ` encontrado${rows.length !== 1 ? "s" : ""}`}
      </p>

      {/* Fake scrollbar horizontal fixa no rodapé do browser */}
      {mounted && createPortal(
        <>
          {/* Container scrollável — mantém sync e largura interna */}
          <div
            ref={fakeScrollRef}
            className="datatable-fake-scrollbar"
            style={{
              position: "fixed",
              bottom: 0,
              left: tableRef.current?.getBoundingClientRect().left ?? 0,
              width: tableRef.current?.clientWidth ?? "100%",
              overflowX: "auto",
              overflowY: "hidden",
              zIndex: 45,
              height: "20px",
              background: "rgba(0,0,0,0.06)",
              borderTop: "1px solid rgba(0,0,0,0.10)",
              backdropFilter: "blur(4px)",
              display: "none",
              cursor: "pointer",
            }}
          >
            <div ref={fakeInnerRef} style={{ height: "1px" }} />
          </div>
          {/* Thumb visual — irmão do container, position:fixed independente */}
          <div
            ref={fakeThumbRef}
            style={{
              position: "fixed",
              bottom: "7.5px",
              left: 0,
              height: "5px",
              width: "80px",
              borderRadius: "999px",
              backgroundColor: "#3E6FE0",
              cursor: "pointer",
              zIndex: 46,
              display: "none",
              pointerEvents: "auto",
              transition: "height 0.12s ease, bottom 0.12s ease, background-color 0.15s ease",
            }}
          />
        </>,
        document.body
      )}

      {/* Drawer de info por linha */}
      {drawerForRow &&
        (() => {
          const config = viewingItem ? drawerForRow(viewingItem) : null;
          return (
            <Drawer
              open={!!config}
              onClose={() => setViewingItem(null)}
              title={config?.title}
              subtitle={config?.subtitle}
            >
              {config?.content}
            </Drawer>
          );
        })()}
    </div>
  );
}
