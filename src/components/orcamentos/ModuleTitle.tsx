import { getOrcamentoModule } from "@/lib/orcamentos/modules";

/** Título de módulo com o mesmo ícone do card do mapa. */
export function ModuleTitle({ slug, title }: { slug: string; title?: string }) {
  const mod = getOrcamentoModule(slug);
  return (
    <div className="orc-module-title">
      {mod && (
        <span className="orc-module-title-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={mod.icon} />
          </svg>
        </span>
      )}
      <h1 className="admin-page-title">{title ?? mod?.title}</h1>
    </div>
  );
}
