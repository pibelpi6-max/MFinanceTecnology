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
import { deleteOrcamento, duplicateOrcamento } from "./_actions";

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

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    orcamentos.forEach((o) => (c[o.tipo] = (c[o.tipo] ?? 0) + 1));
    return c;
  }, [orcamentos]);

  const byYear = useMemo(() => {
    const visible = orcamentos.filter((o) => filter === "all" || o.tipo === filter);
    const groups: Record<number, Orcamento[]> = {};
    visible.forEach((o) => (groups[o.year] = [...(groups[o.year] ?? []), o]));
    return Object.keys(groups)
      .map(Number)
      .sort((a, b) => b - a)
      .map((year) => ({
        year,
        items: groups[year].sort((a, b) => Number(b.oficial) - Number(a.oficial) || a.created_at.localeCompare(b.created_at)),
      }));
  }, [orcamentos, filter]);

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

      <div className="admin-content admin-content--scroll">
        <p className="orc-subtitle">{subtitle}</p>

        <div className="orc-chips">
          <button type="button" className={`orc-chip${filter === "all" ? " is-active" : ""}`} onClick={() => setFilter("all")}>
            {t("filterAll")} <span className="orc-chip-count">{orcamentos.length}</span>
          </button>
          {ORCAMENTO_TIPOS.map((tipo) => (
            <button
              key={tipo}
              type="button"
              className={`orc-chip${filter === tipo ? " is-active" : ""}`}
              onClick={() => setFilter(tipo)}
            >
              {t(`tipo_${tipo}`)} <span className="orc-chip-count">{counts[tipo] ?? 0}</span>
            </button>
          ))}
        </div>

        {actionError && <div className="orc-error">{actionError}</div>}

        {byYear.length === 0 ? (
          <p className="orc-empty">{orcamentos.length === 0 ? t("empty") : t("emptyFiltered")}</p>
        ) : (
          byYear.map(({ year, items }) => (
            <section key={year} className="orc-year">
              <div className="orc-year-head">
                <span className="orc-year-label">{year}</span>
                <span className="orc-year-line" />
              </div>
              <div className="orc-grid">
                {items.map((o) => (
                  <a
                    key={o.id}
                    href={`/admin/orcamentos/${o.id}`}
                    className={`orc-card${o.id === currentId ? " is-current" : ""}${busyId === o.id ? " is-busy" : ""}`}
                    onClick={(e) => open(o, e)}
                  >
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
                    </div>
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path strokeLinecap="round" d="M5 15V6a2 2 0 0 1 2-2h9" />
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
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </section>
          ))
        )}
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
