"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type { ColumnMeta } from "@/components/ui/DataTable/types";
import { TreeExpand, TreeGuides } from "@/components/ui/tree";
import { useTreeExpand } from "@/hooks/useTreeExpand";
import { buildDimensionHierarchy, getVisibleRows } from "@/lib/dimensions/hierarchy";
import type { DimensionType, DimensionNodeRow } from "@/lib/dimensions/types";
import { isProtectedDimensionCode } from "@/lib/dimensions/constants";
import { DimensionTypeFormModal } from "./DimensionTypeFormModal";
import { NodeFormModal } from "./NodeFormModal";
import { deleteDimensionType, updateFiscalYearStartMonth } from "./_actions";
import { cancelDimensionNode } from "../dimensoes/_actions";

type Translator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Monta as colunas da lista de TIPOS de dimensão (Nome/Código/Descrição/
 * Utilizado em/Estrutura/Tipo) usadas pelo DataTable na tela de Parâmetros.
 * A árvore de ITENS de cada dimensão continua sendo uma árvore simples (ver
 * renderStructureContent, dentro do componente) igual ao desenho usado em
 * "plano de aulas" no app irmão — só a lista de tipos é que ganhou o
 * DataTable (busca + engrenagem de colunas). Ver claude/decisoes-arquitetura.md.
 *
 * Excluir fica na coluna "Ações" (editar + excluir), junto com o lápis de
 * editar — ver `onDelete`/`canDelete` passados ao DataTable. Tipos de
 * sistema/protegidos (centro_custo, conta, entidade) não podem ser
 * excluídos, então `canDelete` barra o botão para eles.
 */
function buildTypeColumns(
  t: Translator,
  expandedTypeId: string | null,
  onToggleStructure: (id: string) => void
): ColumnMeta<DimensionType>[] {
  return [
    {
      key: "name",
      label: t("dimensions.name"),
      getText: (d) => d.name,
      render: (d) => <span className="font-medium text-gray-800">{d.name}</span>,
    },
    {
      key: "code",
      label: t("dimensions.code"),
      width: 140,
      getText: (d) => d.code,
      render: (d) => <code className="settings-code">{d.code}</code>,
    },
    {
      key: "description",
      label: t("dimensions.fieldDescription"),
      getText: (d) => d.description ?? "",
      render: (d) =>
        d.description ? (
          <span className="text-gray-600">{d.description}</span>
        ) : (
          <span className="text-gray-400">{t("dimensions.noDescription")}</span>
        ),
    },
    {
      key: "useInMatriz",
      label: t("dimensions.useInMatrizColumn"),
      noTooltip: true,
      filterable: true,
      filterValueLabels: { yes: t("dimensions.useInMatrizYes"), no: t("dimensions.useInMatrizNo") },
      filterValue: (d) => (d.use_in_matriz ? "yes" : "no"),
      render: (d) =>
        d.use_in_matriz ? (
          <span className="type-badge">{t("dimensions.useInMatrizYes")}</span>
        ) : (
          <span className="text-gray-400">{t("dimensions.useInMatrizNo")}</span>
        ),
    },
    {
      key: "structure",
      label: t("dimensions.structure"),
      sortable: false,
      noTooltip: true,
      render: (d) => (
        <button
          type="button"
          className={`settings-structure-btn${expandedTypeId === d.id ? " is-active" : ""}`}
          onClick={() => onToggleStructure(d.id)}
        >
          {t("dimensions.structure")}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ),
    },
    {
      key: "type",
      label: t("dimensions.typeLabel"),
      noTooltip: true,
      filterable: true,
      filterValueLabels: { system: t("dimensions.system"), custom: t("dimensions.custom") },
      filterValue: (d) => (d.is_system || isProtectedDimensionCode(d.code) ? "system" : "custom"),
      render: (d) => (
        <span className={`type-badge${d.is_system || isProtectedDimensionCode(d.code) ? " type-badge--system" : ""}`}>
          {d.is_system || isProtectedDimensionCode(d.code) ? t("dimensions.system") : t("dimensions.custom")}
        </span>
      ),
    },
  ];
}

