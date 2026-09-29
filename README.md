# Sistema Financeiro — FP&A SaaS

SaaS de orçamento matricial e gestão de despesas para pequenas e médias empresas.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + RLS + Storage)
- Vitest + Testing Library para testes unitários
- next-intl (preparado para múltiplos idiomas; hoje só pt-BR)

## Setup local

```bash
pnpm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
pnpm dev
```

## Banco de dados

As migrations estão em `supabase/migrations/`. Rode-as no SQL Editor do
Supabase (ou via `supabase db push`, se estiver usando a CLI) na ordem:

1. `0001_init.sql` — dimensões versionadas por ano (centro de custo, conta,
   entidade), matriz orçamentária, despesas, pacotes, tolerâncias,
   explicação de desvios, RLS multi-tenant.
2. `0002_user_preferences.sql` — preferências de tabela por usuário (usado
   pelo componente `DataTable`).

## Testes

```bash
pnpm test         # roda uma vez
pnpm test:watch   # modo watch
pnpm typecheck
pnpm lint
```

## Fluxo de branches

- `main` — produção.
- `develop` — integração. Toda feature nasce de um branch próprio e vira PR
  para `develop`.
- CI (`.github/workflows/ci.yml`) roda typecheck, lint, testes e build em
  todo PR para `main`/`develop`, e em todo push nesses branches.
- **Configuração pendente no GitHub** (não dá pra fazer via API com o
  acesso atual): em Settings → Branches, adicionar uma regra de proteção
  para `develop` (e depois `main`) exigindo que o check de CI passe antes
  do merge.

## Componentes reaproveitados

`src/components/ui/DataTable/`, `Button.tsx`, `Tooltip.tsx`, `Drawer.tsx`,
`Modal.tsx` e `src/hooks/useSingleExpand.ts` vieram do repositório
`desenhe-app`, copiados sem alteração de lógica.
