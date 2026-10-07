"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Título curto do modal (ex: "Excluir estrutura", "Encerrar vigência"). */
  title: ReactNode;
  /**
   * Corpo da confirmação — já resolvido pelo chamador via `t.rich(...)`, pra
   * manter este componente agnóstico de i18n (cada tela usa seu próprio
   * namespace/translator). Convenção do sistema: uma pergunta só, concisa,
   * com o nome do item em negrito — ver `deleteConfirmBody` em qualquer um
   * dos namespaces de settings.* como exemplo.
   */
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** "danger" (padrão) para ações destrutivas/irreversíveis; "primary" para
   * ações seguras que só pedem confirmação (ex: duplicar). */
  confirmVariant?: "danger" | "primary";
  loading?: boolean;
  loadingText?: string;
  /** Erro da última tentativa (ex: falha ao salvar no servidor). */
  error?: string | null;
}

/**
 * Modal de confirmação padrão do sistema — extraído em 07/10 a partir do
 * padrão repetido à mão em ~6 lugares de Parâmetros (excluir tipo, excluir
 * estrutura, duplicar estrutura, excluir item da árvore, excluir conjunto,
 * excluir orçamento), a pedido da usuária pra reusar o mesmo padrão em
 * outras telas do sistema. Sempre size="sm", uma única pergunta no corpo
 * (sem texto extra de explicação) e o nome do item em negrito — ver
 * `ConfirmModal.test.tsx` ou qualquer um dos usos em ConfiguracoesClient.tsx
 * pro formato esperado do `body`.
 */
export function ConfirmModal({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  confirmVariant = "danger",
  loading = false,
  loadingText,
  error,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} isLoading={loading} loadingText={loadingText} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{body}</p>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
