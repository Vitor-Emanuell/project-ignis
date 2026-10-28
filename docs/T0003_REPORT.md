# T0003 — Relatório de implementação da primeira jornada do inventário

Data: **24/10/2026, horário de Brasília**. Autorização humana: “IGNIS — T0003 | Implementação da Primeira Jornada do Inventário Inteligente”, posterior ao [gate funcional aprovado](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional) e à ratificação T03-C. Escopo exclusivo do [ticket T0003](TICKETS.md#autorizacao-t0003). **Estado final: DONE / HUMAN_ACCEPTED — 24/10/2026. Parecer técnico anterior: READY_FOR_HUMAN_REVIEW. Sem commit.**

Baseline inicial limpa: main, HEAD `443c0665db0d7293254869f78a53727c4902fe3b`, commit documental criado pelo responsável. A retomada solicitada preservou 15 arquivos rastreados modificados e 14 novos já existentes; este relatório foi acrescentado depois. Resultados abaixo distinguem testes observados, inspeção e trabalho futuro.

<a id="aceite-humano-t0003"></a>
## Aceite humano de T0003 — 24/10/2026

**DONE / HUMAN_ACCEPTED.** Aprovador: responsável pelo Sistema IGNIS. Evidência: instrução humana “IGNIS — T0003 | Formalização do aceite humano”. Autoriza exclusivamente este registro documental e a consolidação das evidências; não autoriza implementação, novo ticket, alteração de código ou commit.

### Evidências independentes informadas pelo responsável

Reprodução no Windows com **Node.js 24.22.1 e npm 11.19.1**:

| Verificação reproduzida | Resultado humano |
|---|---|
| npm run typecheck | PASS |
| npm run test:t0003 | 17/17 PASS |
| npm test | 69/69 PASS |
| npm run build | PASS |
| Regressões T0001/T0002 | 52/52 PASS |
| git diff --check | Sem erros; apenas avisos LF/CRLF |

Validação manual confirmada pelo responsável no **Opera GX e Microsoft Edge**: abertura da aplicação; autenticação com segredo correto e rejeição de segredo incorreto; encerramento e novo acesso; cadastro, listagem, consulta e edição; persistência entre navegadores e após reiniciar a aplicação; rejeição de série duplicada. São evidências humanas independentes, distintas do procedimento do agente na seção D. Nenhum teste de aplicação foi reexecutado pelo agente nesta formalização.

### Concorrência manual entre abas — MANUAL_INCONCLUSIVE

O responsável não conseguiu reproduzir uma atualização efetivamente obsoleta. Na primeira tentativa, CSRF_FORBIDDEN rejeitou a operação antes da verificação de versão. Na segunda, a autenticação na outra aba atualizou o estado carregado; as alterações foram confirmadas sequencialmente, sem conflito entre duas versões antigas. **Não foi observada sobrescrita indevida.**

O resultado manual permanece **MANUAL_INCONCLUSIVE**, sem promoção a PASS e sem declaração de defeito de integridade. **V01-T3-13 automatizado continua PASS**: concorrência real, replay antigo e no-op foram verificados. Esta ressalva descreve a experiência de validação entre abas e pode ser reavaliada futuramente, sem criar ticket adicional ou autorizar correção/implementação.

### Alcance do encerramento

Preservados GF01–GF08 HUMAN_APPROVED, fixed_speed_radar v1, T03-C ratificada e a faixa 1–200 km/h exclusivamente fictícia, sem validade regulamentar. T0001/T0002 continuam DONE / HUMAN_ACCEPTED; T0004–T0020 continuam PLANNED / NOT_AUTHORIZED. J01 permanece pendente; ADRs 0001–0003 Accepted — Conditional e condições C01–C05 mantêm suas evidências, limitações e pendências. A aprovação de T0003 não aceita funcionalidades posteriores.

A implementação permanece local, sem staging/commit. Os resultados técnicos anteriores abaixo foram preservados como histórico da implementação; o parecer READY_FOR_HUMAN_REVIEW foi sucedido exclusivamente por este aceite humano. Estado vigente também em [REPO_CURRENT_STATE](REPO_CURRENT_STATE.md#aceite-humano-t0003).

### Verificação documental desta formalização

Baseline de 69 arquivos rastreados/não ignorados, branch main e HEAD 443c0665db0d7293254869f78a53727c4902fe3b. SHA-256 confirma 64 arquivos fora dos cinco documentos autorizados intactos, incluindo README, código/testes, configuração, migrations, dependências, contratos e ADRs; nenhum arquivo criado/removido. Os 20 tickets e todos os seus critérios/dependências foram preservados, alterando somente o estado/registro de aceite de T0003. Mantidas as 16 linhas V01-T3, 21 V00-I e oito linhas V05-I de critérios esperados; V01-T3-13 permanece PASS automatizado. Conferidos 18 Markdown, 263 links locais/âncoras válidos e cercas balanceadas. git diff --check: exit 0, sem erros, apenas avisos LF/CRLF. Status mantém as 15 alterações rastreadas e 15 entradas não rastreadas anteriores; index e HEAD inalterados. Nenhum staging/commit ou teste de aplicação nesta execução.

## A. Resumo técnico

Implementada a primeira fatia real Vue → Fastify → SQLite para fixed_speed_radar v1: acesso local, confirmação do contexto operational, lista paginada, detalhe, cadastro e edição cadastral com versão. A localização cadastral pode identificar uma base conhecida, sem declarar instalação; coordenadas ausentes não recebem ponto artificial. A faixa 1–200 km/h permanece **exclusivamente fictícia de demonstração, sem validade regulamentar**.

T03-C implementada exatamente no alcance ratificado: not_installed, solicitação preventiva inicial opcional e explícita, sem pedido automático; agenda dated/unknown/not_applicable e projeção de Maintenance. Cadastro, localização, estado, pedido opcional, evento, revisão e recibo são atômicos.

A jornada foi exercitada com registros realmente persistidos, incluindo reinício, duplicidade, conflito/revisão explícita, perda de sessão e recuperação de envio incerto. O cenário reproduzível está no [README](../README.md#executar-a-fundacao-t0001).

Não implementados: agentes/catálogo completo T0004, gerador T0005, mapa T0006, telemetria T0007, intervenções T0012, alertas, análises, missões, jogos, tour, design visual definitivo ou publicação. J01 permanece pendente.

## B. Persistência e referências

Nova migration [0002-inventory.sql](../apps/server/migrations/0002-inventory.sql); schema passa a 2. A migration 0001 e seu checksum não foram reescritos. Migração explícita em arquivo vazio e atualização de instalação versão 1 foram verificadas; boot/GET/login/build não migram nem provisionam operational.

| Estrutura introduzida | Integridade aplicada |
|---|---|
| category_version | Categoria/versionamento global; perfil fictício único; triggers impedem UPDATE/DELETE |
| organization | PK e código únicos por dataset/epoch; referência fictícia ORG_LOCAL |
| resource / equipment | Identidade separada da série; PKs/FKs contextuais, especialização única, série contextual única, categoria/versionamento e criticidade |
| resource_location | Papéis registration/base separados; FK contextual, CEP/UF e par/faixa de coordenadas; base adicional opcional |
| current_state | Um estado inicial not_installed por equipamento; FK contextual |
| maintenance_request | Pedido inicial explícito no domínio responsável; prioridade, três estados de agenda e causa ativa única |
| operational_event | Evento cadastral com ator/comando, versão/revisão, tempos e mudanças; motivo/evidências no documento JSON; append-only por triggers |

Nenhuma tabela de agentes, telemetria, intervenção, alertas ou missões foi antecipada. A validação de entrada estática completa ocorre antes da persistência; as constraints SQL reforçam unicidade, relações e valores essenciais.

O comando [db:prepare-operational](../apps/server/src/prepare-operational.ts) usa transação BEGIN IMMEDIATE e o operador local estável já criado por T0002. Referências públicas aprovadas: dataset `10000000-0000-4000-8000-000000000003`, code local-operational, kind operational; organização `10000000-0000-4000-8000-000000000004`, ORG_LOCAL. Criação inicial: epoch 1, ready, revisão 0, grant can_write=1. Nenhum equipamento/pedido/credencial é criado pelo preparo.

Repetição verifica os mesmos IDs/perfil/organização/grant/geração, preservando dados e revisões. Código/ID/tipo divergente, referências ausentes, grant removido/revogado e epoch avançado são recusados sem upsert corretivo, reset ou conversão do demo. O bootstrap demo e suas sessões/identidades permanecem separados.

SQLite efetivo observado: **3.53.4**, foreign_keys=1, WAL, synchronous=2/FULL e busy_timeout=1000 ms. Persistência de equipamento, pedido, recibo e IDs após reabertura/reinício foi comprovada nas suítes e na execução local.

## C. Backend

Prefixo contextual D = /api/v1/datasets/{datasetId}/epochs/{epoch}.

| Operação implementada | Comportamento |
|---|---|
| GET D/catalog | Perfil único e referência organizacional do contexto autorizado |
| GET D/equipment | Paginação estrita, padrão 50/limite 200, total real e ordem binária por série/id |
| GET D/equipment/{id} | Detalhe agregado com versão, localização, estado e manutenção inicial |
| POST D/equipment | 201 somente após cadastro atômico; operação inventory.equipment.create.v1 |
| PATCH D/equipment/{id} | Campos cadastrais permitidos, expectedVersion e operação inventory.equipment.update.v1; no-op confirma recibo sem evento/incremento |

Sessão/contexto, Origin, CSRF, C02/JCS/SHA-256 e executeCommand foram reutilizados. Não há segundo sistema de autenticação/idempotência. A extração de credenciais foi compartilhada sem alterar sua semântica; o limite existente de 60 mutações/minuto passou a incluir os comandos de inventário por sessão.

Normalização específica antes do hash: série trim/toUpperCase, CEP sem hífen permitido e defaults estáticos do contrato. Tipos sem coerção, campos extras, obrigatoriedade/null, datas civis, coordenadas, enums, referências e limite fictício são validados. expectedVersion e alvo permanecem na identidade canônica.

Autorização/contexto são conferidos antes de devolver recibo e novamente na transação. Replay preserva status/corpo original e Idempotency-Replayed; conteúdo divergente retorna 409. Escritas usam BEGIN IMMEDIATE; edição verifica a versão e confirma evento/revisão/recibo juntos. Leituras usam um snapshot para contexto/revisão/total/projeções. Erros 400/422/401/403/404/409/429/503 e 500 sanitizado preservam ausência de confirmação parcial.

## D. Frontend e procedimento observado pelo agente

Vue mínimo para JF-01–JF-05 da categoria aprovada. Rótulos, fieldsets, navegação por botões, feedback textual, foco em destino/erro e informações que distinguem cadastro, base, instalação ainda não realizada e observações indisponíveis. Sem biblioteca nova de componentes ou identidade visual definitiva.

VITE_IGNIS_DATASET_ID contém somente UUID público. Epoch/revisão vêm do backend, sem fallback/demo/descoberta. Segredo não entra no bundle ou URL; CSRF fica em memória; cookie continua HttpOnly. Após recarga, a sessão pode consultar e a interface exige novo acesso antes de enviar sem CSRF.

Cada intenção preserva commandId/corpo/rota/epoch em memória durante resultado incerto; campos ficam bloqueados e retry é explícito. Autenticação ou throttling no retry não concluem se uma tentativa anterior confirmou. Epoch incompatível não recebe remapeamento. Conflito bloqueia envio até consulta/comparação e liberação explícita do rascunho com a versão consultada; não há merge automático. Depois de confirmação/replay, GET fornece a versão atual em vez de usar o snapshot antigo como estado corrente.

**Procedimento UI executado:** banco isolado .tmp/t0003-review/ignis.sqlite, preparado por CLI; npm run dev em 3000/5173 e depois npm start compilado em 3000. Pelo navegador: login/contexto, vazio, cadastro RADAR-UI-FICTICIO-01 sem pedido/coordenadas, detalhe, edição, duplicidade com campos preservados, conflito provocado por uma sessão HTTP independente, revisão/liberação e confirmação. Um segundo radar foi criado com pedido explícito/agenda não aplicável; expiração de sessão da fixture ocultou o rascunho, recuperado após novo acesso à mesma geração.

Na distribuição: os dois registros reapareceram após reinício. Uma edição com servidor parado exibiu resultado incerto e campos bloqueados; após reiniciar o mesmo banco, “Reenviar mesma tentativa” confirmou a edição, versão 4/revisão 5. A primeira tentativa desse procedimento foi interrompida pelo fechamento da aba de teste e foi refeita até confirmação. A perda de resposta após commit é adicionalmente verificada por replay/backend e reinícios automatizados.

Teclado: Tab do título do detalhe focalizou “Editar cadastro”; Enter abriu o formulário e o foco foi ao título. Largura 390 px: conteúdo/clientWidth 375 px, sem overflow horizontal; formulário capturado e inspecionado. Isso é verificação funcional focal, não auditoria completa de leitor de tela/acessibilidade.

Artefatos locais de evidência, ignorados pelo Git e não incluídos em eventual commit: [detalhe confirmado](../.tmp/t0003-review/distribution-detail.jpg), [formulário em largura reduzida](../.tmp/t0003-review/mobile-form.jpg). Servidores de teste foram encerrados; o banco padrão do usuário não foi usado para a demonstração.

<a id="e-matriz-v01-t3"></a>
## E. Matriz V01-T3

Critérios originais: [16 casos do guia](VERIFICATION_GUIDE.md#v01-t3-radar), preservados sem relaxamento. Contratos A/B/C: [seção 11 técnica](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo).

Evidência S1: [t0003-inventory.test.ts](../apps/server/test/t0003-inventory.test.ts), cada teste nomeado com o ID original, SQLite real temporário e HTTP injetado no Fastify. Evidência S2: [t0003-runtime.test.ts](../apps/server/test/t0003-runtime.test.ts), CLI/processos compilados e HTTP/socket/reinícios reais. Evidência U: procedimento observado em D. Comando reproduzível: npm run test:t0003, **17/17 em 2 arquivos**, incluindo os 16 IDs e um caso adicional de rate limit.

| ID | Contrato | Teste/procedimento | Resultado | Evidência |
|---|---|---|---|---|
| V01-T3-01 | T03-A/B | Banco vazio/upgrade versão 1, preparo separado e referências sem domínio | PASS | S1: ID 01, FK/grant/demo/IDs |
| V01-T3-02 | T03-B | Repetição, colisão, perfil divergente, referência/grant ausente e epoch avançado | PASS | S1: ID 02, recusa sem reparo |
| V01-T3-03 | T03-B/I01 | UUID público ausente/inválido, sessão/grant, isolamento e epoch | PASS | S1: ID 03; U: acesso/contexto |
| V01-T3-04 | T03-B/segurança | Origem/CSRF recusados; recarga exige novo acesso antes de mutação | PASS | S1: ID 04; S2; U: Vite e compilado |
| V01-T3-05 | T03-A/C | Catálogo único, POST padrão, versão/revisão/evento/recibo e nenhum pedido automático | PASS | S1: ID 05; U: primeiro cadastro |
| V01-T3-06 | T03-A | Ausência/null/string/fração/0/201 e fronteiras 1/200 do atributo fictício | PASS | S1: ID 06, 400/422 e 201 |
| V01-T3-07 | T03-A/I02 | Série normalizada única, refs inválidas e duas criações concorrentes | PASS | S1: ID 07, processos SQLite separados; U: duplicidade |
| V01-T3-08 | T03-A | Base conhecida, par ausente/inválido, CEP/UF e regionId proibido | PASS | S1: ID 08; U: sem coordenadas |
| V01-T3-09 | T03-C | Solicitação explícita nos três ramos de agenda e projeção sem mudar situação | PASS | S1: ID 09; U: não aplicável com motivo |
| V01-T3-10 | T03-C | Data avulsa/impossível, combinações incoerentes e prioridade ausente | PASS | S1: ID 10, zero efeito/recibo |
| V01-T3-11 | I03/T03-C | Falha após cada write, recibo e constraint adiada no commit | PASS | S1: ID 11, oito pontos, rollback e retry |
| V01-T3-12 | C02/I01 | Replay após reabertura, resposta original, divergência, grant revogado e epoch aposentado | PASS | S1: ID 12; S2: replay após reinício |
| V01-T3-13 | I04/C02 | Dois editores em processos reais, replay antigo e no-op | PASS | S1: ID 13; U: conflito/revisão explícita |
| V01-T3-14 | T03-A/C | Campos proibidos e remoção exclusiva de base adicional por PATCH | PASS | S1: ID 14, manutenção/cadastro preservados |
| V01-T3-15 | T03-A | Detalhe/lista/catálogo, paginação estrita, ordem e página além do total | PASS | S1: ID 15, leituras sem efeitos |
| V01-T3-16 | T03-A/B/C/V00 | CLI compilada, reabertura/reinícios, IDs/sessão/pedido/recibo e edição duráveis | PASS | S2: ID 16; U: dados preservados; regressão F |

<a id="f-regressao"></a>
## F. Regressão e tentativas

| Comando/verificação | Resultado | Evidência observada |
|---|---|---|
| node --version; npm --version | PASS | Node 24.22.1; npm 11.19.1 no Windows/PowerShell |
| npm run typecheck | PASS | Backend, Vue/configuração e testes; exit 0, confirmado na retomada |
| npm run test:t0003 | PASS | 17 testes/2 arquivos, exit 0; descoberta efetiva dos 16 IDs |
| npm test | PASS | 69 testes/8 arquivos, exit 0; 19 T0001 + 33 T0002 + 17 T0003 |
| npm run build | PASS | Vue/servidor, também executado pelos scripts de teste; sem dependência adicionada |
| db:migrate + db:prepare-operational | PASS | CLI explícita no banco isolado; schema 2, SQLite 3.53.4, IDs aprovados; repetição/upgrade na suíte |
| Concorrência, integridade, replay e rollback | PASS | S1/S2; processos/conexões SQLite reais; nenhum mock da persistência crítica |
| npm run dev | PASS | Backend 3000/Vite 5173, proxy /api com sessão/Origin/CSRF; procedimento D |
| npm start, distribuição e reinício | PASS | UI compilada e S2; mesma origem; persistência e retry D |
| Teclado/largura reduzida | PASS no alcance focal | Tab/Enter, foco e formulário sem overflow; evidências locais em D |
| git diff --check; git status | PASS | Exit 0, sem erros de whitespace; avisos de conversão LF/CRLF apenas; inventário final na seção I |

A suíte anterior permanece com 52 testes executáveis. Dois testes existentes foram adaptados ao avanço autorizado: o smoke verifica o texto da nova entrada de inventário no asset real; V00-I21 usa SCHEMA_VERSION para contagem/restauração de user_version, mantendo a rejeição de checksum divergente. Nenhum teste foi removido/desabilitado e nenhum resultado esperado de V01-T3 foi alterado.

Falhas intermediárias e correções: a primeira rodada (14/15) encontrou paginação recusada devido ao protótipo do objeto de query Fastify; a projeção para objeto simples preservando todas as chaves corrigiu a validação. O teste adicional de rate limit detectou que POST de inventário compartilhava a chave de login; a chave foi corrigida para sessão, preservando o limite. A suíte completa final passou 69/69. O sandbox impediu o avanço de subprocessos inicialmente; verificações foram executadas com permissão ampliada. Na retomada, o resultado de um processo específico anterior não pôde ser recuperado; typecheck/suíte T0003 foram repetidos com exit 0.

**NOT RUN / fora do alcance:** instalação limpa em ambiente inteiramente novo, outros SOs, benchmark/carga de domínio, auditoria integral de acessibilidade/leitor de tela, integrações restantes dos oito grupos V05-I (incluindo intervenção T0012), V01 completo do catálogo/agentes, mapa/J01 e demais funcionalidades não autorizadas. Cadastro/edição de T0003 possuem evidência parcial do grupo de domínio, sem encerrar o grupo T0003/T0012 ou C02. Lint separado não existe. Nenhum item restante é apresentado como PASS ou encerramento de condição arquitetural.

## G. Arquivos e dependências

Criados (15):

- apps/server/migrations/0002-inventory.sql — schema incremental da primeira fatia.
- apps/server/src/inventory/contract.ts — perfil, campos estáticos e normalização específica.
- apps/server/src/inventory/prepare.ts — preparo operacional determinístico e não destrutivo.
- apps/server/src/inventory/service.ts — cadastro/edição/projeções e evento atômico.
- apps/server/src/inventory/maintenance.ts — pedido/projeção inicial de Maintenance.
- apps/server/src/inventory/routes.ts — APIs contextuais e leitura consistente.
- apps/server/src/prepare-operational.ts — CLI explícita.
- apps/server/test/support/inventory-fixture.ts — SQLite isolado e sessão HTTP.
- apps/server/test/support/inventory-child.ts; inventory-race.ts — concorrência real entre processos.
- apps/server/test/t0003-inventory.test.ts; t0003-runtime.test.ts — 17 testes.
- apps/web/src/api.ts; LocationFields.vue — cliente HTTP/contratos de leitura e campos de localização.
- docs/T0003_REPORT.md — este relatório.

Modificados (15):

- apps/server/src/app.ts; foundation-routes.ts — registro Inventory, credenciais compartilhadas e limite contextual.
- apps/server/src/persistence/store.ts; migrate.ts — nova migration/checksum e versão de schema reportada.
- apps/server/test/smoke.test.ts; t0002-persistence.test.ts — adaptações de regressão descritas em F.
- apps/web/src/App.vue; apps/web/index.html; apps/web/vite.config.ts — jornada, título e proxy /api.
- package.json — somente scripts db:prepare-operational e test:t0003.
- README.md; docs/REPO_CURRENT_STATE.md; docs/TICKETS.md; docs/KNOWN_ISSUES.md; docs/VERIFICATION_GUIDE.md — execução, autorização, evidências e pendências.

**Dependências adicionadas: nenhuma.** package-lock.json e manifests dos workspaces preservados. Mantidos Vue 3.5.44, Vite 7.3.7, Fastify 5.12.7, better-sqlite3 13.0.3, TypeScript 5.9.3 e Vitest 4.1.12. Builds/cache/banco/imagens locais são ignorados pelo Git; não houve instalação/reinstalação nesta execução.

## H. Estado arquitetural

| Item | Estado fundamentado |
|---|---|
| C01 | Evidências Windows preservadas/reproduzidas tecnicamente na suíte; SQLite/PRAGMAs confirmados. Instalação limpa em ambiente inteiramente novo não reproduzida nesta implementação nem na validação humana anterior; outros alvos/V11 final pendentes |
| C02 | Fundação aceita e 21 V00-I preservados; aplicação aos comandos reais de inventário comprovada aqui. Oito grupos V05-I permanecem sem fechamento integral: cadastro/edição cobertos, intervenção T0012 e demais integrações restantes NOT RUN; condição integral não encerrada |
| C03 | Revisão de precedência temporal antes de T0007 e integração T0012 permanecem pendentes |
| C04 | Guardas/liberação de reservas T0015 permanecem pendentes |
| C05 | Índices heurísticos e verificações T0013/T0014 permanecem pendentes; sem validade externa alegada |
| Gate funcional | GF01–GF08 HUMAN_APPROVED na fatia inicial; T03-C ratificada, contratos preservados |
| J01 / tickets posteriores | J01 não concluído; T0004–T0020 não autorizados |
| ADRs / visual | Três ADRs Accepted — Conditional intactos; design visual definitivo não iniciado |

Fontes normativas e design aprovado preservados: [ADRs](adr/README.md), [contratos](MVP_TECHNICAL_DESIGN.md) e [System Design funcional](SYSTEM_DESIGN_FUNCTIONAL.md). Afirmações históricas de código então inexistente nesses documentos não substituem o [estado real vigente](REPO_CURRENT_STATE.md#implementacao-t0003).

## I. Git e integridade — registro da implementação

Branch **main**; HEAD inicial e de retomada `443c0665db0d7293254869f78a53727c4902fe3b`. Nenhum git add/commit/merge/push, configuração de remoto, deploy ou operação destrutiva.

git diff --check: exit 0, sem erros de whitespace; avisos LF/CRLF correspondem à configuração Git Windows e não são falhas do check. Index vazio e HEAD final inalterado. git status: 15 arquivos rastreados modificados e 15 novos não rastreados, listados em G; nada staged. git diff --stat inclui somente os 15 rastreados, sem os novos.

Integridade: 39 arquivos rastreados fora das alterações permanecem iguais ao HEAD pela comparação de blobs Git, incluindo AGENTS, design funcional, contratos normativos, arquitetura/brief, três ADRs, migration 0001, lockfile e manifests dos workspaces. Mantidos os 20 tickets; apenas T0003 recebeu estado/evidência de entrega. As 21 linhas V00-I, oito linhas V05-I e 16 linhas V01-T3 de entradas/resultados esperados foram preservadas. Foram conferidos 18 Markdown, 255 links locais/âncoras e cercas balanceadas. Os dois artefatos de imagem locais também existem. Portas 3000/5173 sem listener ao encerrar.

## J. Parecer final

**DONE / HUMAN_ACCEPTED — 24/10/2026.** O responsável aprovou formalmente T0003 conforme o [registro de aceite](#aceite-humano-t0003), após reprodução independente dos testes e validação manual informada. O parecer técnico anterior READY_FOR_HUMAN_REVIEW e suas evidências foram preservados; concorrência manual entre abas permanece MANUAL_INCONCLUSIVE, sem invalidar o PASS automatizado de V01-T3-13 ou afirmar defeito não comprovado. Pendências F/H e J01 continuam abertas; T0004–T0020 não autorizados. Sem novo teste de aplicação, implementação, staging ou commit nesta formalização.