interface ConfiguracoesClientProps {
  dimensionTypes: DimensionType[];
  nodesByType: Record<string, DimensionNodeRow[]>;
  year: number;
  fiscalYearStartMonth: number;
  isAdmin: boolean;
}

const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const CUSTOM_DIMENSIONS_LIMIT = 10;

export function ConfiguracoesClient({
  dimensionTypes,
  nodesByType,
  year,
  fiscalYearStartMonth,
  isAdmin,
}: ConfiguracoesClientProps) {
  const router = useRouter();
  const t = useTranslations("settings");
  const td = useTranslations("dimensions");
  const tm = useTranslations("budget");
  const tc = useTranslations("common");

  const [month, setMonth] = useState(fiscalYearStartMonth);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<DimensionType | "new" | null>(null);
  const [deleting, setDeleting] = useState<DimensionType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Árvore de itens inline — abre dentro da própria linha da dimensão
  // quando a usuária clica em "Estrutura" (ver claude/decisoes-arquitetura.md,
  // decisão de trazer a árvore pra dentro de Parâmetros em vez de uma rota
  // separada em /admin/dimensoes).
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const treeExpand = useTreeExpand();
  const [nodeEditing, setNodeEditing] = useState<{ type: DimensionType; node: DimensionNodeRow | "new" } | null>(null);
  const [nodeDeleting, setNodeDeleting] = useState<{ type: DimensionType; node: DimensionNodeRow } | null>(null);
  const [nodeDeleteLoading, setNodeDeleteLoading] = useState(false);
  const [nodeDeleteError, setNodeDeleteError] = useState<string | null>(null);

  const hierarchies = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildDimensionHierarchy>>();
    for (const d of dimensionTypes) {
      map.set(d.id, buildDimensionHierarchy(nodesByType[d.id] ?? []));
    }
    return map;
  }, [dimensionTypes, nodesByType]);

  useEffect(() => setMonth(fiscalYearStartMonth), [fiscalYearStartMonth]);

  async function handleSaveMonth(newMonth: number) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateFiscalYearStartMonth(newMonth);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await deleteDimensionType({ id: deleting.id });
    setDeleteLoading(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  async function handleConfirmDeleteNode() {
    if (!nodeDeleting) return;
    setNodeDeleteLoading(true);
    setNodeDeleteError(null);
    const result = await cancelDimensionNode({ versionId: nodeDeleting.node.versionId, year });
    setNodeDeleteLoading(false);
    if (result.error) {
      setNodeDeleteError(result.error);
      return;
    }
    setNodeDeleting(null);
    router.refresh();
  }

  const customCount = dimensionTypes.filter((d) => !d.is_system && !isProtectedDimensionCode(d.code)).length;
  const limitReached = customCount >= CUSTOM_DIMENSIONS_LIMIT;
  const columnCount = 6;

  /**
   * Conteúdo do painel "Estrutura" de uma dimensão — árvore simples de
   * itens (igual ao desenho de "plano de aulas" do app irmão), não um
   * DataTable. `embedded` troca só o wrapper externo: quando é usado dentro
   * do `renderExpanded` do DataTable (lista de tipos), o próprio DataTable
   * já desenha cartão arredondado/borda ao redor, então aqui a gente usa
   * `.settings-structure-embedded` (sem fundo/borda duplicados); no
   * fallback de leitura (usuária não-admin, tabela simples) usa-se
   * `.settings-structure-panel` (com seu próprio fundo tracejado).
   */
  function renderStructureContent(d: DimensionType, embedded: boolean) {
    const hierarchy = hierarchies.get(d.id);
    const nodes = nodesByType[d.id] ?? [];
    const visibleRows = hierarchy ? getVisibleRows(hierarchy.rows, treeExpand.collapsedIds) : [];

    return (
      <div className={embedded ? "settings-structure-embedded" : "settings-structure-panel"}>
        <div className="settings-structure-header">
          <span className="settings-structure-label">{t("dimensions.structureItems")}</span>
          <div className="settings-structure-actions">
            <Link href={`/admin/dimensoes/${d.code}/importar?ano=${year}`} className="settings-structure-import-link">
              {td("importButton")}
            </Link>
            <Button size="sm" variant="accent-blue" className="px-3" onClick={() => setNodeEditing({ type: d, node: "new" })}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              {td("new")}
            </Button>
          </div>
        </div>

        {nodes.length === 0 ? (
          <p className="settings-structure-empty">{td("emptyMessage", { year })}</p>
        ) : (
          <div>
            {visibleRows.map((row) => (
              <div key={row.item.id} className="settings-item-row">
                <TreeGuides
                  ancestorContinues={row.ancestorContinues}
                  isLast={hierarchy!.isLastChild.has(row.item.id)}
                  depth={row.depth}
                />
                {hierarchy!.hasChildren.has(row.item.id) ? (
                  <TreeExpand
                    isOpen={!treeExpand.isCollapsed(row.item.id)}
                    onToggle={() => treeExpand.toggle(row.item.id)}
                    label={treeExpand.isCollapsed(row.item.id) ? td("expandNode") : td("collapseNode")}
                  />
                ) : (
                  <span className="tree-expand-spacer" />
                )}
                <span className="settings-item-name">{row.item.name}</span>
                <span className="settings-item-actions">
                  <button
                    type="button"
                    className="settings-item-icon-btn"
                    title={td("edit")}
                    onClick={() => setNodeEditing({ type: d, node: row.item })}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="settings-item-icon-btn settings-item-icon-btn--danger"
                    title={tc("delete")}
                    onClick={() => setNodeDeleting({ type: d, node: row.item })}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                    </svg>
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <section className="settings-block">
        <h2 className="settings-block-title">{t("period.title")}</h2>
        <div className="settings-inline-row">
          <span className="settings-block-intro">{t("period.intro")}</span>
          {isAdmin ? (
            <>
              <select
                className="year-select"
                aria-label={t("period.startMonth")}
                value={month}
                onChange={(e) => {
                  const newMonth = Number(e.target.value);
                  setMonth(newMonth);
                  handleSaveMonth(newMonth);
                }}
              >
                {MONTH_KEYS.map((key, i) => (
                  <option key={key} value={i + 1}>
                    {tm(`months.${key}`)}
                  </option>
                ))}
              </select>
              {saving && <span className="settings-saved-hint">{t("period.saving")}</span>}
              {saved && !saving && <span className="settings-saved-hint">{t("period.saved")}</span>}
            </>
          ) : (
            <span className="text-sm text-gray-700">{tm(`months.${MONTH_KEYS[fiscalYearStartMonth - 1]}`)}</span>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {!isAdmin && <p className="settings-admin-hint">{t("period.adminOnly")}</p>}
      </section>

      <div className="settings-divider" />

      <section className="settings-block">
        <h2 className="settings-block-title">{t("dimensions.title")}</h2>
        <div className="settings-block-subtitle-row">
          <p className="settings-block-intro">{t("dimensions.intro")}</p>
          <div className="settings-progress-block">
            <div className="settings-progress-block-label">
              <span>{t("dimensions.customUsage")}</span>
              <span className="settings-progress-block-value">
                {customCount}/{CUSTOM_DIMENSIONS_LIMIT}
              </span>
            </div>
            <div className="settings-progress-block-bar">
              <div
                className={`settings-progress-block-fill${limitReached ? " settings-progress-block-fill--full" : ""}`}
                style={{ width: `${(Math.min(customCount, CUSTOM_DIMENSIONS_LIMIT) / CUSTOM_DIMENSIONS_LIMIT) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {!isAdmin && (
          <div className="settings-block-actions">
            <p className="settings-admin-hint">{t("dimensions.adminOnly")}</p>
          </div>
        )}

        {isAdmin ? (
          <DataTable<DimensionType>
            items={dimensionTypes}
            columns={buildTypeColumns(
              t,
              expandedTypeId,
              (id) => setExpandedTypeId((prev) => (prev === id ? null : id))
            )}
            prefsKey="configuracoes_tipos_cols"
            onEdit={(d) => setEditing(d)}
            onDelete={(d) => setDeleting(d)}
            canDelete={(d) => !d.is_system && !isProtectedDimensionCode(d.code)}
            onNew={() => setEditing("new")}
            newLabel={t("dimensions.new")}
            expandedRowId={expandedTypeId}
            renderExpanded={(d) => renderStructureContent(d, true)}
          />
        ) : (
          <table className="settings-table">
            <thead>
              <tr>
                <th>{t("dimensions.name")}</th>
                <th>{t("dimensions.code")}</th>
                <th>{t("dimensions.fieldDescription")}</th>
                <th>{t("dimensions.useInMatrizColumn")}</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dimensionTypes.map((d) => {
                const expanded = expandedTypeId === d.id;

                return (
                  <Fragment key={d.id}>
                    <tr>
                      <td className="font-medium text-gray-800">{d.name}</td>
                      <td>
                        <code className="settings-code">{d.code}</code>
                      </td>
                      <td className="text-gray-600">{d.description || <span className="text-gray-400">{t("dimensions.noDescription")}</span>}</td>
                      <td className="text-gray-600">
                        {d.use_in_matriz ? (
                          <span className="type-badge">{t("dimensions.useInMatrizYes")}</span>
                        ) : (
                          <span className="text-gray-400">{t("dimensions.useInMatrizNo")}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`settings-structure-btn${expanded ? " is-active" : ""}`}
                          onClick={() => setExpandedTypeId(expanded ? null : d.id)}
                        >
                          {t("dimensions.structure")}
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </td>
                      <td>
                        <span className={`type-badge${d.is_system || isProtectedDimensionCode(d.code) ? " type-badge--system" : ""}`}>
                          {d.is_system || isProtectedDimensionCode(d.code) ? t("dimensions.system") : t("dimensions.custom")}
                        </span>
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="settings-structure-row">
                        <td colSpan={columnCount}>{renderStructureContent(d, false)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {isAdmin && (
        <DimensionTypeFormModal
          open={editing !== null}
          onClose={() => setEditing(null)}
          editing={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {isAdmin && (
        <Modal
          open={deleting !== null}
          onClose={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          title={t("dimensions.deleteConfirmTitle")}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteLoading}>
                {tc("cancel")}
              </Button>
              <Button variant="danger" isLoading={deleteLoading} loadingText={tc("saving")} onClick={handleConfirmDelete}>
                {tc("delete")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {deleting &&
                t.rich("dimensions.deleteConfirmBody", {
                  name: deleting.name,
                  b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
                })}
            </p>
            {deleteError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-600">{deleteError}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      <NodeFormModal
        open={nodeEditing !== null}
        onClose={() => setNodeEditing(null)}
        editing={nodeEditing && nodeEditing.node !== "new" ? nodeEditing.node : null}
        dimensionTypeId={nodeEditing?.type.id ?? ""}
        dimensionTypeName={nodeEditing?.type.name ?? ""}
        year={year}
        nodes={nodeEditing ? nodesByType[nodeEditing.type.id] ?? [] : []}
        onSaved={() => {
          setNodeEditing(null);
          router.refresh();
        }}
      />

      <Modal
        open={nodeDeleting !== null}
        onClose={() => {
          setNodeDeleting(null);
          setNodeDeleteError(null);
        }}
        title={td("deleteConfirmTitle")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNodeDeleting(null)} disabled={nodeDeleteLoading}>
              {tc("cancel")}
            </Button>
            <Button
              variant="danger"
              isLoading={nodeDeleteLoading}
              loadingText={tc("saving")}
              onClick={handleConfirmDeleteNode}
            >
              {tc("delete")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            {nodeDeleting && td("deleteConfirmBody", { name: nodeDeleting.node.name, year })}
          </p>
          {nodeDeleteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-600">{nodeDeleteError}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
