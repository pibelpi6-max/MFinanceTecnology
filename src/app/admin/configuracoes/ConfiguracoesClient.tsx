"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Tooltip } from "@/components/ui/Tooltip";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import type { ColumnMeta } from "@/components/ui/DataTable/types";
import { TreeItemRow } from "@/components/ui/tree";
import { useTreeExpand } from "@/hooks/useTreeExpand";
import type { DimensionType, DimensionNodeRow, DimensionStructure } from "@/lib/dimensions/types";
import { isProtectedDimensionCode } from "@/lib/dimensions/constants";
import type { ConjuntoEstruturaWithItems } from "@/lib/orcamentos/queries";
import type { Orcamento } from "@/lib/orcamentos/types";
import { DimensionTypeFormModal } from "./DimensionTypeFormModal";
import { StructureFormModal } from "./StructureFormModal";
import { ImportStructureModal } from "./ImportStructureModal";
import { ConjuntoFormModal } from "./ConjuntoFormModal";
import { OrcamentoFormModal } from "./OrcamentoFormModal";
import { deleteDimensionType, updateFiscalYearStartMonth } from "./_actions";
import { setDimensionStructureActive, deleteDimensionStructure, duplicateDimensionStructure } from "./_structureActions";
import { deleteConjunto } from "./_conjuntoActions";
import { deleteOrcamento } from "./_orcamentoActions";
import { cancelDimensionNode, createDimensionNode, updateDimensionNode } from "../dimensoes/_actions";

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
      maxWidth: 200,
      getText: (d) => d.name,
      filterable: true,
      render: (d) => <span className="font-medium text-gray-800">{d.name}</span>,
    },
    {
      key: "code",
      label: t("dimensions.code"),
      width: 140,
      getText: (d) => d.code,
      filterable: true,
      render: (d) => <code className="settings-code">{d.code}</code>,
    },
    {
      key: "description",
      label: t("dimensions.fieldDescription"),
      maxWidth: 220,
      getText: (d) => d.description ?? "",
      filterable: true,
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
      maxWidth: 170,
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
      label: t("dimensions.structures"),
      maxWidth: 165,
      sortable: false,
      noTooltip: true,
      render: (d) => (
        <button
          type="button"
          className={`settings-structure-btn${expandedTypeId === d.id ? " is-active" : ""}`}
          onClick={() => onToggleStructure(d.id)}
        >
          {t("dimensions.structures")}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ),
    },
    {
      key: "type",
      label: t("dimensions.typeLabel"),
      maxWidth: 150,
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
  structuresByType: Record<string, DimensionStructure[]>;
  nodesByStructure: Record<string, DimensionNodeRow[]>;
  year: number;
  fiscalYearStartMonth: number;
  isAdmin: boolean;
  conjuntos: ConjuntoEstruturaWithItems[];
  orcamentos: Orcamento[];
}

const MONTH_KEYS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const CUSTOM_DIMENSIONS_LIMIT = 10;

