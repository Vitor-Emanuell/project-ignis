# T0002 — Fundação de persistência e integridade

Execução: 23–24/10/2026, America/Sao_Paulo. Autorização: instrução humana “IGNIS — T0002 | Implementação da Fundação de Persistência e Integridade”, exclusivamente T0002. Baseline inspecionado antes do código: `main`, HEAD `a07e25bd4341352bff277b2c167f10bf603871fb` (`a07e25b`), working tree limpa. T0001 já DONE / HUMAN_ACCEPTED e versionado. Leitura normativa e mapeamento dos 21 V00-I realizados antes da implementação; nenhum bloqueio contratual material identificado.

## Aceite humano — 24/10/2026

**T0002: DONE / HUMAN_ACCEPTED.** O responsável pelo Sistema IGNIS aprovou formalmente o ticket na instrução “IGNIS — Encerramento formal de T0002”, considerando este relatório e sua validação independente Windows. [Registro responsável do aceite e das evidências humanas](REPO_CURRENT_STATE.md#aceite-humano-t0002).

O responsável informou Node 24.22.1/npm 11.19.1, typecheck/build PASS, suíte T0002 PASS (33 testes/4 arquivos), suíte completa PASS (52 testes/6 arquivos), preservação dos 19 testes T0001 e git diff --check sem erros. SQLite 3.53.4 com FKs, WAL, synchronous FULL e busy_timeout 1000 foi confirmado pelos testes reproduzidos. Esses são resultados declarados pelo responsável; **nenhum teste adicional foi executado pelo agente neste encerramento**.

**A instalação limpa do driver nativo em ambiente inteiramente novo não foi reproduzida nessa validação humana.** As evidências de reinstalação pelo lockfile/cache e aviso nativo abaixo pertencem à implementação original. C01 possui evidências reproduzidas no Windows; C02 tem 21 V00-I aprovados e mantém oito grupos futuros pendentes; C03/C04/C05 continuam nos tickets correspondentes. T0003 e todos os posteriores continuam sem autorização de implementação. Código, configurações, dependências e ADRs preservados; sem commit.

As seções A–F e H preservam a entrega técnica e suas evidências históricas. O status vigente em G/I incorpora somente este aceite humano posterior, sem ampliar os resultados observados.

## A. Resumo técnico

Implementados SQLite persistente, migração explícita/checksum, bootstrap técnico estável, readiness, sessão/capability local, CSRF/Origin, autorização por dataset/epoch e helper de comandos com recibos atômicos. Parser JSON estrito, normalização tipada, JCS e SHA-256 respeitam o contrato versionado. Recibos preservam status/corpo original e permitem replay após reinício; mesma chave com conteúdo divergente conflita. Autorização/contexto são revalidados antes do recibo e precondições mutáveis executam somente em comandos inéditos.

Há somente tabelas de infraestrutura: actor, dataset, dataset_epoch, dataset_grant, local_session, command_receipt e schema_migration. `verification.receipt.v1` vive exclusivamente nos testes, compara/avança uma revisão técnica e não tem endpoint público. Nenhum inventário, UI, telemetria, pipeline de eventos, reset de produção, scheduler, análise, missão, reserva, jogo ou System Design foi implementado. Nenhum outro ticket iniciado.

## B. Ambiente e dependências

| Item observado | Resultado |
|---|---|
| Plataforma | Windows x64; PowerShell |
| Node / npm no PATH | 24.22.1 / 11.19.1 |
| Driver direto | better-sqlite3 **13.0.3**, compatível com Node >=22 conforme pacote |
| Tipos de desenvolvimento | @types/better-sqlite3 **9.6.0** |
| Dependência transitiva adicionada | node-addon-api, fixada pelo lockfile |
| SQLite efetivo após instalação limpa | **3.53.4**, consultado em execução; não inferido do Node |
| PRAGMAs em conexões independentes | journal_mode=wal, foreign_keys=1, synchronous=2 (FULL), busy_timeout=1000 ms |
| Escritor | Transação síncrona BEGIN IMMEDIATE; sem await dentro da transação; um escritor SQLite |
| Banco padrão | `data/ignis.sqlite`, caminho estável na raiz; DATABASE_PATH permite outro arquivo local |

Driver necessário para a persistência aprovada; tipos necessários ao TypeScript estrito. Nenhum ORM/broker/serviço externo. A faixa npm foi ajustada de >=12.2.1 para **>=11.19.1 <13**, com packageManager npm@11.19.1, para o ambiente que o responsável validou. Instalação limpa e todos os checks passaram nesse ambiente; instalação global preservada.

`npm ci --offline --cache .tmp/npm-cache --no-fund` instalou 174 pacotes/auditou 177, exit 0. **Aviso preservado:** npm 11 informou script nativo não coberto por allowScripts (`better-sqlite3@13.0.3`, `node-gyp rebuild`). Não foi aprovada nem executada compilação adicional: o pacote declara gypfile=false, não declara install e distribui prebuild Windows. O binário carregou após ci e executou os testes reais com SQLite 3.53.4. Não houve desativação de testes/checks para obter aprovação. Não se afirma portabilidade verificada em outros sistemas ou compilação local por toolchain C++.

Referências primárias consultadas: [driver](https://github.com/WiseLibs/better-sqlite3), [SQLite WAL-reset e versões corrigidas](https://www.sqlite.org/wal.html#walreset), [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785). Evidência de compatibilidade deste relatório vem das execuções Windows. O código recusa versões SQLite sem a correção definida na arquitetura.

## C. Contratos e implementação

| Garantia | Componente responsável / comportamento comprovado |
|---|---|
| Schema/evolução explícita | `migrations/0001-foundation.sql`, `persistence/store.ts`, `migrate.ts`: migrations numeradas/checksum SHA-256, user_version, recusa de versão futura/checksum divergente. Repetição não duplica schema/IDs. Boot não aplica migration |
| Persistência/readiness | Store abre arquivo local, valida PRAGMAs/versão em cada conexão e fecha no shutdown. Ready verifica migrations/bootstrap/epoch ativo/FKs; esquema vazio/incompatível dá 503 sanitizado, live permanece 200 |
| Identidade/contexto | Bootstrap local-operator estável no arquivo; dataset/epoch/grant mínimos. `auth.ts` deriva actorId da sessão, verifica permissão e geração ativa/ready; epoch antigo dá 409 antes de replay |
| Capacidade local | `auth.ts` e `foundation-routes.ts`: OPERATOR_SECRET em ambiente, comparação segura, tokens aleatórios armazenados por hash, expiração de uma hora, cookie HttpOnly/SameSite Strict, Origin exata, CSRF e logout; renovação/rotação de segredo não muda actorId |
| Escrita restrita | Sem segredo ou APP_MODE=read-only recusa escrita. Sem principal/capability válida dá 401/403. Cliente não escolhe ator. Somente rotas de sessão/contexto/diagnóstico; mutações de sessão limitadas a 60/minuto, 429/Retry-After |
| JSON/normalização/JCS | `idempotency/json.ts` e `normalize.ts`: chaves duplicadas, Unicode inválido, tipos e inteiros inseguros rejeitados antes de perda permissiva; schemas estáticos do servidor, ausência/null/default, números finitos, UUID lowercase, UTC milissegundo, data civil literal; objetos UTF-16 ordenados recursivamente, arrays preservados, UTF-8 sem BOM/LF |
| Identidade e replay | `idempotency/command.ts`: Kc composta por dataset/epoch/ator/operação/commandId. Cc v1 inclui target/body/precondições; exclui tempos/metadados de processamento. SHA-256 lowercase. Replay devolve status/corpo original e `headers['Idempotency-Replayed']='true'`; rotas futuras devem repassar esse resultado HTTP |
| Atomicidade | `transaction` + `executeCommand`: efeito/corpo serializado/recibo na mesma transação. Erros durante efeito, recibo, serialização e COMMIT revertem tudo. UNIQUE/NOT NULL/FKs compostas protegem Kc/contexto; nenhum estado processing/recibo antecipado |
| Concorrência/indisponibilidade | Escritor serializado em BEGIN IMMEDIATE, espera máxima de busy_timeout 1000 ms. Perdedor equivalente lê replay após commit; divergente dá 409; bloqueio excedido dá 503 DATABASE_UNAVAILABLE sem efeito do perdedor. Erro interno determinístico não é convertido arbitrariamente em 503 |
| Queda/reinício | Testes matam processos antes e depois do commit com resposta suprimida; reabrem o mesmo arquivo e confirmam rollback ou recuperação do recibo/efeito. Sessão persistente também comprovada por HTTP no servidor compilado reiniciado |

`/api/v1/session` é a exceção de autenticação sem recibo contextual/segredo persistido, conforme contrato. Não há SESSION_SECRET obrigatório: tokens opacos de alta entropia são verificados pelo hash persistido. O banco contém somente bootstrap técnico no caminho padrão, ignorado pelo Git; os testes usam arquivos temporários isolados. Epoch aposentado é manipulado apenas por fixture, sem implementar reset futuro.

<a id="d-matriz-dos-21-casos-v00-i"></a>
## D. Matriz dos 21 casos V00-I

Fonte: [matriz normativa preservada](VERIFICATION_GUIDE.md#v00-idempotencia). Arquivos: **P** = [t0002-persistence.test.ts](../apps/server/test/t0002-persistence.test.ts), **N** = [t0002-normalization.test.ts](../apps/server/test/t0002-normalization.test.ts). O prefixo V00-Ixx identifica univocamente o teste em cada arquivo. **E1** = `npm run test:t0002`, 24/10/2026: 33 testes/4 arquivos PASS; **E2** = `npm test`: 52 testes/6 arquivos PASS, incluindo os mesmos 21 IDs. A rodada completa foi repetida após a asserção adicional de UUID com letras hexadecimais, sem mudar entradas/resultados normativos.

| ID | Caso | Arquivo/teste | Resultado | Evidência |
|---|---|---|---|---|
| V00-I01 | Primeira confirmação | P / V00-I01 — primeira confirmação atômica | PASS | E1/E2: 200 original, revisão 0→1, um recibo |
| V00-I02 | Replay normalizado | P / V00-I02 — replay normalizado e vetor H0 | PASS | E1/E2: H0, mesmo corpo/status, cabeçalho true; sem novo efeito |
| V00-I03 | Conteúdo divergente | P / V00-I03 — divergência preserva original | PASS | E1/E2: 409 IDEMPOTENCY_CONFLICT, original intacto |
| V00-I04 | Alvo/guarda divergentes | P / V00-I04 — alvo e precondição fazem parte do conteúdo | PASS | E1/E2: target/expectedVersion divergentes conflitam, sem novo CAS |
| V00-I05 | Metadados de servidor | P / V00-I05 — metadados internos não mudam hash/recibo | PASS | E1/E2: sessão/tempos/IDs internos diferentes mantêm H0 e recibo |
| V00-I06 | Campos indevidos | P / V00-I06 — campos extras e JSON duplicado não deixam efeitos | PASS | E1/E2: campos proibidos/duplicata JSON 400; zero efeito/recibo |
| V00-I07 | Tipagem/precisão | N / V00-I07 — tipagem e precisão sem coerção | PASS | E1/E2: tipos/NaN/Infinity 400; fração/limite/9007199254740993 422 |
| V00-I08 | Números finitos | N / V00-I08 — números finitos e representação JCS | PASS | E1/E2: -0/0 e 1/1e0 iguais; 0.3/0.30000000000000004 diferentes |
| V00-I09 | Opcionais | N / V00-I09 — ausência, null e defaults estáticos | PASS | E1/E2: ausência/null distintos; default false equivalente; null indevido 422 |
| V00-I10 | Texto/arrays | N / V00-I10 — texto, Unicode, arrays e chaves numéricas | PASS | E1/E2: caso/espaço/Unicode preservados, escapes equivalentes, arrays ordenados, JCS aninhado/UTF-16 |
| V00-I11 | Tempo de cliente | N / V00-I11 — instante semântico preserva equivalência de offset | PASS | E1/E2: offsets equivalentes UTC .000Z; 1 ms altera hash |
| V00-I12 | Tempo inválido/civil | N / V00-I12 — tempo inválido rejeitado e data civil preservada | PASS | E1/E2: sem offset/-00:00/calendário/segundo60/fração4 rejeitados; civil literal |
| V00-I13 | Resposta perdida/reinício | P / V00-I13 — commit com resposta perdida sobrevive à queda e reabertura | PASS | E1/E2: processo morto após commit; mesmo arquivo reaberto, um efeito/recibo, replay |
| V00-I14 | Rollback em cada fronteira | P / V00-I14 — rollback de efeito, recibo, serialização e commit; queda antes do commit | PASS | E1/E2: falhas/queda pré-commit deixam revisão 0/zero recibos; retry confirma uma vez |
| V00-I15 | Concorrência equivalente | P / V00-I15 — conexões/processos concorrentes equivalentes e vencedor revertido | PASS | E1/E2: processos/barreira real; um efeito/replay, ou segundo confirma após rollback |
| V00-I16 | Concorrência divergente/busy | P / V00-I16 — concorrência divergente e timeout 503 limitado | PASS | E1/E2: divergente 409 após aquisição; bloqueio >1000 ms dá 503 sem efeito e permite retry |
| V00-I17 | Contextos/atores/operações | P / V00-I17 — isolamento de dataset, principal e operação; acesso negado | PASS | E1/E2: Kc independentes; principal sem acesso negado antes de recibos |
| V00-I18 | Sessão renovada/estado alterado | P / V00-I18 — sessão renovada e revisão alterada não invalidam replay | PASS | E1/E2: resposta antiga após revisão avançar; grant revogado impede replay |
| V00-I19 | Epoch aposentado | P / V00-I19 — epoch aposentado prevalece; nova geração é outra identidade | PASS | E1/E2: antigo 409 antes de replay; novo epoch confirma chave independente |
| V00-I20 | Integridade SQL | P / V00-I20 — UNIQUE, FK composta, NOT NULL e rollback SQL | PASS | E1/E2: duplicação/cross-context/NULL recusados; rollback e original preservados |
| V00-I21 | Ambiente SQLite | P / V00-I21 — driver, PRAGMAs por conexão, migração/reabertura e readiness | PASS | E1/E2: SQLite 3.53.4; WAL/FKs/FULL/1000 em duas conexões; repetição/reabertura; schema futuro/checksum recusados |

H0 conferido também como **200 bytes UTF-8**: `8529d6d5286b0d06c21188e77743a6194b0df0ffa154eaf588c9b3138fee285c`. Testes de concorrência usam processos/conexões independentes e barreiras por arquivo/IPC, sem mocks de persistência. A morte antes/depois do commit é real; não depende apenas de exceção simulada.

## E. Verificações gerais

| Comando / verificação | Resultado | Observações |
|---|---|---|
| `node --version`; `npm --version` | PASS | v24.22.1 / 11.19.1 |
| `npm install --cache .tmp/npm-cache --no-fund --fetch-retries=0` | PASS | Driver/tipos adicionados com lockfile; 0 vulnerabilidades informadas |
| `npm ci --offline --cache .tmp/npm-cache --no-fund` | PASS com aviso | Reinstalação limpa, exit 0; aviso nativo descrito em B; módulo carregado depois |
| `npm run typecheck` | PASS | Backend, Vue e testes; exit 0 após alteração final do cabeçalho |
| `npm run build` | PASS | Execução independente e pelos scripts de teste; frontend/backend; asset web permanece index-DYNS9fGC.js |
| `npm test` (E2) | PASS | 52 testes/6 arquivos: 16 app + 3 smoke T0001; 15 persistência + 6 normalização + 9 HTTP + 3 runtime T0002 |
| `npm run test:t0002` (E1) | PASS | 33 testes/4 arquivos; descoberta de todos os 21 IDs conferida |
| `npm run db:migrate`, repetido | PASS | Mesmo operador/dataset/epoch, schemaVersion 1 e PRAGMAs esperados no arquivo padrão |
| Persistência/FK/rollback/idempotência/isolamento/concorrência | PASS | 21 V00-I, detalhados em D, com arquivos SQLite temporários reais |
| Segurança HTTP adicional | PASS | Cookie/CSRF/Origin, grant, ator forjado, expiração/revogação, readonly/sem segredo, segredo rotacionado, limite 429, ausência de APIs futuras e de mutação GET |
| Execução compilada/reinício adicional | PASS | Migração CLI compilada repetida; sessão/contexto reais, reinício mantém cookie, logout revoga; banco vazio ready503/live200 sem automigração; ausente encerra 1 com orientação |
| `npm start` + HTTP real | PASS | /, /health/live e /health/ready 200 no banco padrão; encerrado com Ctrl+C |
| `npm run dev` + HTTP real | PASS | Backend 3000, página Vite 5173 e proxy /health/ready 200; encerrado com Ctrl+C |
| Bind após encerramento | PASS | Portas 3000 e 5173 livres; término de terminal por Ctrl+C reportou exit 1, sem processo/porta residual |
| `npm ls --depth=0`; `npm audit --cache .tmp/npm-cache --fetch-retries=0` | PASS | Árvore sem erro; 0 vulnerabilidades informadas pelo registro |
| `git diff --check`; `git status` | PASS | Sem erros de whitespace; inventário em H; HEAD e index preservados |
| Documentação e preservação | PASS | 16 Markdown, 183 links locais válidos, cercas balanceadas; 21 linhas normativas V00-I e 19 outros tickets intactos; 24 arquivos protegidos com SHA-256 inalterado |

Falhas intermediárias não omitidas: DNS ENOTFOUND do sandbox na consulta/instalação foi resolvido executando com permissão ampliada. Typecheck inicial encontrou quebra de linha em `as`, tipo desconhecido de PRAGMA e streams nullable; corrigidos antes dos resultados finais. O filtro Windows do script específico foi definido por prefixo de caminho, sem depender de expansão de glob pelo shell. HTTP/processos/driver foram executados com permissão fora do sandbox quando necessário; nenhuma expectativa normativa foi relaxada. Não há falha final observada nos checks aplicáveis.

**NOT RUN:** oito grupos V05-I e V01–V11 de features/distribuição final; testes em outros sistemas, compilação C++ do driver, avaliação de carga de domínio, UI/login visual e lint separado (inexistente). São trabalho futuro fora de T0002; não são tratados como PASS. Não houve teste manual de domínio, pois não há endpoint de domínio autorizado. Escrita técnica autorizada/negada, persistência e reinício foram comprovados automaticamente; sessão/contexto também por HTTP real.

## F. Arquivos

Criados (17):

- `apps/server/migrations/0001-foundation.sql` — schema mínimo e restrições.
- `apps/server/src/persistence/store.ts`; `apps/server/src/migrate.ts` — conexão, migração, bootstrap e diagnóstico explícitos.
- `apps/server/src/auth.ts`; `apps/server/src/foundation-routes.ts`; `apps/server/src/errors.ts` — autorização, rotas mínimas e erros sanitizados.
- `apps/server/src/idempotency/json.ts`; `normalize.ts`; `command.ts` — parser, normalização/canonicalização/hash e recibos transacionais.
- `apps/server/test/support/foundation-fixture.ts`; `command-child.ts`; `child-process.ts` — fixtures isoladas e coordenação real de processos, sem hooks de falha em produção.
- `apps/server/test/t0002-persistence.test.ts`; `t0002-normalization.test.ts`; `t0002-http.test.ts`; `t0002-runtime.test.ts` — 33 testes.
- `docs/T0002_REPORT.md` — este relatório.

Modificados (12):

- `package.json`; `package-lock.json`; `apps/server/package.json` — driver/tipos fixados, npm coerente com ambiente validado e scripts migrate/test:t0002.
- `apps/server/src/config.ts`; `app.ts`; `main.ts` — configuração persistente, integração de sessão/readiness/parser, abertura/fechamento do banco e falhas legíveis; live/loopback/estáticos preservados.
- `apps/server/test/smoke.test.ts` — banco temporário migrado para o processo T0002 e readiness agora 200; três testes originais preservados. `app.test.ts` inalterado.
- `README.md`; `docs/REPO_CURRENT_STATE.md`; `docs/TICKETS.md`; `docs/KNOWN_ISSUES.md`; `docs/VERIFICATION_GUIDE.md` — instruções/evidências/estado responsáveis, com histórico e contratos preservados.

Diretos adicionados: better-sqlite3 13.0.3 e @types/better-sqlite3 9.6.0; node-addon-api transitivo. Nenhuma biblioteca de JCS foi necessária: implementação restrita aos tipos/limites normativos e verificada pelos vetores. Frontend, AGENTS, ADRs, MVP_TECHNICAL_DESIGN, arquitetura, brief e relatório T0001 preservados; 19 definições de tickets fora de T0002 textualmente preservadas. Builds/dependências/cache/banco estão ignorados pelo Git.

## G. Condições arquiteturais

| Condição | Situação após o aceite humano de T0002 |
|---|---|
| C01 — compatibilidade/SQLite | Evidências técnicas reproduzidas no Windows pelo responsável: SQLite 3.53.4/FKs/WAL/FULL/timeout confirmados pelos testes e suítes PASS. Instalação limpa do driver em ambiente inteiramente novo não reproduzida nessa validação humana; reinstalação pelo lockfile/cache permanece evidência da implementação. Outros alvos e V11 final NOT RUN; ADR preservado |
| C02 — idempotência | Contrato preparado/versionado preservado; fundação e 21 V00-I PASS. Integrações de domínio/evento/Ce/Ke/Ks/reset/reserva continuam nos oito V05-I NOT RUN. Condição integral não encerrada |
| C03 — precedência temporal | Pendente, revisão específica antes de T0007 e integração T0012; não implementada nem verificada aqui |
| C04 — reservas de missões | Pendente, revisão específica antes de T0015; não implementada nem verificada aqui |
| C05 — limitações analíticas | Preservadas; avaliação real em T0013/T0014, sem promessa de validade externa/estatística |

## H. Git — histórico da implementação

- Branch: **main**; HEAD inicial/final: **a07e25bd4341352bff277b2c167f10bf603871fb**.
- Working tree inicial limpa; final com **12 arquivos modificados e 17 novos**, listados em F. Arquivos novos aparecem como `??`; modificados como ` M`, sem staging.
- `git diff --check`: **exit 0, sem erros**. Avisos de conversão LF/CRLF podem aparecer conforme configuração Git Windows; não indicam erro de whitespace.
- `git diff --cached --name-only`: vazio. Nenhum commit, branch nova, merge, push, deploy, init ou reescrita de histórico.
- `git status --short --branch --untracked-files=all`: branch main, somente os 29 arquivos de F. Banco/módulos/build/cache não aparecem por estarem ignorados.

O status final é entregue também na resposta, para revisão dos arquivos locais antes de eventual autorização Git separada.

## I. Parecer

**DONE / HUMAN_ACCEPTED — 24/10/2026.** Parecer técnico anterior: READY_FOR_HUMAN_REVIEW.

O responsável aceitou formalmente T0002 após análise do relatório e validação independente Windows, conforme registro acima. Os resultados técnicos originais foram preservados, distinguindo-os das evidências humanas e da instalação em ambiente inteiramente novo não reproduzida nessa validação. O aceite encerra somente T0002; oito grupos futuros de C02 e C03/C04/C05 continuam pendentes. Nenhum teste adicional, alteração de implementação, início de outro ticket ou commit neste encerramento documental.
