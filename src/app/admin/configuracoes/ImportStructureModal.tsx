"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
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

  const [fullscreen, setFullscreen] = useState(false);
  // Tela cheia de verdade: além de o modal cobrir o sistema, o navegador sai
  // do modo janela (esconde barra de endereço/abas) via Fullscreen API.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (!fullscreen) {
      setFullscreen(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      setFullscreen(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }

  function handleClose() {
    setFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onClose();
  }

  const existingRoot = useMemo(() => nodes.find((n) => n.parentNodeId === null) ?? null, [nodes]);

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
          batchRefKeys: ["codigo", "nome"],
          maxEmptyRows: existingRoot ? 0 : 1,
          emptyRowsLimitMessage: existingRoot
            ? `Esta estrutura já tem o item de nível 1 "${existingRoot.name}". Preencha o Item Superior com "${existingRoot.name}" (ou o código ${existingRoot.code}) para colocar este item dentro dele.`
            : "Só um item pode ficar sem Item Superior (o nível 1 da estrutura). Preencha o Item Superior desta linha.",
        },
      ],
    }),
    [structure.name, existingNodes, existingRoot, t]
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`${tImport("titlePrefix")} ${structure.name}`}
      size={fullscreen ? "screen" : "full"}
      fullBleed={fullscreen}
    >
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
        toolbarRight={
          <Button size="sm" variant="accent-blue" className="px-3" onClick={toggleFullscreen}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              {fullscreen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              )}
            </svg>
            {fullscreen ? tImport("review.exitFullscreen") : tImport("review.fullscreen")}
          </Button>
        }
        onClose={handleClose}
        onImported={onImported}
      />
    </Modal>
  );
}
