"use client";

import * as XLSX from "xlsx";
import type { ParsedSheet } from "./types";

/**
 * Lê um arquivo .csv/.xlsx/.xls e devolve cabeçalho + linhas como texto.
 * A primeira linha não-vazia é tratada como cabeçalho (planilhas
 * exportadas às vezes têm um título ou linhas em branco antes da
 * tabela de verdade); linhas totalmente vazias são descartadas.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", codepage: 65001 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("A planilha não tem nenhuma aba.");
  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  return matrixToSheet(matrix, file.name);
}

function matrixToSheet(matrix: unknown[][], fileName: string): ParsedSheet {
  const rows = matrix
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []))
    .filter((row) => row.some((cell) => cell !== ""));

  if (rows.length === 0) throw new Error("Não encontrei nenhuma linha com dados nessa planilha.");

  const [rawHeader, ...dataRows] = rows;
  const seen = new Map<string, number>();
  const headers = rawHeader.map((h, i) => {
    const base = h || `Coluna ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const width = headers.length;
  const normalizedRows = dataRows.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded;
  });

  return { headers, rows: normalizedRows, fileName };
}
