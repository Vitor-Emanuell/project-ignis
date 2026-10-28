# IGNIS — Relatório de execução T0001

Data: **23/10/2026, America/Sao_Paulo**. Escopo autorizado: instrução humana “IGNIS — T0001 | Implementação da fundação executável”, autorização explícita exclusiva de T0001, posterior ao aceite arquitetural. Modelo de relato: [playbook](CODEX_PLAYBOOK.md#implementar-um-ticket). Fonte do escopo: [T0001](TICKETS.md#t0001--fundação-executável-e-diagnóstico-mínimo).

## Encerramento formal — aceite humano

**Estado vigente: DONE / HUMAN_ACCEPTED.** Em 23/10/2026, o responsável pelo projeto aprovou formalmente T0001 na instrução “IGNIS — Encerramento formal do T0001”, considerando este relatório e sua validação independente no Windows. O [registro do aceite](REPO_CURRENT_STATE.md#aceite-humano-t0001) mantém as evidências declaradas: Node 24.22.1, npm 11.19.1, typecheck PASS, 19 testes em 2 suítes PASS, build frontend/backend PASS e smoke de execução/reinicialização/conflito de porta PASS.

Nenhum teste de aplicação, instalação ou build foi executado nesta formalização documental; código e configurações foram preservados. O npm 11.19.1 da validação humana não substitui o npm 12.2.1 usado na implementação nem altera a faixa declarada no manifest, preservado. C01 continua parcial; demais condições dos ADRs permanecem pendentes. T0002 e os demais tickets não receberam autorização.

## Histórico — relatório de implementação submetido ao aceite

As seções A–G abaixo preservam o relatório anterior ao aceite, inclusive a recomendação READY_FOR_HUMAN_REVIEW e os ambientes então observados. Referências a aceite pendente nesse histórico foram superadas pelo encerramento formal acima.

## A. Resumo

**READY_FOR_HUMAN_REVIEW**, aguardando revisão e aceite humano. Arquitetura permanece ARCHITECTURE_APPROVED_CONDITIONAL. A autorização individual e ADR-0001 Accepted — Conditional atenderam às dependências de entrada. System Design não é gate de T0001. Os 20 tickets e F01–F09 foram preservados; nenhum trabalho de T0002 foi executado.

Fundação implementada: dois workspaces npm, bootstrap Fastify, configuração validada, `GET /health/live`, entrada Vue técnica sem estilos/branding, compilação TypeScript/Vite, entrega estática pelo backend e testes de contrato/processo. O contrato existente exige live HTTP 200 sem dados sensíveis, mas não fixa payload; adotado o mínimo `{"status":"ok"}`. Readiness continua ausente (404), para não declarar banco pronto antes de T0002. Rotas desconhecidas retornam erro com `code`, `message` e `requestId`.

Em desenvolvimento, Vite atende 127.0.0.1:5173 e encaminha `/health` ao backend 127.0.0.1:3000. Na distribuição construída, um processo Node serve página e diagnóstico. A resolução do build usa a localização do módulo, independente do diretório de trabalho do chamador. HOST é restrito a loopback nesta fundação; PORT padrão 3000, 0–65535, com 0 escolhendo porta livre. Não há configuração sensível obrigatória.

Aplicação executada em desenvolvimento e construída, conferida no navegador e **parada ao final**. Ctrl+C encerrou os processos; bind posterior comprovou portas 3000/5173 livres. O terminal Windows retornou código 1 no encerramento manual; isso foi distinguido de falha de bootstrap. Não há servidor mantido em segundo plano.

Decisões limitadas ao ticket: npm workspaces, ESM/TypeScript estrito, plugin estático necessário para os arquivos construídos, `tsx` para desenvolvimento, `concurrently` para iniciar/encerrar os dois processos no Windows e Vitest para os testes mínimos previstos. Sem Router, biblioteca de UI, camada genérica, banco ou configuração de produção. Lint separado não foi necessário/configurado; tipos e testes estão disponíveis.

<a id="b-dependencias"></a>
## B. Dependências

Ambiente observado: Windows `10.0.26200`, `win32/x64`. A consulta CIM do nome comercial do Windows foi bloqueada; versão/arquitetura foram obtidas de `node:os` e `process`. Baseline do PATH: Node **20.15.0**, npm **10.7.0**. Verificação efetiva: Node **24.22.1**, npm **12.2.1**. O Node 24 já estava no runtime local do Codex; npm 12 foi instalado somente em `.tmp/tooling`. Nenhuma ferramenta global foi atualizada.

| Componente | Versão direta fixada | Compatibilidade verificada |
|---|---|---|
| Node / npm | 24.22.1 / 12.2.1 | Engines do npm: `^22.22.2 || ^24.15.0 || >=26.0.0`; instalação/ci/scripts reais passaram |
| Vue | 3.5.44 | Vue 3, plugin oficial e SFC compilado; conteúdo renderizado no navegador |
| Vite | 7.3.7 | Linha 7.3 ainda recebe correções importantes/segurança; engines `^20.19.0 || >=22.12.0` |
| @vitejs/plugin-vue | 6.0.10 | Peer Vue `^3.2.25 || ^3.6.0-rc.10`, Vite inclui `^7.0.0`; engines compatíveis |
| TypeScript / vue-tsc | 5.9.3 / 3.3.13 | Peer vue-tsc TypeScript `>=5.0.0`; checagem estrita de código/configuração/testes passou |
| Fastify / @fastify/static | 5.12.7 / 10.1.7 | Plugin instalado declara `fastify: '5.x'`; registro, HTTP e estáticos reais passaram |
| Vitest | 4.1.12 | Peer Vite inclui `^7.0.0`, engines incluem Node 24; 19 testes passaram |
| tsx / concurrently | 4.23.15 / 9.2.5 | Engines Node >=18; processos de desenvolvimento e encerramento Windows verificados |
| @types/node | 24.19.2 | Tipagem alinhada à linha Node 24 |

Versões consultadas no registro oficial npm, via campos `engines`/`peerDependencies`, antes de fixar e depois conferidas com `npm ls --depth=0`. Todas as dependências diretas usam versões exatas; transitivas estão em `package-lock.json` v3. Vite também é dependência raiz para manter Vitest e web na mesma linha, deduplicada pelo npm. `.node-version` registra a referência; engines restringem Node `>=24.22.1 <25` e npm `>=12.2.1 <13`.

Fontes oficiais consultadas: [Node LTS](https://nodejs.org/en/about/previous-releases), [requisitos Vite](https://vite.dev/guide/), [linhas mantidas Vite](https://vite.dev/releases), [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/), [plugin estático](https://github.com/fastify/fastify-static), [plugin Vue](https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue) e [Vitest](https://vitest.dev/guide/). A evidência de execução complementa essas declarações; SQLite não foi inferido dessas versões.

Para reproduzir o ambiente desta máquina, o Node usado foi `C:\Users\Pichau\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`. O npm local foi preparado pelo npm original, sob Node 24, com `npm install --prefix .tmp/tooling --no-save --package-lock=false --cache .tmp/npm-cache --no-fund --fetch-retries=0 npm@12.2.1`. Depois, o diretório desse Node e `.tmp/tooling/node_modules/.bin` foram acrescentados ao PATH apenas dos comandos da sessão. Em outra máquina, basta selecionar Node/npm compatíveis no PATH; os scripts do projeto não contêm caminhos desta máquina. `.tmp` não é parte da entrega versionável.

## C. Arquivos

**22 arquivos novos**, todos locais e sem staging:

| Arquivos | Finalidade |
|---|---|
| `.gitignore`, `.npmrc`, `.node-version` | Exclusões antes das instalações; engines estritas, versões exatas, sem consulta de atualização em cada comando; runtime de referência |
| `package.json`, `package-lock.json` | Workspaces, scripts, versões e instalação reproduzível; permissão específica do postinstall `esbuild@0.28.2` |
| `tsconfig.base.json`, `tsconfig.tests.json`, `vitest.config.ts` | TypeScript estrito e suíte de testes |
| `apps/server/package.json`, `apps/server/tsconfig.json` | Dependências e compilação do backend |
| `apps/server/src/app.ts`, `config.ts`, `main.ts` | Health HTTP, estáticos, erros seguros, configuração, inicialização/encerramento |
| `apps/server/test/app.test.ts`, `smoke.test.ts` | 16 testes de contrato/configuração/socket e 3 smoke de processo construído |
| `apps/web/package.json`, `tsconfig.json`, `vite.config.ts` | Vue/Vite, tipos, loopback e proxy de diagnóstico |
| `apps/web/index.html`, `src/main.ts`, `src/App.vue` | Entrada Vue técnica mínima |
| `docs/T0001_REPORT.md` | Este relatório de execução |

**7 documentos existentes modificados:** README (comandos reais e estado); AGENTS (estado por referência ao backlog, preservando autorização individual); TICKETS (somente T0001 e estágio de C01); REPO_CURRENT_STATE (entrega vigente com histórico preservado); VERIFICATION_GUIDE (comandos e V00 por estágio); KNOWN_ISSUES (ocorrências/limitações e condições pendentes); MVP_TECHNICAL_DESIGN (somente introdução sobre existência da fundação, sem mudar contratos). Os três ADRs aceitos, seu índice, SYSTEM_ARCHITECTURE, PROJECT_BRIEF e CODEX_PLAYBOOK foram preservados.

Gerados e ignorados: `node_modules`, `apps/web/dist`, `apps/server/dist`, cache/ferramenta temporária em `.tmp`. Não houve renormalização massiva nem `.gitattributes`. Git informou aviso de possível conversão LF→CRLF no README conforme configuração existente; `git diff --check` passou.

<a id="d-verificacao"></a>
## D. Verificação

PASS = resultado observado; FAIL = tentativa executada com falha; NOT RUN = não executado; BLOCKED = validação impossibilitada por limitação objetiva. Tabela final após correções:

| Critério | Comando/procedimento | Resultado | Evidência |
|---|---|---|---|
| Baseline/dependências de entrada | `git status --short --branch`, `git log -1`, leitura ticket/ADR | PASS | main, 995c9ef, árvore inicialmente limpa; autorização exclusiva e ADR conferidos |
| Instalação | `npm install --cache .tmp/npm-cache --no-fund --fetch-retries=0` | PASS | npm 12.2.1, versões finais instaladas, engines/peers sem bypass |
| Reinstalação pelo lockfile | `npm ci --offline --cache .tmp/npm-cache --no-fund` fora do sandbox | PASS | 171 pacotes adicionados, 174 auditados; dependências reinstaladas sem acesso ao registro |
| Tipos | `npm run typecheck` após ci | PASS | Backend, Vue, configurações e testes; saída 0 |
| Build web/backend | `npm run build`, também executado por `npm test` após ci | PASS | Vite 7.3.7: 10 módulos; HTML 0.34 kB, JS 63.52 kB; backend compilado por tsc |
| Build reproduzido | Builds antes/depois de ci | PASS | Mesmo nome `index-DYNS9fGC.js`; SHA-256 HTML `991895797D585A2A5B96B6EF24D937E9749572CCA863C6A4AEF5DE26C0AF517B`, JS `E8C2ACDE1A83C8FC0CBE9DF5C777F7577324D9CEC43AB721FE1A14946047CFBB` |
| Contrato HTTP/processo | `npm test` fora do sandbox, após ci | PASS | 2 arquivos, 19 testes; rodada final 17:01:50 BRT, 4.48 s |
| Script seletivo de contrato | `npm run test:unit` | PASS | 16 testes; saída 0 |
| Script seletivo de processo | `npm run test:smoke` | PASS | Build e 3 smoke; saída 0 |
| Live | Injeção Fastify + fetch por socket/processo + navegador | PASS | HTTP 200 JSON `{"status":"ok"}`, sem detalhes de banco/segredos |
| Estáticos executáveis | Processo compilado em outro cwd, fetch HTML/JS e navegador | PASS | HTTP 200, MIME HTML/JavaScript; Vue exibiu título, texto técnico e link |
| Configuração | Testes de defaults, 7 PORTs inválidas e 4 HOSTs inválidos | PASS | Defaults locais sem segredo; invalidez rejeitada com mensagem legível |
| Diagnóstico de bootstrap | Smoke de PORT inválida, porta ocupada e teste de build ausente | PASS | Código 1 para erros de processo; mensagem orienta corrigir configuração/build |
| Desenvolvimento Windows | `npm run dev`; executa também `dev:server`, `dev:web` e scripts dos workspaces | PASS | Vite 5173/backend 3000 iniciados; Vue e proxy `/health/live` conferidos no navegador |
| Distribuição Windows | `npm start` e acesso no navegador | PASS | Fastify serviu `/`, asset JS e `/health/live`; health pelo link exibiu JSON |
| Parada/reinício | Smoke em dois processos sucessivos; Ctrl+C em start/dev; bind posterior | PASS | Fetch falha após parada no smoke; portas 3000 e 5173 livres após Ctrl+C |
| Fronteira de T0001 | Testes `/health/ready`, `/api/equipment`, asset ausente | PASS | 404; nenhum endpoint de domínio/readiness antecipado |
| Versões / auditoria | `npm ls --depth=0`, `npm audit --cache .tmp/npm-cache --fetch-retries=0` | PASS | Versões da seção B; `found 0 vulnerabilities` na auditoria online final |
| Higiene e documentação | `git diff --check`, inspeção de novos arquivos e links Markdown | PASS | 15 Markdown, 141 links locais, 20 tickets, 22 arquivos novos; zero erros de links/âncoras/cercas/whitespace; exclusões verificadas |
| Lint separado | Não configurado | NOT RUN | Sem script ou dependência de lint declarados |
| SQLite/readiness/guardas e V01–V11 de features | Não executados: fora de T0001 | NOT RUN | Dependem de tickets e autorizações posteriores; V00 completo continua pendente |
| Outros sistemas operacionais | Não executados | NOT RUN | Evidência restrita ao Windows disponível |

### Ocorrências iniciais e resolução

| Tentativa | Resultado | Diagnóstico / resolução |
|---|---|---|
| Consulta/instalação npm no sandbox | FAIL | ENOTFOUND para registry.npmjs.org; repetida com permissão ampliada |
| Instalação com npm 10.7.0 | FAIL | Erro interno Arborist `Cannot read properties of null (reading 'edgesOut')`; npm 12.2.1 local compatível usado, sem `--force`/`--legacy-peer-deps` |
| Primeiro PATH do npm local | FAIL | Apontava ao diretório interno `npm/bin`; corrigido para o shim em `node_modules/.bin`; instalação global preservada |
| Auditoria com @fastify/static 8.3.0 | FAIL | 1 dependência com severidade alta e quatro advisories; atualização para 10.1.7 compatível com Fastify 5; auditoria final zerada |
| Postinstall esbuild no npm 12 | BLOCKED inicialmente | Política padrão não o cobria; manifest autoriza somente `esbuild@0.28.2`; ci/build finais passaram |
| Primeiro typecheck | FAIL | Handler recebia `unknown`; validação explícita antes de ler statusCode corrigiu o erro sem afrouxar TypeScript |
| Primeiro npm test no sandbox | FAIL | EPERM ao renomear cache temporário do Vitest; repetido fora do sandbox, sem desativar casos |
| HTTP/browse com servidor no sandbox | BLOCKED | Fetch local EACCES e navegador ERR_CONNECTION_TIMED_OUT; servidor iniciado fora do sandbox permitiu navegação e testes reais |
| Primeiro npm ci no sandbox | FAIL | EPERM para criar symlinks dos workspaces; repetição fora do sandbox concluiu |
| Consulta CIM do Windows | BLOCKED | Nome comercial indisponível por CIM; versão/arquitetura obtidas por Node, sem afetar aceitação |

Reprodução manual focal: selecionar Node/npm da seção B; na raiz instalar com `npm ci`; executar `npm run typecheck` e `npm test`; iniciar `npm run dev`, abrir 5173 e clicar no diagnóstico; Ctrl+C; executar `npm run build` e `npm start`, repetir em 3000; parar. Configurar PORT inválida antes de start deve encerrar com erro legível. Não é necessário seed, banco ou segredo. Em ambiente com as restrições desta sessão, obter a permissão necessária para instalação/loopback/testes antes de repetir; não alterar as verificações para contornar falhas.

## E. Git

Branch **main**, HEAD **995c9ef — docs: formalize conditional architecture approval**. Status final conferido: 7 documentos modificados e 22 arquivos novos, todos sem staging; sem arquivos de build, dependências ou temporários na lista versionável. `git diff --stat`: 7 documentos, 79 inserções e 36 remoções; não inclui os novos arquivos, também inspecionados. Nenhum commit, add, init, troca de branch, merge, push, remoto ou deploy efetuado. O HEAD e o histórico permaneceram iguais ao baseline humano.

## F. Pendências

Nenhum critério residual de T0001 identificado após as verificações. Aceite humano pendente. PATH global ainda precisa selecionar Node/npm compatíveis para executar os comandos; instalação global não foi alterada. Validação limitada ao Windows disponível, sem comprovar outros sistemas.

C01 **parcial**, apenas runtime/build/processo T0001: driver Windows, SQLite embutido corrigido, FKs, persistência, rollback, readiness, contexto e guardas pertencem a T0002, que não está autorizado. A revisão documental específica C02 deve anteceder sua autorização/início. C03/C04/C05 continuam nos gates originais; não houve implementação nem alegação de resolução. System Design funcional precisa de autorização própria antes de T0003; não foi iniciado.

P13 mantém defasagens de arquitetura/brief fora do escopo, P14 mantém a limitação do ambiente; fontes oficiais de estado são backlog/ADRs/estado real. Nenhum escopo futuro foi tratado como defeito a corrigir nesta execução.

## G. Recomendação

**READY_FOR_HUMAN_REVIEW** — critérios de T0001 implementados e evidenciados, para decisão de aceite pelo responsável. Essa recomendação não aceita formalmente o ticket, não encerra C01 completo e não autoriza T0002 ou qualquer outra tarefa. Execução encerrada no escopo autorizado.
