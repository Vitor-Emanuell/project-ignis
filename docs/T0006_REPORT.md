# Relatório Técnico e Homologação Humana — T0006 (Mapa Operacional, Regiões, Snapshot, Filtros R05, Disponibilidade R06 e Gate J01)

Data: **26/10/2026 (America/Sao_Paulo)** · Branch / Worktree: `t0006` (`C:\Users\Pichau\Desktop\t0006-worktree\project-ignis`), baseada em `edc1629e17c6ebbe8d9e63c5efa2957d38c27e36`

<a id="aceite-humano-t0006"></a>
## 1. Aceite Humano Final e Encerramento do Gate J01

Fonte humana inequívoca: instrução **“PROJECT IGNIS — Aceite humano e checkpoint T0006”** em 26/10/2026.

- **Estado do ticket T0006:** `DONE / HUMAN_ACCEPTED`
- **Estado do Gate J01:** `PASS / HUMAN_ACCEPTED`
- **Homologação funcional humana:** **7/7 cenários aprovados funcionalmente** em ambiente isolado (`http://127.0.0.1:3096`, dataset demo `7e0d4014-bdb2-42a4-9474-dece1ac117be`, banco descartável fora do controle de versão):
  - **Cenário 1 (`PASS funcional`):** Baseline `synthetic_baseline` criado na geração `1`, revisão `1`, contendo `20` equipamentos, `6` agentes, `15` pedidos e `6` recursos sem coordenadas. *(Observação não bloqueante de UX: o código HTTP `201` não é exibido literalmente na interface gráfica, que apresenta a confirmação textual, revisão e contagens.)*
  - **Cenário 2 (`PASS`):** Mapa operacional, cinco regiões GeoJSON (`REG-CENTRO`, `REG-NORTE`, `REG-SUL`, `REG-LESTE`, `REG-OESTE`), `20` marcadores posicionados e tabela de resumo regional consistente na mesma revisão.
  - **Cenário 3 (`PASS`):** Indicadores normativos `R06` (`85.71%` com `12` disponíveis em `14` elegíveis no baseline `20/6`) e tratamento explícito de denominador zero (`N/A (no_eligible_equipment)`).
  - **Cenário 4 (`PASS`):** Recursos sem coordenadas (`6` no baseline) visíveis na listagem operacional quando `bbox` está inativa e ocultados apenas quando filtro espacial `bbox` é aplicado, retornando ao limpar `bbox`.
  - **Cenário 5 (`PASS`):** Filtros combinados `R05` (`kind`, `categoryCode`, `operationalState`, `activity`, `criticality`, `regionId`, `bbox`) atualizando conjuntamente mapa, indicadores, resumo regional e lista na mesma revisão.
  - **Cenário 6 (`PASS`):** Inspeção cadastral de equipamentos e agentes acionada a partir do mapa/lista operacional.
  - **Cenário 7 (`PASS`):** Fallback vetorial local com marcadores e polígonos preservados, reenquadramento funcional, scroll da página estável e zoom controlado pelos botões.

---

## 2. Escopo Técnico Entregue e Reserva de Migration

1. **Migration `0005-regions-and-spatial.sql` (Schema `4` $\rightarrow$ `5`):**
   - Criação da tabela contextual `Region` com chaves compostas `(datasetId, epoch, id)`, geometria GeoJSON validada (`json_valid`), `bbox` numérica (`minLon <= maxLon`, `minLat <= maxLat`) e triggers de imutabilidade em gerações aposentadas (`retired`).
   - Evolução de `Resource`, `ResourceLocation` e `CurrentPosition` com colunas `regionId` e FKs contextuais compostas para `Region(datasetId, epoch, id)`.
   - Seed automático das 5 regiões administrativas municipais e backfill determinístico point-in-polygon para contextos existentes.
   - Backup consistente automático (`<DATABASE_PATH>.schema4-<UUID>.backup`) no upgrade de bancos schema `4` em [`store.ts`](../apps/server/src/persistence/store.ts).
   - **Reserva de migration preservada:** a migration `0006` permanece integralmente reservada para a `T0007` (pipeline de telemetria). As migrations `0001`–`0004` não foram modificadas.

2. **Operações Espaciais, Regiões e Snapshot (`apps/server/src/operations/`):**
   - [`regions.ts`](../apps/server/src/operations/regions.ts): catálogo das 5 regiões municipais, algoritmo determinístico *ray-casting* + detecção exata de aresta/vértice e desempate determinístico por `sortOrder ASC, code ASC`.
   - [`snapshot.ts`](../apps/server/src/operations/snapshot.ts): leitura transacional consistente (`BEGIN DEFERRED` na mesma revisão) para `GET /api/v1/datasets/:datasetId/epochs/:epoch/regions` e `GET /api/v1/datasets/:datasetId/epochs/:epoch/operations/snapshot`, aplicando os filtros combinados `R05`, truncamento explícito em `500` itens na coleção `resources` (preservando `indicators` e `regionSummary` sobre o conjunto filtrado completo) e cálculo normativo `R06`.
   - [`routes.ts`](../apps/server/src/operations/routes.ts): validação estrita de parâmetros de consulta (`400`/`422`), autenticação/sessão/grant contextual e rejeição de campos desconhecidos.

3. **Frontend Operacional (`apps/web/src/OperationalMap.vue`):**
   - Mapa interativo Leaflet (`1.9.4`, vendorizado localmente) com renderização dos 5 polígonos GeoJSON locais, marcadores diferenciados por tipo/estado, controles de filtro `R05`, cards de indicadores `R06`, tabela regional e lista de recursos com/sem coordenadas.
   - Fallback cartográfico local resiliente: remoção limpa de `tileLayer` externo em caso de erro/indisponibilidade, preservação da classe `.leaflet-container` sem interferência de `patchClass` do Vue, `scrollWheelZoom: false` para não capturar a rolagem da página e contenção estrita de dimensões (`26rem`, `overflow: hidden`, `contain: layout paint size`).

4. **Compatibilidade com `T0005`:**
   - [`apps/server/src/demo/engine.ts`](../apps/server/src/demo/engine.ts) mantido idêntico ao commit-base `edc1629e17c6ebbe8d9e63c5efa2957d38c27e36`.
   - Em [`apps/server/src/demo/service.ts`](../apps/server/src/demo/service.ts), normalização da projeção histórica do evento de criação (`registrationLocation.regionId: null`) sob `generatorVersion === 't5-baseline-v1'`, preservando os hashes canônicos `P` e os 58 testes de `T0005`.

---

## 3. Verificações Automatizadas Executadas

Ambiente: Windows / PowerShell, Node.js `24.22.1`, npm `11.19.1`, SQLite `3.53.4` (`foreign_keys = 1`, `journal_mode = wal`, `synchronous = 2`, `busy_timeout = 1000`).

| Comando | Resultado | Detalhes |
|---|---|---|
| `npm run typecheck` | **PASS** | `@ignis/server`, `@ignis/web` (`vue-tsc`) e `tsconfig.tests.json` sem erros |
| `npm run build` | **PASS** | Compilação de `@ignis/web` (Vite) e `@ignis/server` (`tsc`) concluída com sucesso |
| `npm run test:t0006` | **PASS** | **9/9 testes** em **3 arquivos** (`t0006-spatial-migration.test.ts`, `t0006-snapshot-j01.test.ts`, `t0006-ui.test.ts`) |
| `npm test` | **PASS** | **184/184 testes** em **20 arquivos** (`175` testes de `T0001`–`T0005` + `9` novos testes de `T0006`) |
| `git diff --check` | **PASS** | Sem erros de formatação ou marcadores de conflito |
