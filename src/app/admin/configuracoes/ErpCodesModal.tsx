"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { parseErpCodes } from "@/lib/dimensions/erpCodes";
import { saveNodeErpCodes } from "./_codeActions";

interface ErpCodesModalProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  nodeName: string;
  initialCodes: string[];
  year: number;
  onSaved: () => void;
}

/** Códigos do ERP de um item do último nível: um por linha (ou separados
 * por vírgula/;), vários por item. Aceita colar direto de uma planilha. */
export function ErpCodesModal({ open, onClose, nodeId, nodeName, initialCodes, year, onSaved }: ErpCodesModalProps) {
  const t = useTranslations("erpCodes");
  const tc = useTranslations("common");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialCodes.join("\n"));
    setError(null);
  }, [open, initialCodes]);

  const count = parseErpCodes(text).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await saveNodeErpCodes({ nodeId, codes: text, year });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title")}
      subtitle={nodeName}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="erp-codes-form" isLoading={loading} loadingText={tc("saving")}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="erp-codes-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-gray-500">{t("hint")}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          autoFocus
          placeholder={t("placeholder")}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-xs text-gray-400">{t("count", { count })}</p>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
