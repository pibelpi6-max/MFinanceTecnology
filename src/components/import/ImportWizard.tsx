"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { parseSpreadsheetFile } from "@/lib/import/parseFile";
import { suggestColumnMapping } from "@/lib/import/aiMapping";
import { buildAndValidateRows } from "@/lib/import/validateRows";
import { ImportStepIndicator } from "./ImportStepIndicator";
import { ColumnMappingFields } from "./ColumnMappingFields";
import { ImportGrid } from "./ImportGrid";
import type {
  ColumnMapping,
  ImportLayoutConfig,
  ImportRowResult,
  ImportRunSummary,
  ImportStep,
  ParsedSheet,
} from "@/lib/import/types";

interface ImportWizardProps {
  layout: ImportLayoutConfig;
  /** Pra onde voltar ao cancelar/concluir quando o assistente é uma página
   * própria (ver /admin/dimensoes/[tipo]/importar). Ignorado quando `onClose`
   * é passado — uso em modal (ver ImportStructureModal), que não navega. */
  backHref?: string;
  onImport: (rows: { values: Record<string, string> }[]) => Promise<ImportRunSummary>;
  /** Quando fornecido, usado em vez de navegar pra `backHref` ao cancelar ou
   * concluir — é como o assistente roda dentro de um Modal em vez de rota
   * própria (pedido da usuária em 06/10, ver claude/decisoes-arquitetura.md). */
  onClose?: () => void;
  /** Chamado uma vez, logo após uma importação bem-sucedida (step vira
   * "done") — pra quem está ouvindo (ex: a tela por trás do modal) puder
   * revalidar os dados sem esperar a usuária fechar o assistente. */
  onImported?: () => void;
}

export function ImportWizard({ layout, backHref, onImport, onClose, onImported }: ImportWizardProps) {
  const t = useTranslations("import");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<ImportStep>("upload");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<ImportRowResult[]>([]);
  const [summary, setSummary] = useState<ImportRunSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMapping, setIsMapping] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const requiredKeysUnmapped = useMemo(() => {
    const mappedKeys = new Set(mapping.map((m) => m.targetKey).filter(Boolean));
    return layout.fields.filter((f) => f.required && !mappedKeys.has(f.key));
  }, [mapping, layout.fields]);

  async function handleFile(file: File) {
    setUploadError(null);
    setIsMapping(true);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setSheet(parsed);
      const suggested = await suggestColumnMapping(parsed.headers, parsed.rows, layout.fields);
      setMapping(suggested);
      setStep("mapping");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t("upload.genericError"));
    } finally {
      setIsMapping(false);
    }
  }

  function handleMappingChange(columnIndex: number, targetKey: string | null) {
    setMapping((prev) => {
      const withoutClaim = targetKey
        ? prev.map((m) => (m.targetKey === targetKey ? { ...m, targetKey: null, confidence: 0 } : m))
        : prev;
      return withoutClaim.map((m) => (m.columnIndex === columnIndex ? { ...m, targetKey, confidence: 1 } : m));
    });
  }

  function goToReview() {
    if (!sheet) return;
    const built = buildAndValidateRows(sheet.rows, mapping, layout.fields);
    setRows(built);
    setStep("review");
  }

  function toggleSkip(rowIndex: number) {
    setRows((prev) => prev.map((r) => (r.rowIndex === rowIndex ? { ...r, skip: !r.skip } : r)));
  }

  const readyRows = rows.filter((r) => !r.skip && Object.keys(r.errors).length === 0);
  const errorRows = rows.filter((r) => !r.skip && Object.keys(r.errors).length > 0);
  const skippedRows = rows.filter((r) => r.skip);

  function runImport() {
    setIsImporting(true);
    startTransition(async () => {
      try {
        const result = await onImport(readyRows.map((r) => ({ values: r.values })));
        setSummary(result);
        setStep("done");
        if (result.successCount > 0) onImported?.();
      } finally {
        setIsImporting(false);
      }
    });
  }

  function goBack() {
    if (onClose) onClose();
    else if (backHref) router.push(backHref);
  }

  return (
    <div className="import-wizard">
      <ImportStepIndicator current={step} />

      {step === "upload" && (
        <div className="import-upload-zone">
          <label className="import-dropzone">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="import-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              onDragOver={(e) => e.preventDefault()}
              disabled={isMapping}
            />
            {isMapping ? (
              <p>{t("upload.mappingInProgress")}</p>
            ) : (
              <>
                <p className="import-dropzone-title">{t("upload.dropzoneTitle")}</p>
                <p className="import-dropzone-hint">{t("upload.dropzoneHint")}</p>
              </>
            )}
          </label>
          {uploadError && <p className="import-error-banner">{uploadError}</p>}
          <button type="button" className="import-link-btn" onClick={goBack}>
            {t("cancel")}
          </button>
        </div>
      )}

      {step === "mapping" && sheet && (
        <div className="import-step-body">
          <p className="import-step-hint">{t("mapping.hint")}</p>
          <ColumnMappingFields sheet={sheet} fields={layout.fields} mapping={mapping} onChange={handleMappingChange} />
          {requiredKeysUnmapped.length > 0 && (
            <p className="import-error-banner">
              {t("mapping.missingRequired", { fields: requiredKeysUnmapped.map((f) => f.label).join(", ") })}
            </p>
          )}
          <div className="import-step-actions">
            <button type="button" className="import-link-btn" onClick={() => setStep("upload")}>
              {t("back")}
            </button>
            <Button onClick={goToReview} disabled={requiredKeysUnmapped.length > 0}>
              {t("continue")}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="import-step-body">
          <div className="import-review-summary">
            <span>{t("review.total", { count: rows.length })}</span>
            <span className="import-status-tag import-status-ok">{t("review.readyCount", { count: readyRows.length })}</span>
            {errorRows.length > 0 && (
              <span className="import-status-tag import-status-error">{t("review.errorCount", { count: errorRows.length })}</span>
            )}
            {skippedRows.length > 0 && (
              <span className="import-status-tag import-status-skipped">{t("review.skippedCount", { count: skippedRows.length })}</span>
            )}
          </div>
          <ImportGrid rows={rows} fields={layout.fields} onToggleSkip={toggleSkip} />
          <div className="import-step-actions">
            <button type="button" className="import-link-btn" onClick={() => setStep("mapping")}>
              {t("back")}
            </button>
            <Button onClick={runImport} isLoading={isImporting || isPending} disabled={readyRows.length === 0}>
              {t("review.importButton", { count: readyRows.length })}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && summary && (
        <div className="import-step-body">
          <div className="import-done-banner">
            <p className="import-done-title">{t("done.title", { count: summary.successCount })}</p>
            {summary.errorCount > 0 && <p className="import-done-subtitle">{t("done.someFailed", { count: summary.errorCount })}</p>}
          </div>
          {summary.errors.length > 0 && (
            <ul className="import-done-errors">
              {summary.errors.map((err, i) => (
                <li key={i}>
                  {t("done.rowLabel", { row: err.rowIndex + 1 })}: {err.message}
                </li>
              ))}
            </ul>
          )}
          <div className="import-step-actions">
            <Button variant="secondary" onClick={goBack}>
              {t("done.backToScreen")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
