"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { parseSpreadsheetFile } from "@/lib/import/parseFile";
import { suggestColumnMapping } from "@/lib/import/aiMapping";
import { applyBatchDependencies, buildAndValidateRows } from "@/lib/import/validateRows";
import { ImportStepIndicator } from "./ImportStepIndicator";
import { ColumnMappingFields } from "./ColumnMappingFields";
import { ImportGrid } from "./ImportGrid";
import { ImportTreeGrid } from "./ImportTreeGrid";
import { setCellValue } from "@/lib/import/editRows";
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
  /** Ação à direita, na altura dos passos (ex.: botão "Tela cheia"). */
  toolbarRight?: React.ReactNode;
}

export function ImportWizard({ layout, backHref, onImport, onClose, onImported, toolbarRight }: ImportWizardProps) {
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

  const hierarchical = layout.fields.some((f) => f.type === "node-ref" && f.batchRefKeys?.length);
  const refField = layout.fields.find((f) => f.type === "node-ref" && f.batchRefKeys?.length);

  function rebuild(sheetRows: string[][], mappingNow: ColumnMapping[], skipped: Set<number>) {
    return applyBatchDependencies(buildAndValidateRows(sheetRows, mappingNow, layout.fields, skipped), layout.fields);
  }

  function goToReview() {
    if (!sheet) return;
    setRows(rebuild(sheet.rows, mapping, new Set()));
    setStep("review");
  }

  function currentSkipped(): Set<number> {
    return new Set(rows.filter((r) => r.skip).map((r) => r.rowIndex));
  }

  function toggleSkip(rowIndex: number) {
    if (!sheet) return;
    const skipped = currentSkipped();
    if (skipped.has(rowIndex)) skipped.delete(rowIndex);
    else skipped.add(rowIndex);
    setRows(rebuild(sheet.rows, mapping, skipped));
  }

  /** Edita uma célula na revisão (código, nome ou item superior) e revalida tudo. */
  function editCell(rowIndex: number, key: string, value: string) {
    if (!sheet) return;
    const next = setCellValue(sheet, mapping, layout.fields, rowIndex, key, value);
    setSheet(next.sheet);
    setMapping(next.mapping);
    setRows(rebuild(next.sheet.rows, next.mapping, currentSkipped()));
  }

  /** Salva de uma vez os campos editados de uma linha (lápis na revisão). */
  function editRow(rowIndex: number, values: Record<string, string>) {
    if (!sheet) return;
    let next = { sheet, mapping };
    // código/nome antes do item superior, para a troca de código acompanhar os filhos
    const order = Object.keys(values).sort((a) => (a === refField?.key ? 1 : -1));
    for (const key of order) next = setCellValue(next.sheet, next.mapping, layout.fields, rowIndex, key, values[key]);
    setSheet(next.sheet);
    setMapping(next.mapping);
    setRows(rebuild(next.sheet.rows, next.mapping, currentSkipped()));
  }

  /** Arrastar e soltar: coloca a linha dentro de outra (pelo código dela) ou, com null, tira o item superior. */
  function moveRow(rowIndex: number, newParentRowIndex: number | null) {
    if (!refField?.batchRefKeys) return;
    const parentCode = newParentRowIndex === null ? "" : (rows[newParentRowIndex]?.rawValues[refField.batchRefKeys[0]] ?? "");
    if (newParentRowIndex !== null && !parentCode) return;
    editCell(rowIndex, refField.key, parentCode);
  }

  const readyRows = rows.filter((r) => !r.skip && Object.keys(r.errors).length === 0);
  const errorRows = rows.filter((r) => !r.skip && Object.keys(r.errors).length > 0);
  const skippedRows = rows.filter((r) => r.skip);

  function runImport() {
    setIsImporting(true);
    startTransition(async () => {
      try {
        const result = await onImport(readyRows.map((r) => ({ values: r.values })));
        // A Server Action devolve o índice dentro das linhas enviadas; mostra
        // o número da linha da planilha (o mesmo "#" da tela de revisão).
        setSummary({
          ...result,
          errors: result.errors.map((e) => ({ ...e, rowIndex: readyRows[e.rowIndex]?.rowIndex ?? e.rowIndex })),
        });
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
    <div className={`import-wizard${toolbarRight ? " import-wizard--wide" : ""}`}>
      {toolbarRight ? (
        <div className="import-toolbar">
          <div />
          <ImportStepIndicator current={step} />
          <div className="import-toolbar-right">{step === "mapping" || (step === "review" && hierarchical) ? null : toolbarRight}</div>
        </div>
      ) : (
        <ImportStepIndicator current={step} />
      )}

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
          <div className="import-step-hint-row">
            <p className="import-step-hint">{t("mapping.hint")}</p>
            {toolbarRight}
          </div>
          <ColumnMappingFields sheet={sheet} fields={layout.fields} mapping={mapping} onChange={handleMappingChange} />
          {requiredKeysUnmapped.length > 0 && (
            <p className="import-error-banner">
              {t("mapping.missingRequired", { fields: requiredKeysUnmapped.map((f) => f.label).join(", ") })}
            </p>
          )}
          <div className="import-step-actions">
            <Button size="sm" variant="secondary" onClick={() => setStep("upload")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0 7-7m-7 7h18" />
              </svg>
              {t("back")}
            </Button>
            <Button size="sm" onClick={goToReview} disabled={requiredKeysUnmapped.length > 0}>
              {t("continue")}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0-7 7m7-7H3" />
              </svg>
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="import-step-body">
          {!hierarchical && (
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
          )}
          {hierarchical ? (
            <ImportTreeGrid
              rows={rows}
              fields={layout.fields}
              onToggleSkip={toggleSkip}
              onEditRow={editRow}
              onMoveRow={moveRow}
              counts={{ ready: readyRows.length, errors: errorRows.length, skipped: skippedRows.length }}
              toolbarAction={toolbarRight}
            />
          ) : (
            <ImportGrid rows={rows} fields={layout.fields} onToggleSkip={toggleSkip} />
          )}
          <div className={`import-step-actions${hierarchical ? " import-step-actions--divided" : ""}`}>
            <Button size="sm" variant="secondary" onClick={() => setStep("mapping")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0 7-7m-7 7h18" />
              </svg>
              {t("back")}
            </Button>
            <Button size="sm" onClick={runImport} isLoading={isImporting || isPending} disabled={readyRows.length === 0}>
              {hierarchical && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
              {hierarchical ? t("review.importCount", { count: readyRows.length }) : t("review.importButton", { count: readyRows.length })}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && summary && (
        <div className="import-step-body">
          <div className="import-done-banner">
            <p className="import-done-title">{t("done.title", { count: summary.successCount })}</p>
            {summary.detail && <p className="import-done-subtitle">{summary.detail}</p>}
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
