"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { ImportWizard } from "@/components/import/ImportWizard";
import { importDimensionNodes } from "../dimensoes/_actions";
import type { DimensionType, DimensionStructure, DimensionNodeRow } from "@/lib/dimensions/types";
import type { ImportLayoutConfig } from "@/lib/import/types";

interface ImportStructureModalProps {
  open: boolean;
  onClose: () => void;
  dimensionType: DimensionType;
  structure: DimensionStructure;
  year: number;
  /** Itens já carregados dessa Estrutura (vem de nodesByStructure, carregado
   * de uma vez só na página — ver renderStructureContent em
   * ConfiguracoesClient.tsx) — usados como opções do campo "item superior". */
  nodes: DimensionNodeRow[];
  /** Chamado após uma importação com pelo menos 1 linha bem-sucedida, pra
   * tela por trás revalidar os dados. */
  onImported: () => void;
}

/**
 * Assistente de importação de itens de dimensão, dentro de um Modal — antes
 * era uma página própria (/admin/dimensoes/[tipo]/importar), navegada a
 * partir do ícone "Importar" de cada Estrutura em Parâmetros. A usuária
 * pediu pra virar modal em 06/10 (claude/decisoes-arquitetura.md), pra não
 * sair da tela de Parâmetros. De quebra, a importação passou a saber pra
 * qual Estrutura ela está importando (antes caía sempre na Estrutura ATIVA
 * do tipo via resolveStructureId, o que ficou ambíguo desde que várias
 * Estruturas podem estar ativas ao mesmo tempo — ver migration 0014).
 */
export function ImportStructureModal({
  open,
  onClose,
  dimensionType,
  structure,
  year,
  nodes,
  onImported,
}: ImportStructureModalProps) {
  const t = useTranslations("dimensions.importFields");
  const tImport = useTranslations("import");

  const existingNodes = useMemo(
    () => nodes.map((n) => ({ id: n.id, code: n.code, name: n.name })),
    [nodes]
  );

  const layout: ImportLayoutConfig = useMemo(
    () => ({
      entityKey: "dimensoes",
      title: structure.name,
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
    [structure.name, existingNodes, t]
  );

  return (
    <Modal open={open} onClose={onClose} title={`${tImport("titlePrefix")} ${structure.name}`} size="xl">
      <ImportWizard
        layout={layout}
        onImport={(rows) =>
          importDimensionNodes({
            dimensionTypeId: dimensionType.id,
            structureId: structure.id,
            year,
            rows,
          })
        }
        onClose={onClose}
        onImported={onImported}
      />
    </Modal>
  );
}
