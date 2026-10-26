"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { setOrcamentoAtual } from "@/lib/orcamentos/_actions";
import { ORCAMENTO_TIPOS, type ConjuntoEstrutura, type Orcamento, type OrcamentoTipo } from "@/lib/orcamentos/types";
import { OficialStar, StatusPill, TipoLabel } from "./OrcamentoMeta";
import { OrcamentoFormModal } from "./OrcamentoFormModal";
import { deleteOrcamento, duplicateOrcamento, reorderOrcamentos } from "./_actions";

interface OrcamentosClientProps {
  tenantId: string;
  isAdmin: boolean;
  orcamentos: Orcamento[];
  conjuntos: ConjuntoEstrutura[];
  packageCounts: Record<string, number>;
  currentId: string | null;
  title: string;
  subtitle: string;
}

function byOrder(a: Orcamento, b: Orcamento) {
  return a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
}

/** Onde o card arrastado vai cair: antes/depois do card `id`, ou no fim da coluna (id = null). */
interface DropTarget {
  year: number;
  id: string | null;
  side: "before" | "after";
}

export function OrcamentosClient({
  tenantId,
  isAdmin,
  orcamentos,
  conjuntos,
  packageCounts,
  currentId,
  title,
  subtitle,
}: OrcamentosClientProps) {
  const router = useRouter();
  const t = useTranslations("orcamentos");
  const tc = useTranslations("common");
  const [, startTransition] = useTransition();

  const [filter, setFilter] = useState<OrcamentoTipo | "all">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Orcamento | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orcamentos.forEach((o) => (c[o.tipo] = (c[o.tipo] ?? 0) + 1));
    return c;
  }, [orcamentos]);

  const currentYear = new Date().getFullYear();
  const columns = useMemo(() => {
    const years = new Set<number>(orcamentos.map((o) => o.year));
    years.add(currentYear);
    return Array.from(years)
      .sort((a, b) => a - b)
      .map((year) => ({
        year,
        items: orcamentos
          .filter((o) => o.year === year && (filter === "all" || o.tipo === filter))
          .sort(byOrder),
      }));
  }, [orcamentos, filter, currentYear]);

  function open(o: Orcamento, e: React.MouseEvent) {
    // Ctrl/Cmd/botão do meio: deixa o navegador abrir em nova aba (a página
    // do orçamento seleciona ele ao carregar).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    startTransition(async () => {
      if (currentId !== o.id) await setOrcamentoAtual(tenantId, o.id);
      router.push(`/admin/orcamentos/${o.id}`);
    });
  }

  async function handleDuplicate(o: Orcamento, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActionError(null);
    setBusyId(o.id);
    const result = await duplicateOrcamento({ id: o.id });
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  function cardDragOver(year: number, o: Orcamento, vertical: boolean, e: React.DragEvent) {
    if (!draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = vertical ? e.clientY < rect.top + rect.height / 2 : e.clientX < rect.left + rect.width / 2;
    setDrop((prev) =>
      prev && prev.year === year && prev.id === o.id && prev.side === (before ? "before" : "after")
        ? prev
        : { year, id: o.id, side: before ? "before" : "after" }
    );
  }

  async function handleDrop(year: number, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    const target = drop;
    setDrop(null);
    setDraggingId(null);
    const moved = orcamentos.find((o) => o.id === id);
    if (!moved) return;

    // Ordem completa do ano de destino (sem filtro), sem o card arrastado.
    const rest = orcamentos
      .filter((o) => o.year === year && o.id !== moved.id)
      .sort(byOrder)
      .map((o) => o.id);
    let index = rest.length;
    if (target && target.year === year && target.id) {
      const at = rest.indexOf(target.id);
      if (at >= 0) index = target.side === "before" ? at : at + 1;
    }
    const orderedIds = [...rest.slice(0, index), moved.id, ...rest.slice(index)];

    const current = orcamentos
      .filter((o) => o.year === year)
      .sort(byOrder)
      .map((o) => o.id);
    if (moved.year === year && current.join() === orderedIds.join()) return;

    setActionError(null);
    setBusyId(moved.id);
    const result = await reorderOrcamentos({ id: moved.id, year, orderedIds });
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deleteOrcamento({ id: deleting.id });
    setDeleteLoading(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <div className="admin-subheader">
        <div>
          <h1 className="admin-page-title">{title}</h1>
        </div>
        {isAdmin && (
          <div className="admin-page-actions">
            <Button size="sm" variant="accent-blue" className="px-3" onClick={() => setFormOpen(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              {t("new")}
            </Button>
          </div>
        )}
      </div>

      <div className="admin-content">
        <div className="orc-panel">
          <p className="orc-subtitle">{subtitle}</p>

          <div className="orc-chips">
            <button
              type="button"
              className={`orc-chip orc-chip-all${filter === "all" ? " is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              {t("filterAll")}
            </button>
            {ORCAMENTO_TIPOS.map((tipo) => (
              <button
                key={tipo}
                type="button"
                className={`orc-chip orc-tipo orc-tipo-${tipo}${filter === tipo ? " is-active" : ""}`}
                onClick={() => setFilter(filter === tipo ? "all" : tipo)}
              >
                {t(`tipo_${tipo}`)}
              </button>
            ))}
          </div>

          {actionError && <div className="orc-error">{actionError}</div>}

          <div className="orc-timeline">
            {columns.map(({ year, items }) => (
              <section
                key={year}
                className={`orc-year-col ${items.length > 2 ? "is-wide" : "is-narrow"}${year === currentYear ? " is-now" : ""}${drop?.year === year ? " is-drop" : ""}`}
                onDragOver={
                  isAdmin && draggingId
                    ? (e) => {
                        e.preventDefault();
                        setDrop((prev) => (prev && prev.year === year ? prev : { year, id: null, side: "after" }));
                      }
                    : undefined
                }
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
                }}
                onDrop={isAdmin ? (e) => handleDrop(year, e) : undefined}
              >
                <div className="orc-axis">
                  <div className="orc-axis-line">
                    <span className="orc-axis-dot" />
                    <span className="orc-axis-bar" />
                  </div>
                  <span className="orc-year-label">
                    {year}
                    {year === currentYear && <span className="orc-year-note">{t("yearCurrent")}</span>}
                  </span>
                </div>
                {items.length === 0 ? (
                  <div className="orc-year-empty">
                    <strong>{orcamentos.length === 0 ? t("empty") : t("noneInYear")}</strong>
                    {orcamentos.length > 0 && <span>{t("noneInYearHint", { year })}</span>}
                  </div>
                ) : (
                  <div className="orc-cards">
                    {items.map((o) => (
                      <a
                        key={o.id}
                        href={`/admin/orcamentos/${o.id}`}
                        className={`orc-card${o.id === currentId ? " is-current" : ""}${busyId === o.id ? " is-busy" : ""}${draggingId === o.id ? " is-dragging" : ""}${drop?.id === o.id && drop.year === year && draggingId !== o.id ? ` is-drop-${drop.side}` : ""}`}
                        onClick={(e) => open(o, e)}
                        draggable={isAdmin}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", o.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(o.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDrop(null);
                        }}
                        onDragOver={isAdmin ? (e) => cardDragOver(year, o, items.length <= 2, e) : undefined}
                      >
                        {isAdmin && (
                          <span className="orc-grip" title={t("dragHint")} aria-hidden="true">
                            <svg width="18" height="8" viewBox="0 0 18 8" fill="currentColor">
                              {[2, 6, 10, 14].flatMap((cx) => [
                                <circle key={`${cx}a`} cx={cx + 0.5} cy="1.5" r="1.2" />,
                                <circle key={`${cx}b`} cx={cx + 0.5} cy="6.5" r="1.2" />,
                              ])}
                            </svg>
                          </span>
                        )}
                        <div className="orc-card-top">
                          <h3 className="orc-card-title" title={o.label}>
                            {o.oficial && <OficialStar title={t("official")} />}
                            {o.label}
                          </h3>
                          <StatusPill status={o.status} label={t(`status_${o.status}`)} />
                        </div>
                        <div className="orc-card-tipo">
                          <TipoLabel tipo={o.tipo} label={t(`tipo_${o.tipo}`)} />
                        </div>
                        <div className="orc-card-foot">
                          <span>{t("packagesCount", { count: packageCounts[o.id] ?? 0 })}</span>
                          {isAdmin && (
                            <span className="orc-acts">
                              <button
                                type="button"
                                className="orc-act"
                                title={t("duplicate")}
                                aria-label={t("duplicate")}
                                disabled={busyId !== null}
                                onClick={(e) => handleDuplicate(o, e)}
                              >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="11" height="11" rx="2" />
                                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="orc-act orc-act--danger"
                                title={t("delete")}
                                aria-label={t("delete")}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDeleting(o);
                                }}
                              >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                                </svg>
                              </button>
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>

      {isAdmin && (
        <OrcamentoFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          conjuntos={conjuntos}
          editing={null}
          defaultYear={new Date().getFullYear()}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      )}

      {isAdmin && (
        <ConfirmModal
          open={deleting !== null}
          onClose={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          title={t("deleteConfirmTitle")}
          body={
            deleting &&
            t.rich("deleteConfirmBody", {
              label: deleting.label,
              b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
            })
          }
          cancelLabel={tc("cancel")}
          confirmLabel={tc("delete")}
          loading={deleteLoading}
          loadingText={tc("saving")}
          onConfirm={handleConfirmDelete}
          error={deleteError}
        />
      )}
    </>
  );
}
