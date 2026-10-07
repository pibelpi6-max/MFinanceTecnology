"use client";

import type { ReactNode } from "react";
import { TreeExpand } from "./TreeExpand";
import { TreeGuides } from "./TreeGuides";

/**
 * Linha de item de árvore editável — extraído em 07/10 a partir do
 * `renderNodeRow` de Parâmetros (árvore de itens de dimensão), a pedido da
 * usuária pra reusar o mesmo padrão de interação em outras árvores do
 * sistema: nome com duplo clique pra editar, botão "+" de adicionar filho
 * colado ao nome (só aparece no hover), lápis/lixeira nas ações (também só
 * no hover), e edição inline (vira um mini-formulário [código][nome] +
 * salvar/cancelar na própria linha, sem popup).
 *
 * Componente de apresentação puro — não sabe nada de dados nem de recursão.
 * Quem chama (ex: ConfiguracoesClient.tsx) continua responsável por:
 *  - percorrer a árvore e desenhar um TreeItemRow por nó (+ um wrapper pros
 *    filhos, quando `hasChildren && isOpen`);
 *  - guardar qual nó está em edição (só um por vez) e os valores dos campos;
 *  - chamar a action de salvar/excluir/criar filho.
 *
 * Qualquer uma das ações (`onAddChild`, `onEdit`, `onDelete`) pode ser
 * omitida pra escondê-la — por exemplo, uma árvore read-only passaria só
 * `name`/`hasChildren`/`isOpen`/`onToggleExpand`, sem nenhuma das três.
 */
export interface TreeItemRowProps {
  /** Guias de indentação da árvore — mesmas props que `TreeGuides` espera. */
  ancestorContinues: boolean[];
  isLast: boolean;
  depth: number;
  hasChildren: boolean;
  isOpen: boolean;
  onToggleExpand: () => void;
  expandLabel?: string;

  name: string;
  /** Duplo clique no nome — normalmente abre a edição inline. */
  onDoubleClickName?: () => void;

  /** Botão "+" colado ao nome, só visível no hover da linha. Omitir esconde. */
  onAddChild?: () => void;
  addDisabled?: boolean;
  addLabel?: string;

  /** Ações no grupo à direita (só aparecem no hover). Omitir uma esconde só ela. */
  onEdit?: () => void;
  editLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;

  /** Edição inline: troca a linha inteira pelo mini-formulário. */
  isEditing: boolean;
  editCode: string;
  onEditCodeChange: (value: string) => void;
  editName: string;
  onEditNameChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  editLoading?: boolean;
  editError?: string | null;
  codePlaceholder?: string;
  namePlaceholder?: string;
  saveLabel?: string;
  cancelLabel?: string;

  /** Conteúdo extra à direita do nome, antes do botão "+" (ex: badge). */
  trailingName?: ReactNode;
}

export function TreeItemRow({
  ancestorContinues,
  isLast,
  depth,
  hasChildren,
  isOpen,
  onToggleExpand,
  expandLabel,
  name,
  onDoubleClickName,
  onAddChild,
  addDisabled,
  addLabel,
  onEdit,
  editLabel,
  onDelete,
  deleteLabel,
  isEditing,
  editCode,
  onEditCodeChange,
  editName,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  editLoading,
  editError,
  codePlaceholder,
  namePlaceholder,
  saveLabel,
  cancelLabel,
  trailingName,
}: TreeItemRowProps) {
  const expandToggle = hasChildren ? (
    <TreeExpand isOpen={isOpen} onToggle={onToggleExpand} label={expandLabel} />
  ) : (
    <span className="tree-expand-spacer" />
  );

  if (isEditing) {
    return (
      <>
        <div className="settings-item-row settings-item-row--editing">
          <TreeGuides ancestorContinues={ancestorContinues} isLast={isLast} depth={depth} />
          {expandToggle}
          <input
            value={editCode}
            onChange={(e) => onEditCodeChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            placeholder={codePlaceholder}
            autoFocus
            disabled={editLoading}
            className="settings-item-edit-input settings-item-edit-input--code"
          />
          <input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            placeholder={namePlaceholder}
            disabled={editLoading}
            className="settings-item-edit-input settings-item-edit-input--name"
          />
          <span className="settings-item-actions settings-item-actions--static">
            <button
              type="button"
              className="settings-item-icon-btn"
              title={saveLabel}
              disabled={editLoading}
              onClick={onSaveEdit}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            <button
              type="button"
              className="settings-item-icon-btn"
              title={cancelLabel}
              disabled={editLoading}
              onClick={onCancelEdit}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
        {editError && <p className="mt-1 px-2 text-xs text-red-600">{editError}</p>}
      </>
    );
  }

  return (
    <div className="settings-item-row">
      <TreeGuides ancestorContinues={ancestorContinues} isLast={isLast} depth={depth} />
      {expandToggle}
      <span className="settings-item-name-wrap">
        <span className="settings-item-name" onDoubleClick={onDoubleClickName}>
          {name}
        </span>
        {trailingName}
        {onAddChild && (
          <button
            type="button"
            className="settings-item-icon-btn settings-item-add-inline"
            title={addLabel}
            disabled={addDisabled}
            onClick={onAddChild}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </span>
      <span className="settings-structure-row-spacer" />
      {(onEdit || onDelete) && (
        <span className="settings-item-actions">
          {onEdit && (
            <button type="button" className="settings-item-icon-btn" title={editLabel} onClick={onEdit}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49a1.75 1.75 0 1 1 2.47 2.47L7.5 18.79l-3.3.82.82-3.3Z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="settings-item-icon-btn settings-item-icon-btn--danger"
              title={deleteLabel}
              onClick={onDelete}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
              </svg>
            </button>
          )}
        </span>
      )}
    </div>
  );
}
