"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ImportWizard } from "@/components/import/ImportWizard";
import { importDimensionNodes } from "../../_actions";
import type { ImportLayoutConfig } from "@/lib/import/types";

interface ImportDimensaoClientProps {
  dimensionTypeId: string;
  dimensionTypeName: string;
  year: number;
  tipo: string;
  existingNodes: { id: string; code: string; name: string }[];
}

export function ImportDimensaoClient({
  dimensionTypeId,
  dimensionTypeName,
  year,
  tipo,
  existingNodes,
}: ImportDimensaoClientProps) {
  const t = useTranslations("dimensions.importFields");

  const layout: ImportLayoutConfig = useMemo(
    () => ({
      entityKey: "dimensoes",
      title: dimensionTypeName,
      fields: [
        { key: "codigo", label: t("code"), type: "text", required: true, aliases: ["codigo", "código", "code", "cod"] },
        { key: "nome", label: t("name"), type: "text", required: true, aliases: ["nome", "name", "descricao", "descrição"] },
        {
          key: "item_superior",
          label: t("parent"),
          type: "node-ref",
          required: false,
          aliases: ["item superior", "pai", "parent", "superior"],
          options: existingNodes.map((n) => ({ value: n.id, label: n.name, code: n.code })),
          helpText: t("parentHelp"),
        },
      ],
    }),
    [dimensionTypeName, existingNodes, t]
  );

  return (
    <ImportWizard
      layout={layout}
      backHref={`/admin/dimensoes/${tipo}?ano=${year}`}
      onImport={(rows) => importDimensionNodes({ dimensionTypeId, year, rows })}
    />
  );
}
