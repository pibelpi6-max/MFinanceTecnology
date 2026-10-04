export interface TenantSettings {
  fiscalYearStartMonth: number;
  /** Módulo que fornece os eixos extras da Matriz Orçamentária (null = nenhum, comportamento padrão). */
  matrizModuleId: string | null;
}
