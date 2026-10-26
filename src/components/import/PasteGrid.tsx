"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";

const MIN_COLS = 6;
const MIN_ROWS = 8;

function colLetter(i: number): string {
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Quebra o texto copiado do Excel/Google Sheets (TSV, com aspas) em linhas × colunas. */
export function parseClipboardText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

interface PasteGridProps {
  matrix: string[][];
  onChange: (matrix: string[][]) => void;
  error?: string | null;
  onClear: () => void;
}

/** Grade estilo planilha: cole (Ctrl+V) direto do Excel/Google Sheets ou edite célula a célula. A 1ª linha são os cabeçalhos. */
export function PasteGrid({ matrix, onChange, error, onClear }: PasteGridProps) {
  const t = useTranslations("import");
  const setMatrix = (update: (prev: string[][]) => string[][]) => onChange(update(matrix));
  const gridRef = useRef<HTMLDivElement>(null);

  const cols = useMemo(() => Math.max(MIN_COLS, ...matrix.map((r) => r.length)), [matrix]);
  const rowCount = Math.max(MIN_ROWS, matrix.length + 1);
  const hasData = matrix.some((r) => r.some((c) => c.trim() !== ""));

  function setCell(r: number, c: number, value: string) {
    setMatrix((prev) => {
      const next = prev.map((row) => row.slice());
      while (next.length <= r) next.push([]);
      while (next[r].length <= c) next[r].push("");
      next[r][c] = value;
      return next;
    });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n\r]/.test(text)) return; // texto simples: deixa o input colar normalmente
    e.preventDefault();
    const pasted = parseClipboardText(text);
    if (pasted.length > 1 && pasted[pasted.length - 1].every((x) => x === "")) pasted.pop();
    setMatrix((prev) => {
      const next = prev.map((row) => row.slice());
      pasted.forEach((line, i) => {
        const rr = r + i;
        while (next.length <= rr) next.push([]);
        line.forEach((val, j) => {
          const cc = c + j;
          while (next[rr].length <= cc) next[rr].push("");
          next[rr][cc] = val;
        });
      });
      return next;
    });
  }

  function focusCell(r: number, c: number) {
    gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus();
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); focusCell(r + 1, c); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(Math.max(0, r - 1), c); }
    else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) focusCell(r, c + 1);
    else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) focusCell(r, Math.max(0, c - 1));
  }

  function clear() {
    onClear();
  }

  return (
    <div className="import-paste">
      <div className="import-paste-head">
        <p className="import-paste-hint">{t("upload.pasteHint")}</p>
        <div className="import-paste-actions">
          {hasData && (
            <button type="button" className="import-link-btn" onClick={clear}>
              {t("upload.clearGrid")}
            </button>
          )}
        </div>
      </div>
      {error && <p className="import-error-banner">{error}</p>}
      <div className="import-paste-scroll" ref={gridRef}>
        <table className="import-paste-table">
          <thead>
            <tr>
              <th className="import-paste-corner" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c}>{colLetter(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, r) => (
              <tr key={r}>
                <th className="import-paste-rownum">{r + 1}</th>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className={r === 0 ? "is-header-row" : undefined}>
                    <input
                      data-cell={`${r}:${c}`}
                      value={matrix[r]?.[c] ?? ""}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      onPaste={(e) => handlePaste(e, r, c)}
                      onKeyDown={(e) => handleKey(e, r, c)}
                      spellCheck={false}
                      aria-label={`${colLetter(c)}${r + 1}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
