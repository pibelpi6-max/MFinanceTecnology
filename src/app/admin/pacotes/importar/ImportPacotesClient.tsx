"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ImportWizard } from "@/components/import/ImportWizard";
import { importPackages } from "../_actions";
import type { ImportLayoutConfig } from "@/lib/import/types";
import { DIMENSION_CODES } from "@/lib/dimensions/constants";

interface NodeOption {
  id: string;
  code: string;
  name: string;
}

interface ImportPacotesClientProps {
  year: number;
  packageLabelPlural: string;
  costCenterNodes: NodeOption[];
  entityNodes: NodeOption[];
}

export function ImportPacotesClient({ year, packageLabelPlural, costCenterNodes, entityNodes }: ImportPacotesClientProps) {
  const t = useTranslations("import.pacotesFields");

  const layout: ImportLayoutConfig = useMemo(
    () => ({
      entityKey: "pacotes",
      title: packageLabelPlural,
      description: t("description", { year }),
      fields: [
        { key: "nome", label: t("nome"), type: "text", required: true, aliases: ["nome", "name", "pacote"] },
        {
          key: DIMENSION_CODES.CENTRO_CUSTO,
          label: t("centroCusto"),
          type: "node-ref",
          required: false,
          aliases: ["centro de custo", "centro custo", "cost center", "cc"],
          options: costCenterNodes.map((n) => ({ value: n.id, label: n.name, code: n.code })),
        },
        {
          key: DIMENSION_CODES.ENTIDADE,
          label: t(DIMENSION_CODES.ENTIDADE),
          type: "node-ref",
          required: false,
          aliases: [DIMENSION_CODES.ENTIDADE, "unidade"],
          options: entityNodes.map((n) => ({ value: n.id, label: n.name, code: n.code })),
        },
      ],
    }),
    [t, year, packageLabelPlural, costCenterNodes, entityNodes]
  );

  return (
    <ImportWizard
      layout={layout}
      backHref={`/admin/pacotes?ano=${year}`}
      onImport={(rows) => importPackages({ year, rows })}
    />
  );
}
