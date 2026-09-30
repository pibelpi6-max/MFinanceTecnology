"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ImportWizard } from "@/components/import/ImportWizard";
import { importMatrixEntries } from "../_actions";
import type { ImportLayoutConfig } from "@/lib/import/types";

interface NodeOption {
  id: string;
  code: string;
  name: string;
}

interface ImportMatrizClientProps {
  referenceYear: number;
  accountNodes: NodeOption[];
  costCenterNodes: NodeOption[];
  entityNodes: NodeOption[];
}

export function ImportMatrizClient({ referenceYear, accountNodes, costCenterNodes, entityNodes }: ImportMatrizClientProps) {
  const t = useTranslations("import.matrizFields");

  const layout: ImportLayoutConfig = useMemo(
    () => ({
      entityKey: "matriz",
      title: t("title"),
      description: t("description", { year: referenceYear }),
      fields: [
        {
          key: "entidade",
          label: t("entidade"),
          type: "node-ref",
          required: true,
          aliases: ["entidade", "unidade"],
          options: entityNodes.map((n) => ({ value: n.id, label: n.name, code: n.code })),
        },
        {
          key: "centro_custo",
          label: t("centroCusto"),
          type: "node-ref",
          required: true,
          aliases: ["centro de custo", "centro custo", "cost center", "cc"],
          options: costCenterNodes.map((n) => ({ value: n.id, label: n.name, code: n.code })),
        },
        {
          key: "conta",
          label: t("conta"),
          type: "node-ref",
          required: true,
          aliases: ["conta", "account"],
          options: accountNodes.map((n) => ({ value: n.id, label: n.name, code: n.code })),
        },
        {
          key: "ano",
          label: t("ano"),
          type: "number",
          required: true,
          aliases: ["ano", "year"],
          validateExtra: (raw) => {
            const n = Number(raw);
            return Number.isInteger(n) && n >= 2000 && n <= 2100 ? null : t("anoInvalid");
          },
        },
        {
          key: "mes",
          label: t("mes"),
          type: "number",
          required: true,
          aliases: ["mes", "mês", "month"],
          validateExtra: (raw) => {
            const n = Number(raw);
            return Number.isInteger(n) && n >= 1 && n <= 12 ? null : t("mesInvalid");
          },
        },
        { key: "valor", label: t("valor"), type: "number", required: true, aliases: ["valor", "amount", "value"] },
      ],
    }),
    [t, referenceYear, entityNodes, costCenterNodes, accountNodes]
  );

  return (
    <ImportWizard
      layout={layout}
      backHref={`/admin/orcamento/matriz?ano=${referenceYear}`}
      onImport={(rows) => importMatrixEntries({ rows })}
    />
  );
}