export function ConfiguracoesClient({
  dimensionTypes,
  structuresByType,
  nodesByStructure,
  year,
  fiscalYearStartMonth,
  isAdmin,
  conjuntos,
  orcamentos,
}: ConfiguracoesClientProps) {
  const router = useRouter();
  const t = useTranslations("settings");
  const td = useTranslations("dimensions");
  const tm = useTranslations("budget");
  const tc = useTranslations("common");
  const tConjunto = useTranslations("settings.conjuntos");
  const tOrcamento = useTranslations("settings.orcamentos");

  const [conjuntoModal, setConjuntoModal] = useState<{ editing: ConjuntoEstruturaWithItems | null } | null>(null);
  const [conjuntoDeleting, setConjuntoDeleting] = useState<ConjuntoEstruturaWithItems | null>(null);
  const [conjuntoDeleteLoading, setConjuntoDeleteLoading] = useState(false);
  const [conjuntoDeleteError, setConjuntoDeleteError] = useState<string | null>(null);

  const [orcamentoModal, setOrcamentoModal] = useState<{ editing: Orcamento | null } | null>(null);
  const [orcamentoDeleting, setOrcamentoDeleting] = useState<Orcamento | null>(null);
  const [orcamentoDeleteLoading, setOrcamentoDeleteLoading] = useState(false);
  const [orcamentoDeleteError, setOrcamentoDeleteError] = useState<string | null>(null);

  async function handleConfirmDeleteConjunto() {
    if (!conjuntoDeleting) return;
    setConjuntoDeleteLoading(true);
    setConjuntoDeleteError(null);
    const result = await deleteConjunto({ id: conjuntoDeleting.id });
    setConjuntoDeleteLoading(false);
    if (result.error) {
      setConjuntoDeleteError(result.error);
      return;
    }
    setConjuntoDeleting(null);
    router.refresh();
  }

  async function handleConfirmDeleteOrcamento() {
    if (!orcamentoDeleting) return;
    setOrcamentoDeleteLoading(true);
    setOrcamentoDeleteError(null);
    const result = await deleteOrcamento({ id: orcamentoDeleting.id });
    setOrcamentoDeleteLoading(false);
    if (result.error) {
      setOrcamentoDeleteError(result.error);
      return;
    }
    setOrcamentoDeleting(null);
    router.refresh();
  }

  const [month, setMonth] = useState(fiscalYearStartMonth);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<DimensionType | "new" | null>(null);
  const [deleting, setDeleting] = useState<DimensionType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Árvore de itens inline — abre dentro da própria linha da dimensão
  // quando a usuária clica em "Estruturas" (ver claude/decisoes-arquitetura.md,
  // decisão de trazer a árvore pra dentro de Parâmetros em vez de uma rota
  // separada em /admin/dimensoes). Desde a migration 0012, cada dimensão
  // pode ter várias Estruturas nomeadas — o painel mostra a lista delas e,
  // ao selecionar uma, a árvore de itens dela logo abaixo.
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  // Accordion por estrutura: null/ausente = nenhuma expandida (padrão), uma
  // por dimensão por vez — clicar numa estrutura expande a árvore dela
  // embutida na própria linha, clicar de novo (ou noutra) recolhe/troca.
  const [expandedStructureId, setExpandedStructureId] = useState<Record<string, string | null>>({});
  const treeExpand = useTreeExpand();
  const [nodeDeleting, setNodeDeleting] = useState<{ type: DimensionType; node: DimensionNodeRow } | null>(null);
  const [nodeDeleteLoading, setNodeDeleteLoading] = useState(false);
  const [nodeDeleteError, setNodeDeleteError] = useState<string | null>(null);

  // Criação inline na árvore ("+ item" sob cada nó aberto, igual à dinâmica
  // do "plano de aulas" no desenhe-app — ver handleInlineAddNode/claude/
  // decisoes-arquitetura.md). addingNodeKey = `${structureId}:${parentId ?? "root"}`
  // do botão em voo, só pra desabilitar/mostrar carregando o botão certo.
  const [addingNodeKey, setAddingNodeKey] = useState<string | null>(null);
  const [addNodeError, setAddNodeError] = useState<string | null>(null);

  // Editar item virou inline também (igual à criação), em vez de modal —
  // pedido da usuária em 06/10: duplo clique (ou o lápis) no nome do item
  // troca a própria linha por um mini-formulário [código][nome] + salvar/
  // cancelar. O NodeFormModal (que também tinha o seletor de "item
  // superior" pra reparentar) foi removido; reparentar um item existente
  // fica sem UI por enquanto — só dá pra escolher o pai na hora de criar.
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editNodeCode, setEditNodeCode] = useState("");
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeLoading, setEditNodeLoading] = useState(false);
  const [editNodeError, setEditNodeError] = useState<string | null>(null);

  function startInlineEditNode(node: DimensionNodeRow) {
    setEditingNodeId(node.id);
    setEditNodeCode(node.code);
    setEditNodeName(node.name);
    setEditNodeError(null);
  }

  function cancelInlineEditNode() {
    setEditingNodeId(null);
    setEditNodeError(null);
  }

  async function handleSaveInlineEditNode(node: DimensionNodeRow) {
    setEditNodeLoading(true);
    setEditNodeError(null);
    const result = await updateDimensionNode({
      nodeId: node.id,
      versionId: node.versionId,
      currentValidFromYear: node.validFromYear,
      name: editNodeName.trim(),
      code: editNodeCode.trim(),
      parentNodeId: node.parentNodeId,
      year,
    });
    setEditNodeLoading(false);
    if (result.error) {
      setEditNodeError(result.error);
      return;
    }
    setEditingNodeId(null);
    router.refresh();
  }

  const [structureModal, setStructureModal] = useState<{
    type: DimensionType;
    mode: "create" | "rename";
    source: DimensionStructure | null;
  } | null>(null);
  const [structureDeleting, setStructureDeleting] = useState<DimensionStructure | null>(null);
  const [structureDeleteLoading, setStructureDeleteLoading] = useState(false);
  const [structureDeleteError, setStructureDeleteError] = useState<string | null>(null);
  const [structureToggleId, setStructureToggleId] = useState<string | null>(null);
  const [structureToggleError, setStructureToggleError] = useState<string | null>(null);

  // Duplicar é uma caixa de confirmação simples (como excluir), não um
  // formulário — o nome da cópia é gerado automaticamente (ver
  // duplicateNameSuggestion), a usuária só confirma. Pedido dela em 06/10.
  const [structureDuplicating, setStructureDuplicating] = useState<{ type: DimensionType; source: DimensionStructure } | null>(null);
  const [structureDuplicateLoading, setStructureDuplicateLoading] = useState(false);
  const [structureDuplicateError, setStructureDuplicateError] = useState<string | null>(null);

  const [importModal, setImportModal] = useState<{ type: DimensionType; source: DimensionStructure } | null>(null);

  function toggleStructureExpanded(typeId: string, structureId: string) {
    setExpandedStructureId((prev) => ({
      ...prev,
      [typeId]: prev[typeId] === structureId ? null : structureId,
    }));
  }

  // Clique único no título (seta + nome) de uma Estrutura expande/colapsa a
  // árvore dela; duplo clique no mesmo título abre o rename. Como o browser
  // sempre dispara dois "click" antes do "dblclick", o toggle de expandir é
  // adiado um pouco — se um segundo clique chegar nesse meio tempo (ou seja,
  // virou duplo clique), o toggle agendado é cancelado e só o rename abre.
  // Pedido da usuária em 06/10 (claude/decisoes-arquitetura.md).
  const structureClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleStructureTitleClick(typeId: string, structureId: string) {
    if (structureClickTimer.current) clearTimeout(structureClickTimer.current);
    structureClickTimer.current = setTimeout(() => {
      structureClickTimer.current = null;
      toggleStructureExpanded(typeId, structureId);
    }, 220);
  }

  function handleStructureTitleDoubleClick(d: DimensionType, s: DimensionStructure) {
    if (structureClickTimer.current) {
      clearTimeout(structureClickTimer.current);
      structureClickTimer.current = null;
    }
    setStructureModal({ type: d, mode: "rename", source: s });
  }

  async function handleToggleStructureActive(d: DimensionType, s: DimensionStructure) {
    setStructureToggleId(s.id);
    setStructureToggleError(null);
    const result = await setDimensionStructureActive({ id: s.id, dimensionTypeId: d.id, isActive: !s.is_active });
    setStructureToggleId(null);
    if (result.error) {
      setStructureToggleError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleConfirmDeleteStructure() {
    if (!structureDeleting) return;
    setStructureDeleteLoading(true);
    setStructureDeleteError(null);
    const result = await deleteDimensionStructure({ id: structureDeleting.id });
    setStructureDeleteLoading(false);
    if (result.error) {
      setStructureDeleteError(result.error);
      return;
    }
    setStructureDeleting(null);
    router.refresh();
  }

  async function handleConfirmDuplicateStructure() {
    if (!structureDuplicating) return;
    setStructureDuplicateLoading(true);
    setStructureDuplicateError(null);
    const newName = t("dimensions.duplicateNameSuggestion", { name: structureDuplicating.source.name });
    const result = await duplicateDimensionStructure({ id: structureDuplicating.source.id, newName, year });
    setStructureDuplicateLoading(false);
    if (result.error || !result.id) {
      setStructureDuplicateError(result.error ?? "Erro inesperado");
      return;
    }
    setExpandedStructureId((prev) => ({ ...prev, [structureDuplicating.type.id]: result.id! }));
    setStructureDuplicating(null);
    router.refresh();
  }

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

  /** Código provisório único (dentro da Estrutura) pro item criado pelo "+
   * item" inline — a usuária pode ajustar depois com duplo clique (ou o
   * lápis) no item, que abre a edição inline. Unicidade é (tenant, structure,
   * code) no banco; aqui só evita a colisão óbvia com o que já existe. */
  function generateItemCode(existingCodes: Set<string>): string {
    let n = existingCodes.size + 1;
    let code = `item-${n}`;
    while (existingCodes.has(code)) {
      n += 1;
      code = `item-${n}`;
    }
    return code;
  }

  async function handleInlineAddNode(d: DimensionType, s: DimensionStructure, parentNodeId: string | null) {
    const key = `${s.id}:${parentNodeId ?? "root"}`;
    setAddingNodeKey(key);
    setAddNodeError(null);
    const existingCodes = new Set((nodesByStructure[s.id] ?? []).map((n) => n.code));
    const result = await createDimensionNode({
      dimensionTypeId: d.id,
      structureId: s.id,
      code: generateItemCode(existingCodes),
      name: td("new"),
      parentNodeId,
      year,
    });
    setAddingNodeKey(null);
    if (result.error) {
      setAddNodeError(result.error);
      return;
    }
    router.refresh();
  }

  const customCount = dimensionTypes.filter((d) => !d.is_system && !isProtectedDimensionCode(d.code)).length;
  const limitReached = customCount >= CUSTOM_DIMENSIONS_LIMIT;
  // Aviso (laranja) a partir de 7/10 — abaixo disso a barra fica no azul normal.
  const limitWarning = customCount >= 7 && !limitReached;
  const columnCount = 6;

  /**
   * Painel "Estrutura" de uma dimensão: lista vertical de Estruturas em
   * formato de acordeão — clicar numa estrutura expande, dentro da
   * própria linha, a árvore de itens dela (uma por vez; clicar de novo
   * ou noutra estrutura recolhe/troca). Terceira iteração deste layout
   * (05/10): começou empilhado (pills em cima, árvore fixa embaixo),
   * passou por uma tela dividida (lista + árvore lado a lado, prototipada
   * e aprovada num canvas de Design), mas a usuária preferiu, depois de
   * ver as duas rodando, voltar à ideia original de acordeão — mais
   * compacto, sem precisar de uma coluna fixa de árvore vazia enquanto
   * nada está selecionado. `embedded` troca só o wrapper externo: sem
   * fundo/borda quando usado dentro do `renderExpanded` do DataTable
   * (lista de tipos), que já desenha o cartão ao redor; com fundo
   * tracejado próprio no fallback de leitura (usuária não-admin).
   */
  /** Linha "+ item" raiz da árvore — única que sobra como botão fixo
   * (as outras virar&atilde;o filho de qualquer item via "+" no hover
   * da própria linha, ver renderNodeRow). Sempre no nível 0, por isso
   * sem indentação própria. */
  function renderAddItemRow(opts: { rowKey: string; busy: boolean; onClick: () => void }) {
    return (
      <div key={opts.rowKey} className="settings-item-row settings-item-row--add">
        <span className="tree-expand-spacer" />
        <button type="button" className="settings-item-add-btn" disabled={opts.busy} onClick={opts.onClick}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          {td("addItem")}
        </button>
      </div>
    );
  }

  /** Agrupa os nós de uma estrutura por pai, já ordenados — igual ao que
   * `buildDimensionHierarchy` fazia internamente, mas aqui fica exposto
   * pra `renderNodeRow` poder recursar de verdade (ver abaixo). */
  function buildChildrenByParent(nodes: DimensionNodeRow[]): Map<string | null, DimensionNodeRow[]> {
    const map = new Map<string | null, DimensionNodeRow[]>();
    nodes.forEach((n) => {
      const list = map.get(n.parentNodeId) ?? [];
      list.push(n);
      map.set(n.parentNodeId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    return map;
  }

  /** Uma linha da árvore e, se expandida, seus filhos — JSX recursivo de
   * verdade (cada filho literalmente dentro do wrapper do pai), igual ao
   * `NodeRow` de EspecialidadePlanoDeAulasPanel.tsx na desenhe-app: lá a
   * árvore também vive dentro do corpo expansível de uma linha de
   * DataTable, mas o conteúdo desse corpo é `<div>` livre (não `<tr>`),
   * então nada impede aninhar de verdade.
   *
   * As guias verticais (quem liga cada item ao pai) NÃO vêm mais de um
   * border-left no wrapper `.settings-item-children` — um border-left
   * num bloco aninhado cobre sempre a altura inteira do conteúdo dele,
   * então numa cadeia de filho único a linha do avô, do pai e do filho
   * ficam todas paralelas até o fim, nunca "terminando" (foi exatamente
   * o que a usuária reportou: "a tree view não é finita verticalmente").
   * Em vez disso cada linha desenha sua própria guia com `TreeGuides`
   * (mesmo componente usado no seletor de pai e na árvore da Matriz,
   * ver src/components/ui/tree): cada coluna da guia é um irmão flex
   * dentro da própria `.settings-item-row` (`align-self: stretch`), ou
   * seja, ela se estica só até a altura DESSA linha — não da subárvore
   * inteira. Se o item é o último irmão do seu nível, a guia dele para
   * na metade (um "L" clássico); senão ela desenha a coluna inteira,
   * pra continuar até o próximo irmão. `ancestorContinues` carrega esse
   * mesmo sim/não pra cada nível acima, exatamente como
   * `buildDimensionHierarchy` calcula pra lista plana do seletor de pai
   * (`ancestorContinues: [...ancestorContinues, !isLast]` a cada nível). */
  function renderNodeRow(opts: {
    node: DimensionNodeRow;
    depth: number;
    isLast: boolean;
    ancestorContinues: boolean[];
    childrenByParent: Map<string | null, DimensionNodeRow[]>;
    d: DimensionType;
    s: DimensionStructure;
    addKeyFor: (parentId: string | null) => string;
  }) {
    const { node, depth, isLast, ancestorContinues, childrenByParent, d, s, addKeyFor } = opts;
    const children = childrenByParent.get(node.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = !treeExpand.isCollapsed(node.id);

    const isEditing = editingNodeId === node.id;

    return (
      <div key={node.id}>
        <TreeItemRow
          ancestorContinues={ancestorContinues}
          isLast={isLast}
          depth={depth}
          hasChildren={hasChildren}
          isOpen={isOpen}
          onToggleExpand={() => treeExpand.toggle(node.id)}
          expandLabel={isOpen ? td("collapseNode") : td("expandNode")}
          name={node.name}
          onDoubleClickName={() => startInlineEditNode(node)}
          onAddChild={() => handleInlineAddNode(d, s, node.id)}
          addDisabled={addingNodeKey === addKeyFor(node.id) || depth >= 9}
          addLabel={td("addItem")}
          onEdit={() => startInlineEditNode(node)}
          editLabel={td("edit")}
          onDelete={() => setNodeDeleting({ type: d, node })}
          deleteLabel={tc("delete")}
          isEditing={isEditing}
          editCode={editNodeCode}
          onEditCodeChange={setEditNodeCode}
          editName={editNodeName}
          onEditNameChange={setEditNodeName}
          onSaveEdit={() => handleSaveInlineEditNode(node)}
          onCancelEdit={cancelInlineEditNode}
          editLoading={editNodeLoading}
          editError={isEditing ? editNodeError : null}
          codePlaceholder={td("code")}
          namePlaceholder={td("name")}
          saveLabel={tc("save")}
          cancelLabel={tc("cancel")}
        />

        {hasChildren && isOpen && (
          <div className="settings-item-children">
            {children.map((child, i) =>
              renderNodeRow({
                node: child,
                depth: depth + 1,
                isLast: i === children.length - 1,
                ancestorContinues: [...ancestorContinues, !isLast],
                childrenByParent,
                d,
                s,
                addKeyFor,
              })
            )}
          </div>
        )}
      </div>
    );
  }

  function renderStructureContent(d: DimensionType, embedded: boolean) {
    const list = structuresByType[d.id] ?? [];
    const expandedId = expandedStructureId[d.id] ?? null;

    return (
      <div className={embedded ? "settings-structure-embedded" : "settings-structure-panel"}>
        <div className="settings-structure-header">
          <span className="settings-structure-label">{t("dimensions.structuresOfDimension")}</span>
          <Button
            size="sm"
            variant="accent-blue"
            className="px-3"
            onClick={() => setStructureModal({ type: d, mode: "create", source: null })}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            {t("dimensions.newStructure")}
          </Button>
        </div>

        {list.length === 0 ? (
          <p className="settings-structure-empty">{t("dimensions.noStructures")}</p>
        ) : (
          <div className="settings-structure-accordion-list">
            {list.map((s) => {
              const isExpanded = expandedId === s.id;
              const nodes = nodesByStructure[s.id] ?? [];
              const childrenByParent = buildChildrenByParent(nodes);

              return (
                <div key={s.id} className={`settings-structure-accordion${isExpanded ? " is-expanded" : ""}`}>
                  <div className="settings-structure-accordion-row">
                    <button
                      type="button"
                      className="settings-structure-accordion-toggle"
                      onClick={() => handleStructureTitleClick(d.id, s.id)}
                      onDoubleClick={() => handleStructureTitleDoubleClick(d, s)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                      </svg>
                      <span className="flex-1 min-w-0">
                        <Tooltip text={s.name} onlyWhenTruncated side="top" fullWidth>
                          <span data-truncate className="settings-structure-accordion-name block truncate">
                            {s.name}
                          </span>
                        </Tooltip>
                      </span>
                    </button>
                    <span className="settings-structure-row-spacer" />
                    <span className={`settings-structure-status-badge${s.is_active ? " is-active" : ""}`}>
                      {s.is_active ? t("dimensions.structureActive") : t("dimensions.structureInactive")}
                    </span>
                    <label
                      className="settings-structure-switch"
                      title={s.is_active ? t("dimensions.structureActive") : t("dimensions.structureInactive")}
                    >
                      <input
                        type="checkbox"
                        checked={s.is_active}
                        disabled={structureToggleId === s.id}
                        onChange={() => handleToggleStructureActive(d, s)}
                      />
                      <span className="settings-structure-switch-track" />
                    </label>
                    <span className="settings-item-actions settings-item-actions--static">
                      <button
                        type="button"
                        className="settings-item-icon-btn"
                        title={t("dimensions.renameStructure")}
                        onClick={() => setStructureModal({ type: d, mode: "rename", source: s })}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="settings-item-icon-btn"
                        title={td("importButton")}
                        onClick={() => setImportModal({ type: d, source: s })}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 13V3m0 0-3.5 3.5M12 3l3.5 3.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="settings-item-icon-btn"
                        title={t("dimensions.duplicateStructure")}
                        onClick={() => setStructureDuplicating({ type: d, source: s })}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect x="8" y="8" width="12" height="12" rx="2" />
                          <path d="M4 16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
                        </svg>
                      </button>
                      <span className="settings-item-actions-divider" />
                      <button
                        type="button"
                        className="settings-item-icon-btn settings-item-icon-btn--danger"
                        title={tc("delete")}
                        onClick={() => setStructureDeleting(s)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                        </svg>
                      </button>
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="settings-structure-accordion-body">
                      {nodes.length === 0 && (
                        <p className="settings-structure-empty">{td("emptyMessage")}</p>
                      )}

                      {(() => {
                        const addKeyFor = (parentId: string | null) => `${s.id}:${parentId ?? "root"}`;
                        const rootNodes = childrenByParent.get(null) ?? [];

                        // Cada linha ganha seu próprio "+" inline (junto com
                        // editar/excluir, só aparece no hover da linha) pra
                        // adicionar um filho ali mesmo — qualquer item pode
                        // virar pai, sem precisar abrir um ghost-row à parte
                        // embaixo de cada um (isso empilhava um "+ item" por
                        // ancestral toda vez que um ramo fundo terminava,
                        // dobrando a altura da árvore). A árvore em si é JSX
                        // recursivo de verdade (renderNodeRow chamando a si
                        // mesma), não lista plana — ver o comentário em
                        // renderNodeRow.
                        //
                        // Só é permitido UM item raiz por estrutura — tudo
                        // mais entra como filho dele (ou de um dos seus
                        // descendentes), nunca como outro nó paralelo no
                        // nível 0. Por isso o botão "+ item" de raiz só
                        // aparece enquanto não existe nenhum; depois disso,
                        // adicionar vira só o "+" inline de cada linha.
                        return (
                          <div>
                            {rootNodes.map((node, i) =>
                              renderNodeRow({
                                node,
                                depth: 0,
                                isLast: i === rootNodes.length - 1,
                                ancestorContinues: [],
                                childrenByParent,
                                d,
                                s,
                                addKeyFor,
                              })
                            )}
                            {rootNodes.length === 0 &&
                              renderAddItemRow({
                                rowKey: "add-root",
                                busy: addingNodeKey === addKeyFor(null),
                                onClick: () => handleInlineAddNode(d, s, null),
                              })}
                          </div>
                        );
                      })()}
                      {addNodeError && <p className="mt-1 px-2 text-xs text-red-600">{addNodeError}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {structureToggleError && <p className="mt-1 text-xs text-red-600">{structureToggleError}</p>}
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
                className={`settings-progress-block-fill${limitReached ? " settings-progress-block-fill--full" : limitWarning ? " settings-progress-block-fill--warning" : ""}`}
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
                          {t("dimensions.structures")}
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

      <div className="settings-divider" />

      <section className="settings-block">
        <div className="settings-block-subtitle-row">
          <div>
            <h2 className="settings-block-title">{tConjunto("title")}</h2>
            <p className="settings-block-intro">{tConjunto("intro")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="accent-blue" className="px-3" onClick={() => setConjuntoModal({ editing: null })}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              {tConjunto("new")}
            </Button>
          )}
        </div>

        {conjuntos.length === 0 ? (
          <p className="settings-structure-empty">{tConjunto("empty")}</p>
        ) : (
          <div className="settings-structure-accordion-list">
            {conjuntos.map((c) => (
              <div key={c.id} className="settings-structure-accordion">
                <div className="settings-structure-accordion-row">
                  <span className="settings-structure-accordion-name flex-1 min-w-0 truncate">{c.name}</span>
                  <span className="settings-structure-row-spacer" />
                  <span className="settings-structure-usage-count">
                    {tConjunto("itemCount", { count: c.items.length })}
                  </span>
                  {isAdmin && (
                    <span className="settings-item-actions settings-item-actions--static">
                      <button
                        type="button"
                        className="settings-item-icon-btn"
                        title={tc("edit")}
                        onClick={() => setConjuntoModal({ editing: c })}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="settings-item-icon-btn settings-item-icon-btn--danger"
                        title={tc("delete")}
                        onClick={() => setConjuntoDeleting(c)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                        </svg>
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="settings-divider" />

      <section className="settings-block">
        <div className="settings-block-subtitle-row">
          <div>
            <h2 className="settings-block-title">{tOrcamento("title")}</h2>
            <p className="settings-block-intro">{tOrcamento("intro")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="accent-blue" className="px-3" onClick={() => setOrcamentoModal({ editing: null })}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              {tOrcamento("new")}
            </Button>
          )}
        </div>

        {orcamentos.length === 0 ? (
          <p className="settings-structure-empty">{tOrcamento("empty")}</p>
        ) : (
          <div className="settings-structure-accordion-list">
            {orcamentos.map((o) => {
              const conjuntoName = conjuntos.find((c) => c.id === o.conjunto_estrutura_id)?.name;
              return (
                <div key={o.id} className="settings-structure-accordion">
                  <div className="settings-structure-accordion-row">
                    <span className="settings-structure-accordion-name flex-1 min-w-0 truncate">
                      {o.year} — {o.label}
                    </span>
                    <span className="settings-structure-row-spacer" />
                    {conjuntoName && <span className="settings-structure-usage-count">{conjuntoName}</span>}
                    <span className={`settings-structure-status-badge${o.status === "ativo" ? " is-active" : ""}`}>
                      {tOrcamento(`status_${o.status}`)}
                    </span>
                    {isAdmin && (
                      <span className="settings-item-actions settings-item-actions--static">
                        <button
                          type="button"
                          className="settings-item-icon-btn"
                          title={tc("edit")}
                          onClick={() => setOrcamentoModal({ editing: o })}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="settings-item-icon-btn settings-item-icon-btn--danger"
                          title={tc("delete")}
                          onClick={() => setOrcamentoDeleting(o)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && (
        <ConjuntoFormModal
          open={conjuntoModal !== null}
          onClose={() => setConjuntoModal(null)}
          dimensionTypes={dimensionTypes}
          structuresByType={structuresByType}
          editing={conjuntoModal?.editing ?? null}
          onSaved={() => {
            setConjuntoModal(null);
            router.refresh();
          }}
        />
      )}

      {isAdmin && (
        <ConfirmModal
          open={conjuntoDeleting !== null}
          onClose={() => {
            setConjuntoDeleting(null);
            setConjuntoDeleteError(null);
          }}
          title={tConjunto("deleteConfirmTitle")}
          body={
            conjuntoDeleting &&
            tConjunto.rich("deleteConfirmBody", {
              name: conjuntoDeleting.name,
              b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
            })
          }
          cancelLabel={tc("cancel")}
          confirmLabel={tc("delete")}
          loading={conjuntoDeleteLoading}
          loadingText={tc("saving")}
          onConfirm={handleConfirmDeleteConjunto}
          error={conjuntoDeleteError}
        />
      )}

      {isAdmin && (
        <OrcamentoFormModal
          open={orcamentoModal !== null}
          onClose={() => setOrcamentoModal(null)}
          conjuntos={conjuntos}
          editing={orcamentoModal?.editing ?? null}
          defaultYear={year}
          onSaved={() => {
            setOrcamentoModal(null);
            router.refresh();
          }}
        />
      )}

      {isAdmin && (
        <ConfirmModal
          open={orcamentoDeleting !== null}
          onClose={() => {
            setOrcamentoDeleting(null);
            setOrcamentoDeleteError(null);
          }}
          title={tOrcamento("deleteConfirmTitle")}
          body={
            orcamentoDeleting &&
            tOrcamento.rich("deleteConfirmBody", {
              label: orcamentoDeleting.label,
              b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
            })
          }
          cancelLabel={tc("cancel")}
          confirmLabel={tc("delete")}
          loading={orcamentoDeleteLoading}
          loadingText={tc("saving")}
          onConfirm={handleConfirmDeleteOrcamento}
          error={orcamentoDeleteError}
        />
      )}

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
        <ConfirmModal
          open={deleting !== null}
          onClose={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          title={t("dimensions.deleteConfirmTitle")}
          body={
            deleting &&
            t.rich("dimensions.deleteConfirmBody", {
              name: deleting.name,
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

      {isAdmin && (
        <StructureFormModal
          open={structureModal !== null}
          onClose={() => setStructureModal(null)}
          dimensionTypeId={structureModal?.type.id ?? ""}
          mode={structureModal?.mode ?? "create"}
          source={structureModal?.source ?? null}
          year={year}
          onSaved={(newStructureId) => {
            if (structureModal) {
              setExpandedStructureId((prev) => ({ ...prev, [structureModal.type.id]: newStructureId }));
            }
            setStructureModal(null);
            router.refresh();
          }}
        />
      )}

      {isAdmin && (
        <ConfirmModal
          open={structureDeleting !== null}
          onClose={() => {
            setStructureDeleting(null);
            setStructureDeleteError(null);
          }}
          title={t("dimensions.deleteStructureConfirmTitle")}
          body={
            structureDeleting &&
            t.rich("dimensions.deleteStructureConfirmBody", {
              name: structureDeleting.name,
              b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
            })
          }
          cancelLabel={tc("cancel")}
          confirmLabel={tc("delete")}
          loading={structureDeleteLoading}
          loadingText={tc("saving")}
          onConfirm={handleConfirmDeleteStructure}
          error={structureDeleteError}
        />
      )}

      {isAdmin && (
        <ConfirmModal
          open={structureDuplicating !== null}
          onClose={() => {
            setStructureDuplicating(null);
            setStructureDuplicateError(null);
          }}
          title={t("dimensions.duplicateStructureConfirmTitle")}
          body={
            structureDuplicating &&
            t.rich("dimensions.duplicateStructureConfirmBody", {
              name: structureDuplicating.source.name,
              b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
            })
          }
          cancelLabel={tc("cancel")}
          confirmLabel={t("dimensions.duplicateStructure")}
          confirmVariant="primary"
          loading={structureDuplicateLoading}
          loadingText={tc("saving")}
          onConfirm={handleConfirmDuplicateStructure}
          error={structureDuplicateError}
        />
      )}

      {isAdmin && importModal && (
        <ImportStructureModal
          open={importModal !== null}
          onClose={() => setImportModal(null)}
          dimensionType={importModal.type}
          structure={importModal.source}
          year={year}
          nodes={nodesByStructure[importModal.source.id] ?? []}
          onImported={() => router.refresh()}
        />
      )}

      <ConfirmModal
        open={nodeDeleting !== null}
        onClose={() => {
          setNodeDeleting(null);
          setNodeDeleteError(null);
        }}
        title={td("deleteConfirmTitle")}
        body={
          nodeDeleting &&
          td.rich("deleteConfirmBody", {
            name: nodeDeleting.node.name,
            year,
            b: (chunks) => <strong className="font-semibold text-gray-900">{chunks}</strong>,
          })
        }
        cancelLabel={tc("cancel")}
        confirmLabel={tc("delete")}
        loading={nodeDeleteLoading}
        loadingText={tc("saving")}
        onConfirm={handleConfirmDeleteNode}
        error={nodeDeleteError}
      />
    </div>
  );
}
