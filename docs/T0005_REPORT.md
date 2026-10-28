# T0005 — Gerador de cadastros válidos (F05)

**Estado vigente: T0005 DONE / HUMAN_ACCEPTED**, por [aceite humano final de 26/10/2026](#aceite-humano-t0005), após B2.1–B2.3 e seus oito cenários PASS. As seções A–N preservam a entrega inicial de 159 testes; a seção O registra as correções e os 175 testes/17 arquivos históricos de 25/10, anteriores ao aceite. A seção P distingue a homologação funcional, os testes não repetidos e a decisão humana.

Entrega técnica em **25/10/2026**, America/Sao_Paulo, sob a instrução humana “IGNIS — T0005 | AUTORIZAÇÃO HUMANA DE IMPLEMENTAÇÃO”. Parecer técnico então emitido: **T0005_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION**. Esse parecer não constituía aceite; foi sucedido pela decisão humana expressa registrada na seção P.

## A. Baseline e autorização

Baseline conferida antes das alterações: branch **main**, HEAD **ab4afd6fbeb0a0ee27124b5a6c8dc9c18d0348c8**, `docs: ratify T0005 generator contracts and functional gate`; árvore e índice limpos. Snapshot SHA-256 de 79 arquivos preexistentes registrado. HEAD e branch preservados; nenhum commit/staging, push, merge ou operação destrutiva.

Foram lidos AGENTS, mapa documental, backlog, contratos técnicos/funcionais ratificados, verificação, arquitetura, ADRs aplicáveis, estado real, pendências e relatório T0004. [T5-D01–D16/A01–A05](MVP_TECHNICAL_DESIGN.md#t0005-contrato) permanecem HUMAN_RATIFIED; [JF-T5/GF-T5](SYSTEM_DESIGN_FUNCTIONAL.md#t0005-funcional) preservados. T0001–T0004 DONE / HUMAN_ACCEPTED; T0006–T0020 NOT_AUTHORIZED. Autorização e entrega em [TICKETS](TICKETS.md#implementacao-t0005).

## B. Arquivos criados e modificados

| Grupo | Arquivos | Finalidade |
|---|---|---|
| Novos — persistência | `apps/server/migrations/0004-demo-baseline.sql` | Manifesto, associações e fechamento persistente; evolução dos ordinais |
| Novos — Demo | `apps/server/src/demo/engine.ts`, `service.ts`, `routes.ts` | Receita determinística, orquestração transacional e HTTP |
| Novo — Inventory | `apps/server/src/inventory/demo-references.ts` | Referências preparadas exclusivamente pelo proprietário do domínio |
| Novos — testes | `apps/server/test/t0005-engine.test.ts`, `t0005-contract.test.ts`, `t0005-integrity.test.ts`, `t0005-security.test.ts`, `t0005-runtime.test.ts` | 42 testes em cinco arquivos |
| Novos — apoio | `apps/server/test/support/t0005-fixture.ts`, `t0005-child.ts`, `t0005-process.ts` | SQLite descartável, barreiras e processos reais |
| Novo — interface | `apps/web/src/DemoData.vue` | JF-T5-01–03, sem redesign |
| Modificados — composição | `apps/server/src/inventory/service.ts`, `agents.ts`, `maintenance.ts` | Unidades internas reutilizáveis, IDs confiáveis e evento de baseline; wrappers públicos preservados |
| Modificados — integração | `apps/server/src/app.ts`, `auth.ts`, `idempotency/command.ts`, `persistence/store.ts` | Registro de rotas, elegibilidade de escrita, guarda demo, métricas internas, migration 4/backup |
| Modificados — entrada/validação | `apps/web/src/App.vue`, `package.json`, `apps/server/test/t0003-inventory.test.ts` | Montagem da UI, script test:t0005 e expectativa do ledger 1–4 |
| Documentação | `README.md`, `docs/TICKETS.md`, `REPO_CURRENT_STATE.md`, `KNOWN_ISSUES.md`, `VERIFICATION_GUIDE.md`, este relatório | Execução, evidências e governança |

Sem dependências novas ou alteração de lockfile, ADRs, contratos técnicos/funcionais, migrations 0001–0003 ou relatórios T0001–T0004. Artefatos locais de QA/build ficam ignorados; não integram o produto ou a lista de arquivos a versionar.

## C. Funcionalidades implementadas

Baseline inicial somente em demo autorizado, ativo, ready e vazio; um manifesto por dataset/epoch. Não há operação de criar/aposentar epochs, reset, merge, exclusão ou reparo. GET não prepara referências nem gera dados. Referência divergente e dados preexistentes impedem geração sem alteração.

Preset versionado 20 Equipment/6 Agents cobre os 14 perfis existentes; limite independente de 200/30. Os serviços de domínio validam a mesma entrada de cadastro usada pelos wrappers anteriores. Equipment inicia not_installed, Agents unknown; base adicional null, localização cadastral por papel e região null. Preset: 15 pedidos, agenda distribuída em cinco none/cinco unknown/cinco dated/cinco not_applicable; seis recursos sem coordenadas e vinte pares completos. Nenhuma observação real é inferida desses fatos sintéticos.

## D. Migration e integridade persistente — A01/A02

Migration **0004**, schema **4**, aplicada transacionalmente pelo migrador explícito. Boot continua sem migrar. Para upgrade de schema 2/3 há backup consistente via SQLite VACUUM INTO, validado antes da evolução. O teste de schema 3 populado preserva dados, bytes lógicos, IDs, eventos e recibos antigos, além de provar rollback por falha no ledger e reabertura íntegra do backup schema 3.

`operational_event` é reconstruída dentro da migration, preservando dados/colunas/FKs e fluxo legado ordinal 1, com faixa de ordinais até 230. Unicidade contextual e referências compostas vinculam evento, recurso, revisão, ordinal, ator e comando. Novas tabelas `demo_manifest`, `demo_member`, `demo_seal` formam certificado de grupo. A FK diferida obrigatória do manifesto ao fechamento impede confirmar grupo aberto; a FK ao recibo exige o pai. Triggers conferem quantidade, distribuição, sequência 1..N, contexto/revisão/comando, recursos/eventos corretos e tempos. Fechamento, membros, manifesto e recibo baseline são imutáveis; eventos continuam append-only.

Provas de SQL direto tentam prefixo parcial, buraco, duplicata, ordinal zero, N divergente, contexto/revisão/pai/recurso/evento alheios, fechamento precoce/ausente, recibo ausente/divergente/isolado e adulteração após fechar, inclusive REPLACE e evento extra. Todas recusadas; COMMIT inconsistente não se confirma. FKs e recursive_triggers habilitadas. Injeções após 12 fronteiras persistentes e na serialização revertem grupo, recursos, referências, pedidos, revisão e recibo.

IDs determinísticos iguais coexistem em contextos diferentes **no mesmo arquivo SQLite**, e também em fixtures distintas, sem salt. Chaves globais de instalação, catálogo, atores e sessões permanecem próprias. Essas garantias pressupõem schema/PRAGMAs íntegros; não se alega proteção contra administrador que altere o schema/desabilite integridade. SHA-256 da projeção é verificado pelo serviço antes de fechar; SQLite não calcula esse hash criptográfico.

## E. Determinismo e vetores

Implementação segue JCS/SHA-256 existentes, raiz versionada, fluxo independente por logicalKey/campo, contador, uint32 big-endian e rejeição antes do módulo. Decimais/coordenadas derivam de grades inteiras; UUIDs versão 8/variant RFC são derivados por propósito. Não há aleatoriedade ou relógio real determinando fatos sintéticos. commandId, principal, sessão, dataset e epoch ficam fora da raiz e do hash semântico. Unicode não recebe NFC implícito; ordem é binária explícita.

Vetores executados por `t0005-engine.test.ts`, seed ignis-t5-001 e versões ratificadas:

| Vetor | Valor observado/esperado |
|---|---|
| Raiz K | `c34f30939c52547b789c2813f02d9334c4270de0801baed6f2c8c3a83e9d1809` |
| camera/000001 criticality, contador 0 | `b12f8b380e59c6e218e7684773ce2834635355f6da91f9b55e993a881f4b1ac3` |
| Mesmo campo, contador 1 | `3098980dee3fb388ee19cb7bf3d60cd0bd9bc2bd1dd52bbdef91154984e7461c` |
| Criticidade / cameraType | `5` / `ptz` |
| UUID recurso câmera | `bfa4f130-8707-8cdc-a917-9a3489efb4ba` |
| UUID evento / pedido câmera | `d39bc62c-c2fc-8fd7-81a8-bed504e1d7a3` / `e2021913-ba08-8c07-9922-7d58101f4441` |
| barrier_gate/000001 openingWidthM | `19.763` |
| Rejeição n=10 | threshold 4294967290; 0xffffffff recusado, próximo valor aceito; teto de tentativas também exercido |

Além de comparar hash, testes com seed diferente comparam atributos produzidos e validam a receita. Fronteira de data civil America/Sao_Paulo, precisão, ordenação, Unicode composto/decomposto e limites são exercidos. SerialNumber/enrollment e logicalKeys têm sequências estáveis e unicidade contextual.

## F. Manifesto, hashes e proveniência — A03/A04

Manifesto persistente contextual contém configuração normalizada G, versões, catálogo/políticas referenciados, contagens, revisão de criação, origem/comando pai, hashes, P inicial e associações. mode=baseline, tickDuration=null e regionVersion=null. P inclui os fatos/eventos iniciais contratados, sem contexto externo, ator, commandId ou relógio real. G não inclui expectedRevision, que continua parte da identidade do comando C02.

effectiveAt=recordedAt=baseTime sintético; receivedAt e wallRecordedAt são relógios reais separados. Proveniência `synthetic_baseline`; auditoria real não é falsificada. GET devolve revisão atual separada da criação. Edição posterior aumenta a revisão cadastral sem recalcular P/contentHash do manifesto. Replay posterior à edição devolve a resposta inicial original, sem nova revisão.

Preset observado em dois epochs isolados de QA:

- parametersHash: `e3cc6e5d7ee0051b3d47de5d51a3fa9a0bfcce1de27d5f2d230cebbc0ec5983f`.
- contentHash: `1b5ba2701306fcf9acf0840a21d37aca18ef200942381b171cd5ee6a935f6172`.
- manifestId contextual: `db9fdcbe-df62-8613-9e4e-5b52e5df2528` em ambos, com auditorias reais distintas.

## G. Revisão, eventos e recibos

Planejamento puro e limitado ocorre antes do lock de escrita. `BEGIN IMMEDIATE` revalida credenciais/contexto/demo antes do recibo. Mesma Kc equivalente retorna status/corpo originais; divergente conflita. Só comando novo verifica manifesto, vazio, referências e expectedRevision nessa ordem. Uma geração publica R+1 uma vez, eventos de criação individuais com ordinais 1..N, manifesto fechado e um recibo pai `demo.generate.v1` na mesma transação. Resposta 201 é entregue após COMMIT.

Inventory/Agent oferecem unidades internas que exigem transação aberta e usam validação normal existente; Maintenance recebe ID interno confiável. Demo não escreve estado de domínio por SQL paralelo. Wrappers públicos continuam com operações, hashes, recibos, respostas e semântica antigos. Equipamento/Agent isolados seguem evento único ordinal 1. Corridas em processos reais demonstram um efeito com mesma Kc ou conflito com Kcs diferentes; escritor independente produz busy 503 limitado. Processo interrompido no item intermediário, antes ou depois do commit deixa zero grupo ou grupo inteiro. Leitor independente durante a interrupção vê somente revisão anterior ou revisão completa, nunca prefixo publicado.

## H. API, interface e observações de QA

GET/POST `/api/v1/datasets/{datasetId}/epochs/{epoch}/demo-data` usam envelope contextual e no-store. GET informa tipo/elegibilidade/motivo/limites/versões/manifesto; operational autorizado retorna inelegível DEMO_ONLY e mantém o inventário acessível. POST revalida sessão, Origin, CSRF, grant, escrita/demo/epoch. Erros 400/401/403/409/413/422/429/500/503 preservam os códigos ratificados. Não há endpoint público de recibos ou capability externa de preparing.

UI implementa preparação/revisão/cancelamento, confirmação única, manifesto e retry explícito da mesma intenção em memória. Campos/disparos ficam bloqueados durante envio/incerteza. Reautenticação conserva guarda/chave/corpo; troca de epoch exige descarte explícito. Fechar a aba perde a intenção e provoca consulta ao reabrir; nenhum POST ou recuperação inventada ocorre. GET falho após 201/replay mantém confirmação. Rótulos, mensagens textuais, foco e largura reduzida foram observados; não houve ensaio de leitor de tela.

Durante a execução foram corrigidos: observação reativa que disparava GETs repetidos ao receber contexto equivalente; DataCloneError ao clonar corpo reativo do Vue (cópia passa pelo objeto original); foco perdido após cancelamento (agora retorna à mensagem). Os fluxos foram novamente observados após as respectivas correções. Um timeout da ferramenta em diálogo nativo foi recuperado e a recusa/aceite de descarte repetida, sem contornar o contrato.

<a id="i-matriz-v02-t5"></a>
## I. Matriz V02-T5-01–26

Expectativas/modalidades integrais na [fonte de verificação](VERIFICATION_GUIDE.md#v02-t5). Abreviações de evidência: **E** engine; **C** contract; **I** integrity; **S** security; **R** runtime, nos cinco arquivos `apps/server/test/t0005-*.test.ts`. **M** é interação assistida real descrita abaixo, não homologação humana.

| Caso | Resultado | Evidência observada |
|---|---|---|
| V02-T5-01 | PASS | E/C/I: P/hash/IDs iguais entre fixtures; contextos distintos no mesmo arquivo |
| V02-T5-02 | PASS | E: outra seed altera atributos/hash, conserva receita/contagens válidas |
| V02-T5-03 | PASS | E: raiz/fluxos/contador/rejeição/unsigned/UUID/grades/Unicode/ordem/data |
| V02-T5-04 | PASS | E/C/I: logicalKeys/IDs/séries/matrículas contextuais, colisão local recusada sem salt |
| V02-T5-05 | PASS | C: 20 cadastros pelos serviços, 14 schemas/políticas |
| V02-T5-06 | PASS | E/C + regressão T4: normalizadores reais, atributos/grades/faixas e enums |
| V02-T5-07 | PASS | C/P: not_installed, unknown, sem observação inferida; radar legado regressado |
| V02-T5-08 | PASS | E/C: 5+5+5+5, 15 pedidos e política/causa/data civil corretas |
| V02-T5-09 | PASS | E/C: seis ausentes/vinte pares, papéis e regionId null |
| V02-T5-10 | PASS | C/I: G/P/hash, 26 membros/eventos, revisão 1 e snapshot após edição |
| V02-T5-11 | PASS | C/S/R/M: replay após edição, nova sessão e reinício conserva resposta/efeito |
| V02-T5-12 | PASS | C: mesma Kc com guarda divergente conflita; identidade cobre configuração |
| V02-T5-13 | PASS | R: processos simultâneos mesma Kc, um grupo; busy de escritor independente |
| V02-T5-14 | PASS | R: Kcs diferentes disputam, um baseline e um conflito |
| V02-T5-15 | PASS | I: SQL direto adversarial, 12 fronteiras de rollback e serialização inválida |
| V02-T5-16 | PASS | R: interrupções partial/before_commit/after_commit e leitura externa enquanto pausado |
| V02-T5-17 | PASS | S/I: sessão/Origin/CSRF/grant/read-only/operational e FKs/joins contextuais |
| V02-T5-18 | PASS | S: retired precede replay; preparing externo 409 sem efeito; expiração 401 |
| V02-T5-19 | PASS | C/S/I: segunda Kc, cadastros e referências divergentes intactos |
| V02-T5-20 | PASS | E/S: entradas negativas e códigos HTTP, extras, JSON duplicado, 413 e 429/retry |
| V02-T5-21 | PASS | R: máximo 200/30, medidas K, reabertura/replay e corrida real no máximo |
| V02-T5-22 | PASS | S + inspeção: schema/rotas sem telemetria/ScenarioRun/ticks/reset/histórico/mapa |
| V02-T5-23 | PASS | I + suíte completa: upgrade 3 populado/backup e 117 regressões preservadas |
| V02-T5-24 | PASS técnico manual assistido | M24: dois epochs, manifestos/contagens/amostras/P/hash iguais, tempos reais distintos |
| V02-T5-25 | PASS técnico manual assistido | M25: preparação, revisão/confirmar/cancelar, teclado/foco, 390 px, limite 31 e operational |
| V02-T5-26 | PASS técnico manual assistido | M26: 401/reacesso, perda pós-commit/retry/reinício, epoch/descarte, fechar/consultar, GET 503 após replay |

### Evidências manuais recuperáveis M24–M26

Ambiente: Windows, navegador integrado do aplicativo, backend compilado loopback 3000 e frontend compilado via proxy de QA 5173. Banco **exclusivamente descartável** `.tmp/t0005-review-20261025/qa.sqlite`. Demo `00e961fd-818f-438c-acfc-8a54a7804cdf`, ator `operator:d04d105c-0258-42cb-82db-389170cfa6f6`. Epochs 2/3 têm os baselines; 1/4/5 usados somente para rascunho/cancelamento/descarte, sem recursos. Trocas de epoch foram fixture SQL identificada nesse banco, nunca funcionalidade de produto. Contexto operacional negativo: `10000000-0000-4000-8000-000000000003`, epoch 1, mesmo banco descartável.

Pré-condições comuns: contexto explicitamente configurado, login real, grant, schema 4; seed/baseTime/preset ratificados. Evidências locais ignoradas: [logs HTTP](../.tmp/t0005-review-20261025/http.jsonl), [snapshots SQLite](../.tmp/t0005-review-20261025/db.jsonl), [comparação de projeções/amostras](../.tmp/t0005-review-20261025/comparison.json). Não contêm segredo/cookie/CSRF; são artefatos locais recuperáveis nesta máquina, não arquivos versionados. Os resultados essenciais estão transcritos neste relatório para não depender da permanência de `.tmp`.

| Prova | Passos, esperado e observado | Evidência / resultado |
|---|---|---|
| M24 — reprodução isolada | Gerar mesmo preset em epoch 2 e 3; comparar manifesto, P e amostras câmera/Agent. Esperado equivalência contextual com auditorias próprias. Observado P byte a byte igual, hashes da seção F, 26 recursos/15 pedidos/26 eventos/um recibo/revisão 1 em cada epoch; integrity_check ok, FK sem linhas | comparison.json/db.jsonl; PASS |
| M24 — amostras/tempos | Câmera `DEMO-CAMERA-000001`: ID/vetores E, ptz/criticidade5/not_installed, ponto −23.557066/−46.648392, pedido unknown. Agent `DEMO-AG-000001`: ID c472e60f-f431-8a73-9322-8905f4cc6efa, unknown, ponto −23.54842/−46.633735, sem pedido. Ambos iguais entre contextos, região null. effectiveAt/recordedAt 2026-10-24T12:00:00.000Z; receivedAt reais 2026-10-25T11:53:04.842Z e 11:55:13.159Z | Comparação persistida e manifestos observados na interface; PASS |
| M25 — preparar/cancelar/acessibilidade | Abrir demo vazio, conferir defaults/14 categorias, Tab, Enter para revisar/cancelar. Esperado nenhum POST; observado cancelamento textual e banco/revisão zero. No código final, foco retorna a Resultado da geração. Quantidade Agents=31 bloqueou revisão com mensagem de máximo30; restaurar6 permitiu revisão. Formulário observado a 390×844, rótulos/campos e ações legíveis | form-390.png; cancel-final.ax.txt; epochs 4/5 zero; PASS |
| M25 — operational | Compilar UUID operacional de QA, abrir gerador. Esperado inelegível sem perder acesso. Observado tipo operational, DEMO_ONLY, ausência de formulário de geração, inventário/sessão de consulta preservados | operational-blocked.png/operational.ax.txt e GET200; PASS |
| M26 — perda de sessão | Revisar epoch2, expirar somente sessão QA, confirmar. Esperado401 sem efeito e mesma intenção após login. Observado401, dados/intenção bloqueados, reacesso com mesmos campos/guarda; log do reenvio mantém commandId/bodyHash | access-needed.png; POST401 às 11:52:40Z; PASS |
| M26 — incerteza/reinício/replay | Proxy reteve resposta201 por16s após commit; timeout cliente12s. Esperado campos bloqueados e retry explícito. Observado servidor com grupo completo enquanto UI incerta. Reiniciar backend no mesmo arquivo, reenviar: 201 replay, mesma chave `864ffe5a-a32b-4a7b-ab12-2d77fc2f9e71` e bodyHash `01e61b426a3e1d3d4af77f3b53947b821c5a23cba2bc769888145fc4e698aa04`, um grupo/revisão/recibo | uncertain.png; logs 11:53:04.928Z e 11:53:46.851Z; PASS |
| M26 — GET isolado falho | Armar503 somente no GET posterior ao replay; POST já confirmado. Esperado manter confirmação e permitir consulta. Observado “Geração original confirmada por replay”, manifesto/counts visíveis e consulta indisponível. Novo GET200 remove erro; sem novo POST | confirmed-get-failed.png; GET503 11:53:46.858Z / GET200 11:53:53.959Z; PASS |
| M26 — fechar sem chave | Epoch3, segunda resposta201 perdida; confirmar commit por SQLite, observar incerteza e fechar efetivamente a aba antes de retry. Reabrir app e consultar. Esperado somente leitura, sem chave recuperada/duplicação. Observado20/6/15, manifesto existente, sem botão retry nem novo POST. Kc original `f86f3c66-4ac3-4873-85cf-05dbff5ae904` continua único | uncertain-before-close.png, reopened.png/reopened.ax.txt, manifest-viewport.png e logs; PASS |
| M26 — epoch e descarte | Rascunho seed rascunho-epoch-4, fixture muda4→5; confirmar contexto, recusar diálogo: envio antigo bloqueado. Solicitar novamente e aceitar diálogo real explicitamente: defaults restaurados somente no5. Esperado nenhum remapeamento/POST; observado epochs4/5 revisão0, sem recursos/manifestos/recibos | epoch-blocked.ax.txt, epoch-discarded.ax.txt/png, db.jsonl e logs 11:58–11:59Z; PASS |

As capturas citadas estão na mesma pasta local de QA. Exemplo: [confirmação preservada com GET indisponível](../.tmp/t0005-review-20261025/confirmed-get-failed.png). Navegador, proxies e servidores iniciados para essas provas foram encerrados. Nenhum banco operacional do responsável foi aberto/modificado.

Critérios GF-T5-01–12 permanecem HUMAN_APPROVED **como contrato**. Evidência técnica cobre contexto/limites/preset/revisão (01–04), intenção/manifesto (05–06), retry/reacesso/epoch/fechamento/GET (07–11), teclado/foco/rótulos/largura reduzida (12). Homologação humana da implementação continua pendente. V02 espacial/polígonos/fronteiras/classificação regional permanece NOT_RUN em T0006; V03/J01 e V04 temporal não foram encerrados por esta matriz.

## J. Execuções automatizadas e regressões

Ambiente observado: Node **24.22.1**, npm **11.19.1**, Windows, SQLite **3.53.4**; foreign_keys=1, journal_mode=wal, synchronous=2/FULL, busy_timeout=1000. Sem instalação de dependências nesta execução. Builds/testes escrevem somente artefatos ignorados e bancos de teste.

| Execução | Resultado observado |
|---|---|
| `npm run typecheck` final | PASS, incluindo servidor, frontend e testes |
| `npm run test:t0005` | PASS: build dos dois aplicativos + 42 testes/5 arquivos; rodada 08:56:55 local |
| `npm test` final | PASS: build frontend/backend + **159 testes/15 arquivos**; rodada 08:59:58 local, duração Vitest14.90s |
| T0001 | 19/2 PASS na suíte completa |
| T0002 | 33/4 PASS, incluindo 21 V00-I e integrações existentes |
| T0003 | 17/2 PASS, preservando os16 V01-T3 e teste de processo existente |
| T0004 | 48/2 PASS, preservando catálogo/contratos/crash/migração antigos |
| T0005 | 42/5 PASS na suíte completa final, após correções de UI |

O comando específico T0005 precedeu o ajuste final de foco no cancelamento; o build/typecheck e a suíte completa foram executados depois desse ajuste e a interação do foco também foi observada. Não se presume resultado de execução interrompida: falhas iniciais de syntax da migration, referência de variável, path da fixture, tipos de props e clone/observação Vue foram corrigidas e as provas pertinentes repetidas. A tentativa inicial de preparar fixture tornando o ponteiro ativo não-ready encontrou503 do gate de prontidão existente; a prova correta usa preparing externo com ativo ready e recebeu409, sem modificar esse gate legado.

Na suíte anterior somente a expectativa de ledger de `t0003-inventory.test.ts` foi ampliada de1–3 para1–4; nenhuma asserção de contrato removida/enfraquecida. Instalação limpa do driver nativo em ambiente inteiramente novo **não reproduzida**. Os oito grupos futuros C02, C03/C04/C05, J01 e a ressalva MANUAL_INCONCLUSIVE histórica T0003 permanecem, independentemente das novas provas.

## K. Máximo 200 Equipment/30 Agents — A05

Rodada final em arquivo SQLite real descartável; configuração máxima com200 cameras e30 Agents, validada pelo mesmo serviço e contrato HTTP. 230 recursos/membros/eventos completos, revisão1; resposta201, integrity_check ok e foreign_key_check vazio. O preset20/6 continua distinto do limite.

| Medida | Resultado observado |
|---|---|
| Serviço síncrono, planejamento + comando | 722.7481 ms |
| Espera para adquirir BEGIN IMMEDIATE | 0.0604 ms |
| Lock de escrita até COMMIT | 648.4926 ms |
| RSS antes → depois | 113,070,080 → 163,188,736 bytes |
| heapUsed antes → depois | 31,658,824 → 47,030,040 bytes |
| High-water RSS do processo Vitest | 195,516 KiB; não é pico isolado da operação |
| Corpo de resposta | 21,376 bytes no serviço e no HTTP |
| SQLite + WAL + SHM antes → depois | 395,336 → 2,624,256 bytes; crescimento2,228,920 |
| Reabertura/replay por dois processos novos | 537.6745 ms incluindo startup; ambos201/replay |
| Geração máxima concorrente em contexto novo | 1,179.2714 ms incluindo startup; um201 novo e um201 replay, somente230 recursos/revisão1 |
| Pipeline HTTP via Fastify inject | 561.0161 ms; não inclui transporte de rede |

Os números desta tabela pertencem à rodada inicial. Registro bruto: [maximum.json](../.tmp/t0005-evidence/maximum.json), regravado por cada execução posterior do teste, inclusive as rodadas P2. Memória é amostra antes/depois e high-water do worker, sem profiler/pico exclusivo ou isolamento da carga da máquina. Lock inclui criação do grupo, serialização e recibo; medições não constituem SLA nem benchmark geral. Reinício/replay/concorrência foram efetivos, sem reduzir limites. Ensaio manual de reinício com socket HTTP ocorreu também em M26.

## L. Riscos, limites e bloqueios

Nenhuma incompatibilidade normativa remanescente ou dependência nova necessária foi identificada. Homologação/aceite humano são pendentes por governança. Não foram ensaiados leitor de tela, outros sistemas operacionais, ambiente inteiramente novo de instalação nativa, disco fisicamente cheio, queda física de energia ou corrupção por administrador. Falhas SQL/serialização/commit, processos interrompidos e leitura concorrente foram exercidos no alcance descrito; não equivalem aos ensaios físicos ausentes.

Intenção/CSRF ficam em memória conforme contrato: fechar/recarregar pode perdê-los. O manifesto permite conferir estado, sem endpoint público de recibos ou promessa de recuperar commandId. Coordenadas são demonstração cadastral, sem infraestrutura regional ou validade de endereço real. Alterações futuras terão de preservar interpretação de operações/receitas versionadas, snapshot e ordinais; não foram implementados seus consumidores. [Pendências atuais](KNOWN_ISSUES.md#implementacao-t0005), C01–C05/J01/ADRs e limites históricos preservados.

<a id="m-homologacao-humana"></a>
## M. Instruções de homologação humana

1. Revisar diff e este relatório mantendo main/HEAD e trabalho não versionado. Não usar banco operacional. Definir DATABASE_PATH para **arquivo descartável novo identificado** e um segredo local próprio no backend. Não executar reset ou apagar banco anterior.
2. Com dependências existentes, executar `npm run typecheck`, `npm run test:t0005` e `npm test`. Se instalar em ambiente novo, registrar separadamente o resultado do driver; esta entrega não o presume.
3. Parar processos antes de upgrade; preservar cópia consistente de banco/WAL. Executar `npm run db:migrate` explicitamente no arquivo escolhido e guardar o datasetId demo retornado. Para T0005 não é necessário provisionar operational.
4. Configurar VITE_IGNIS_DATASET_ID com esse UUID demo; manter DATABASE_PATH/OPERATOR_SECRET no backend. Iniciar `npm run dev`, ou executar `npm run build` seguido de `npm start` para distribuição local. Não usar prefixo VITE_ para segredo. O [README](../README.md#executar-a-fundacao-t0001) detalha execução/contexto.
5. Acessar com segredo, confirmar contexto e abrir baseline. Conferir seed/baseTime/versões20/6/14; revisar/cancelar e comprovar ausência de escrita; revisar/confirmar, consultar manifesto/lista/detalhe e confirmar estados/pedidos/coordenadas. Segunda geração deve mostrar manifesto existente, sem substituição.
6. Para reprodução M24, usar dois bancos descartáveis novos, mesma receita e comparar hashes/amostras. Para M26, o proxy local de QA permite armar perda201/GET503; rotas `/__qa/arm` existem somente no harness ignorado, nunca no produto. Arquivos de apoio locais são `proxy.mjs`, `db.mjs`, `compare.mjs` na pasta QA. `db.mjs` está fixado ao banco/UUID descartáveis deste relatório; não reutilizá-lo contra outro banco. Diálogos reais de descarte devem ser recusados/aceitos explicitamente. Não tratar troca de epoch de fixture como operação disponível ao usuário.
7. Registrar PASS/FAIL/NOT_RUN e limitações próprias, incluindo recuperação, teclado e largura reduzida. Manifestar o aceite humano somente após essa revisão; esta entrega e seus PASS assistidos não autorizam esse registro por conta do agente nem liberam T0006.

## N. Governança e integridade final

T0005 foi executado exclusivamente sob autorização individual, com implementação concluída e verificações automatizadas obrigatórias aprovadas. T5-D01–D16/A01–A05 e GF-T5 HUMAN_RATIFIED/HUMAN_APPROVED preservados em suas fontes. Sem DONE/HUMAN_ACCEPTED; T0001–T0004 continuam aceitos e T0006–T0020 não autorizados. ADRs e contratos normativos não foram editados.

Conferência final SHA-256 contra o snapshot inicial: **64/79 arquivos preexistentes idênticos**, 15 alterados e nenhum ausente. Os 15 alterados são exatamente os arquivos preexistentes enumerados em B; ADRs, fontes normativas técnica/funcional, migrations 0001–0003, lockfile/configurações restantes e relatórios anteriores estão entre os64 preservados. **15 arquivos novos não rastreados**, todos enumerados em B. Artefatos ignorados de teste/build não entram nesses totais. [Registro bruto de integridade](../.tmp/t0005-evidence/integrity.json).

Conferência documental: **20 Markdown e 416 referências locais válidas**, incluindo os artefatos locais de evidência; nenhuma referência quebrada. As20 definições de ticket, 16 decisões T5 e cinco ajustes permanecem nas fontes; no guia, critérios/modalidades anteriores e de T0005 preservados, com atualização somente dos resultados T5 e do texto de estado/rastreabilidade.

Comandos finais: `git diff --check` **sem erros**, exit0 (avisos de conversão futura LF/CRLF não são erro de whitespace); `git diff --cached --quiet` exit0/índice vazio; HEAD ab4afd6 e main mantidos. `git ls-files --others --exclude-standard` lista os15 arquivos novos de B. `git diff --stat`: **15 arquivos rastreados, 144 inserções e72 exclusões**; esse comando não inclui os15 novos ainda não rastreados. Verificação adicional de whitespace desses arquivos novos sem ocorrências. Nenhum staging/commit.

Saída de `git status --short`:

```text
 M README.md
 M apps/server/src/app.ts
 M apps/server/src/auth.ts
 M apps/server/src/idempotency/command.ts
 M apps/server/src/inventory/agents.ts
 M apps/server/src/inventory/maintenance.ts
 M apps/server/src/inventory/service.ts
 M apps/server/src/persistence/store.ts
 M apps/server/test/t0003-inventory.test.ts
 M apps/web/src/App.vue
 M docs/KNOWN_ISSUES.md
 M docs/REPO_CURRENT_STATE.md
 M docs/TICKETS.md
 M docs/VERIFICATION_GUIDE.md
 M package.json
?? apps/server/migrations/0004-demo-baseline.sql
?? apps/server/src/demo/
?? apps/server/src/inventory/demo-references.ts
?? apps/server/test/support/t0005-child.ts
?? apps/server/test/support/t0005-fixture.ts
?? apps/server/test/support/t0005-process.ts
?? apps/server/test/t0005-contract.test.ts
?? apps/server/test/t0005-engine.test.ts
?? apps/server/test/t0005-integrity.test.ts
?? apps/server/test/t0005-runtime.test.ts
?? apps/server/test/t0005-security.test.ts
?? apps/web/src/DemoData.vue
?? docs/T0005_REPORT.md
```

Arquivos de produto, testes e documentação permanecem disponíveis para revisão humana.

**T0005_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION**

<a id="p2-corrections"></a>
## O. Fechamento da auditoria corretiva P2 e retomada segura — 25/10/2026

Autorização específica: “T0005 | Correção dos achados P2 e verificação direcionada”, seguida de “T0005 | Retomada segura após interrupção por limite de uso”. A retomada concluiu as pendências existentes; não reiniciou T0005 nem atribuiu aceite humano. **Parecer corretivo: T0005_P2_CORRECTIONS_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION.** Estado do ticket preservado: **T0005_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION**.

### A–B. Estado encontrado, preservação e arquivos

Git conferido nas duas entradas: main/ab4afd6fbeb0a0ee27124b5a6c8dc9c18d0348c8. Árvore não limpa era esperada e foi preservada. Início da correção:15 arquivos rastreados modificados e15 novos,94 arquivos não ignorados no snapshot SHA-256. Na retomada:15 rastreados modificados e18 novos,97 arquivos no snapshot; as duas correções e os16 testes novos já existiam, com175/17 PASS no log anterior. Faltavam observação final da intenção incerta/epoch, documentação e conferências finais. Esses resultados históricos foram distinguidos da nova execução após a retomada.

| Arquivo no alcance P2 | Alteração |
|---|---|
| `apps/server/src/demo/integrity.ts` — novo | Leitura independente do snapshot, associações e eventos persistidos; comparação canônica e erro de integridade |
| `apps/server/src/demo/service.ts` — já existente, não rastreado | Chama a conferência ao montar o manifesto, no GET e antes da resposta de geração/commit |
| `apps/web/src/DemoData.vue` — já existente, não rastreado | Inclui review na guarda; preserva revisão antiga visível/bloqueada e explicita seu contexto |
| `apps/server/test/t0005-p2.test.ts` — novo | Dez testes de integridade/reprodução isolada/rollback/histórico/ordem/associações |
| `apps/server/test/t0005-p2-ui.test.ts` — novo | Seis testes do setup real do SFC/Vue; após retomada, reforçada igualdade integral da intenção antes/depois da recusa |
| Este relatório, guia, estado real, pendências, backlog e README | Evidência atual e contagens; fontes normativas não alteradas |

Nenhuma reimplementação de código de produto na retomada: as correções existentes foram inspecionadas e preservadas. A única adição de teste nessa etapa foi comparar profundamente a intenção original — commandId/corpo/expectedRevision/contexto — além da identidade do objeto já testada. Sem configuração/dependência nova, migration ou alteração de Inventory/Agent/Maintenance/C02 público nesta correção.

### C. P2-01 — diagnóstico, correção e provas

**Antes:** `projection()` recebia views cadastrais e `projectItem()` fabricava o evento esperado, inclusive reason/evidenceIds/changes. Comparar essa projeção ao plano não demonstrava que o evento gravado tinha os mesmos campos semânticos. O achado da auditoria era procedente; os PASS iniciais de A04 não comprovavam essa parte específica.

**Depois:** `assertBaselineIntegrity()` consulta `demo_member` e `operational_event` no dataset/epoch do manifesto, usando **ORDER BY revision,ordinal** e a revisão de criação. Confere quantidade, sequência, manifesto/logicalKey, recurso/kind, IDs de evento/pedido, ator/comando e vínculos temporais. Decodifica o changes_json efetivamente gravado, rejeita estrutura incompleta, campo duplicado/extra e before diferente de null na criação. Mapeia as views enriquecidas contidas nos changes para B e ordena os changes semânticos por fieldPath. reason e evidenceIds vêm do payload persistido; action/resourceVersion/ordinal/tempos vêm da linha real. Não chama makePlan para fabricar os dados lidos.

O mapeamento de B reutiliza o formato canônico já existente, mas os valores vêm dos eventos gravados. Compara P integral e SHA-256 contra o snapshot/hash imutável, e G contra parametersHash. A conferência roda dentro da transação consistente do GET e da geração; falha antes do COMMIT de geração reverte todos os efeitos. Em leitura, falha gera `BaselineIntegrityError`, entregue pelo envelope HTTP existente como500 INTERNAL_ERROR sanitizado, sem reparo ou reescrita. Replay mantém o contrato C02 de devolver o recibo original; consulta histórica usa os eventos iniciais, nunca as views editadas atuais.

Snapshots internos podem ultrapassar64KiB. Sua leitura usa JSON interno com exigência de bytes canônicos e validação pelo serializador existente, sem ampliar o limite do parser HTTP ou alterar o algoritmo/hash ratificado. Nenhum trigger/FK/CHECK ou migration foi modificado.

| Prova P2-01 | Observado / resultado |
|---|---|
| Baseline íntegro | Geração201 e GET200; todos os perfis/pedidos/vínculos verificáveis — PASS |
| reason divergente | JSON alterado antes do INSERT real; linha alterada observada dentro da transação; nova conferência detecta e devolve500; grupo/revisão/recibo zerados — PASS negativo |
| evidenceIds divergente | Mesma técnica, evidência não vazia realmente gravada; detecção e rollback integral — PASS negativo |
| changes divergente | Marca alterada no changes_json realmente gravado, sem mudar view/plano; detecção e rollback integral — PASS negativo |
| Reprodução do alcance anterior | Somente em fixture, teste desabilita a nova conferência via spy: fluxo anterior confirma201 apesar de reason errado. Restaura a conferência e verifica erro de integridade/GET500 no mesmo arquivo, sem reparar dados — PASS como demonstração do defeito anterior e da detecção atual |
| Edição legítima posterior | PATCH aumenta revisão para2; GET permanece200, bytes do manifesto e hash inicial intactos; replay mantém resposta original — PASS |
| Ordem dos changes | Ordem bruta invertida no primeiro evento é mapeada/ordenada canonicamente; mesmo contentHash em contextos isolados — PASS |
| Grupo incompleto/associação incorreta | Quatro injeções isoladas no resultado da leitura: evento ausente, recurso, ordinal ou comando divergente; todas detectadas. As constraints append-only/FKs impedem adulterar esses grupos pelo fluxo real; os testes anteriores de SQL direto foram repetidos sem enfraquecê-las — PASS negativo |

Os testes negativos usam bancos locais descartáveis. Uma verificação que identifica a divergência esperada conta como PASS do teste negativo, não como baseline íntegro. A reprodução anterior com spy é expressamente um ensaio isolado; o verificador nunca é desabilitado no produto.

### D–E. P2-02 e cenário prioritário de intenção incerta/epoch

**Antes:** a guarda verificava dirty/pending, mas abrir revisão com defaults deixava ambos falsos. A mudança de epoch apagava review sem confirmação. **Depois:** review também exige descarte. Ao recusar, review/corpo/target permanecem; a revisão antiga exibe seu dataset/epoch/revisão e fica bloqueada, com confirmar/cancelar desabilitados no contexto diferente. Aceitar chama o reset apenas após confirmação explícita e consulta o novo contexto. O send continua barrando contexto divergente; nenhuma troca/cancelamento envia POST.

Provas atuais usam banco **exclusivamente descartável** `.tmp/t0005-p2-review-20261025/discardable.sqlite`, dataset demo **291ca637-6f99-470b-899b-c891506a8422**, schema4; nenhum banco operacional. Epochs são fixtures controladas, sem criar operação de reset no produto. Backend3000/proxy5173 iniciados só para QA, posteriormente encerrados. [Logs HTTP](../.tmp/t0005-p2-review-20261025/http.jsonl) e [snapshots SQLite](../.tmp/t0005-p2-review-20261025/db.jsonl) registram resultados sem segredo/cookie/CSRF.

| Cenário | Modalidade e evidência observada | Resultado |
|---|---|---|
| Revisão default, recusa | Navegador: revisão do1, troca para2, diálogo real recusado; corpo default e contexto original1 continuam visíveis, confirmação desabilitada. defaults-refused.ax.txt/png. Sem POST/recursos/recibos | PASS técnico manual assistido |
| Revisão default, aceite | Navegador recuperado: revisão do2, troca2→3, diálogo real aceito; revisão descartada e novo formulário aberto. defaults-accepted.ax.txt e GET200 do3; zero gravações | PASS técnico manual assistido |
| Seed alterada | Revisão com p2-seed-alterada no3; troca3→4 recusada conserva seed/revisão3 bloqueadas. seed-refused.ax.txt; aceite/reset também cobertos no teste Vue | PASS assistido na recusa + PASS de componente em recusa/aceite |
| Contexto limpo | Formulário4 sem revisão/alteração, troca4→5 sem diálogo e sem POST. clean-context.ax.txt/logs | PASS técnico manual assistido |
| Confirmação e GET503 | Epoch5 confirma um baseline; proxy perde201. Retry explícito devolve replay201 com mesma chave/bodyHash; GET seguinte503 mantém “geração original confirmada” e manifesto20/6/15. GET restaurado200. replay-get-failed.ax.txt/png | PASS técnico manual assistido e teste Vue |
| Intenção incerta antes da troca | Epoch6: POST201 confirmado pelo servidor, resposta retida16s, timeout cliente12s; UI permanece incerta. Kc0231bb48-d25f-40fe-bf58-2efd6e078c7b, bodyHash1add248acb30847321e6bea55055f4a9ddeadaf27da51e1c872d6ebfd5c961ba. Somente26 recursos/um manifesto/um recibo/revisão1 no6 | PASS, UI + servidor |
| Intenção incerta, recusa6→7 | Após retomada, sessão anterior expirada recebeu401; reacesso manteve intenção e abriu diálogo real para7. Recusa observada: intenção anterior bloqueada, nenhuma mutação/remapeamento. pending-refused.ax.txt/png. Teste Vue confere profundamente commandId/corpo/expectedRevision0/contexto originais, pois a UI não expõe a chave interna | PASS técnico por evidência assistida + componente |
| Intenção incerta, aceite6→7 | Novo reacesso provoca confirmação assíncrona; aceite real observado. UI abre7/revisão0/defaults e sem retry antigo. Logs mostram apenas consultas/session; **zero POST demo-data no7**. Banco7 continua sem recurso/manifesto/recibo,6 conserva26 e seu único recibo. pending-accepted.ax.txt/png | PASS técnico manual assistido + componente |
| Teclado/foco/mensagens | Enter abriu revisão e acionou confirmação de contexto; mensagens/revisão/contexto e controles bloqueados observados. No navegador, foco observado em Resultado da geração durante bloqueio e em título do inventário após concluir consulta do pai; callback de foco verificado nos testes Vue | Verificado no alcance descrito; sem ensaio de leitor de tela |

As capturas e AX citados estão em `.tmp/t0005-p2-review-20261025/`. Artefatos locais ignorados, não versionados. [Exemplo: revisão default preservada](../.tmp/t0005-p2-review-20261025/defaults-refused.png). Pontos de reprodução essenciais foram transcritos acima para preservar evidência caso os temporários sejam removidos futuramente.

Dois episódios de timeout da automação ocorreram ao reabrir sincronamente diálogo nativo, inclusive via teclado. Não foram tratados como PASS de interação. As abas foram recuperadas/encerradas pela API documentada, e as confirmações observadas foram feitas pelo fluxo assíncrono de confirmação de contexto/reacesso existente, sem alteração do produto para contornar a ferramenta. O cenário prioritário completo teve recusa e aceite reais após retomada; não resta MANUAL_NOT_RUN nesse cenário. A comparação profunda da chave interna é evidência automatizada, não alegação de leitura dessa chave na tela.

### F–H. Verificações atuais após retomada e regressões

| Execução | Resultado realmente observado |
|---|---|
| Direcionados `vitest run .../t0005-p2.test.ts .../t0005-p2-ui.test.ts` | **16 testes/2 arquivos PASS**, 12:33:00 local, após reforço da comparação integral da intenção |
| `npm run typecheck` | PASS após retomada, servidor/frontend/testes |
| `npm test` | **Build frontend/backend PASS e175 testes/17 arquivos PASS**, início12:33:56 local; Vitest24.37s |
| T0001–T0004 |117 regressões atuais PASS:19/2 +33/4 +17/2 +48/2, sem alterar suas asserções nesta correção |
| T0005 |58/7 PASS na suíte completa:42 existentes +10 P2-01 +6 P2-02 |
| Manifesto/eventos/determinismo/replay/epoch | Suítes T0005 completas repetidas; hashes/vetores originais e snapshot após edição aprovados |
| SQL direto/crash/concorrência/máximo200/30 | Testes anteriores repetidos e PASS; constraints/migrations preservadas |

O teste Vue **compila e executa o setup real de DemoData.vue com a reatividade Vue**, mockando somente rede/dialog e destino de foco no harness Node. Não duplica a condição numa implementação alternativa. Esse teste comprova a máquina de estados, não layout, teclado ou janela nativa; a evidência de navegador está separada na tabela. Usa somente ferramentas já instaladas (@vue/compiler-sfc/esbuild/Vue); nenhuma dependência/configuração adicionada.

As rodadas anteriores175/17,16/2 e35/3 são evidências históricas distintas, não substituíram a execução atual. Durante o incremento, o verificador inicialmente usou o parser HTTP para snapshot interno maior que64KiB; o teste íntegro recusou a geração. Foi corrigida somente a leitura interna canônica, preservando o parser/limite HTTP. A suíte final cobre o máximo e os casos válidos/negativos após essa correção. Após retomada não houve nova alteração de produto.

### I–J. Documentação, riscos e limitações

Relatório, estado real, backlog, pendências, README e guia sincronizados com contagens/evidência atuais. Critérios V02-T5 e contratos ratificados mantidos; acrescentada rastreabilidade P2 para V02-T5-10/15/26 e GF-T5-09. Os PASS históricos A–N permanecem datados; esta seção substitui somente a alegação incompleta sobre conferência dos eventos e a cobertura faltante de defaults/intenção na troca.

Nenhuma pendência técnica bloqueante identificada no alcance dos dois achados. A prova não oferece proteção contra administrador que altere schema/desabilite integridade ou reescreva conjuntamente snapshot/hash/eventos. GET em divergência rejeita, não repara. Preservadas limitações de instalação nativa limpa nova, leitor de tela, outros sistemas e ensaios físicos; C01–C05/J01/ADRs e ressalva histórica de T0003 não encerrados. T0006–T0020 não autorizados. Sem design novo, mapa, reset ou funcionalidades posteriores.

### K. Integridade final Git

Branch **main**, HEAD **ab4afd6fbeb0a0ee27124b5a6c8dc9c18d0348c8** preservados. Contra o início corretivo: **86/94 arquivos idênticos**, somente os dois arquivos de produto corrigidos e os seis documentos de evidência alterados; três arquivos novos (verificador e dois testes). Contra a retomada: **90/97 idênticos**, alterados somente os seis documentos e o reforço de asserção no teste Vue; **nenhum arquivo de produto mudou após retomada**. Nenhuma remoção. [Hash/integridade corretiva](../.tmp/t0005-evidence/p2-integrity.json), [hash/integridade da retomada](../.tmp/t0005-evidence/p2-resume-integrity.json).

Contratos técnicos/funcionais/ADRs, migrations0001–0004, lockfile, configurações, wrappers antigos e demais arquivos já corretos estão entre os preservados byte a byte contra o início P2. Os novos não rastreados foram listados/inspecionados separadamente e verificados quanto a whitespace. Estado final acumulado de T0005: **15 arquivos rastreados modificados e18 novos**, sem staging; `git diff --cached --quiet` exit0. `git diff --check` sem erros/exit0; `git diff --stat`15 arquivos/152 inserções/72 exclusões, sem incluir untracked. Relação completa dos18 novos por `git ls-files --others --exclude-standard`; lista inicial N é histórica, com acréscimo de integrity.ts e dos dois testes P2. Nenhum commit, push, merge, stash ou comando destrutivo.

Conferência documental:20 Markdown,426 referências locais válidas, sem links quebrados. Matriz normativa de verificação preservada; somente evidência/rastreabilidade atualizada. As duas baselines/hash e o estado Git sustentam a preservação de todo o trabalho válido preexistente.

### L. Roteiro de homologação anterior ao aceite humano

Registro histórico: os passos abaixo orientaram a revisão. A seção P documenta o roteiro funcional efetivamente concluído e o aceite posterior, sem atribuir reexecução automatizada aos comandos que não foram repetidos.

1. Revisar o diff incluindo os arquivos não rastreados; conferir `integrity.ts`, sua chamada no serviço e a guarda/visualização da revisão em DemoData.vue. As fontes normativas e migrations devem permanecer idênticas.
2. Em bancos descartáveis novos, executar typecheck, os16 testes P2 e npm test. Inspecionar os negativos que gravam reason/evidenceIds/changes divergentes, a detecção/rollback e a verificação após edição legítima; não adulterar banco operacional.
3. No navegador, abrir revisão com defaults sem editar campos; mudar epoch apenas em fixture de teste, recusar e observar revisão/contexto antigos bloqueados; aceitar explicitamente, conferir novo contexto e ausência de POST. Repetir seed alterada e troca limpa.
4. Preparar resposta perdida após commit em fixture; recusar/aceitar descarte na troca, conferir logs, chave/corpo/guarda no teste e zero criação no novo epoch. Conferir também replay e GET503 sem desfazer confirmação. Se o diálogo travar, registrar a limitação sem inventar PASS e usar o teste de componente como evidência de estado.
5. Registrar sua própria homologação e eventual aceite posterior. A implementação corretiva e seus PASS técnicos não constituem aprovação humana, DONE/HUMAN_ACCEPTED ou autorização de T0006.

**Parecer histórico: T0005_P2_CORRECTIONS_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION**, sucedido pelo aceite abaixo.

<a id="aceite-humano-t0005"></a>
## P. Aceite humano final — 26/10/2026

**T0005: DONE / HUMAN_ACCEPTED; homologação funcional aceita pelo responsável.** Fonte humana nesta conversa: **“PROJECT IGNIS — Aceite humano final da T0005”**, após análise dos relatórios/evidências B2.1, B2.2 e B2.3. Declaração expressa: “concedo meu ACEITE HUMANO FINAL à homologação funcional da T0005”. A autorização atual é exclusivamente documental. [Estado do ticket e alcance da autorização](TICKETS.md#aceite-humano-t0005).

### P.1. Homologação funcional concluída

Rodada isolada `.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22`, dataset `2c56a9b9-a70a-4ef1-8c36-ef11d2cf0db6`. Os oito cenários do roteiro foram concluídos com PASS e considerados pelo responsável no aceite:

| Fase / cenários | Resultado funcional observado | Fonte existente |
|---|---|---|
| B2.1 / 1–5 | Revisão/cancelamento, recusa/aceite de troca de contexto com defaults ou seed alterada, troca limpa; ausência de geração indevida | [Relatório B2.1](../.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22/evidence/b21-supervised-01-report.md) |
| B2.2 / 6 | Commit com resposta perdida no epoch 4; descarte recusado/aceito após 4→5; baseline anterior preservado | [Relatório cenário 6](../.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22/evidence/b22-s6-01-report.md) |
| B2.2 / 7 | POST original e replay201 com mesma chave/corpo, GET503 isolado, confirmação preservada e recuperação GET200 após interrupção elétrica | [Recuperação supervisionada](../.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22/evidence/b22-s7-power-recovery-report.md) |
| B2.3 / 8 | Manifesto/hashes, 20 equipamentos/6 agentes/14 categorias/15 pedidos, estados not_installed/unknown, seis sem ponto/vinte pares e reabertura sem geração | [Relatório cenário 8](../.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22/evidence/b23-s8-01-report.md), [resultado estruturado](../.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22/evidence/b23-s8-01-result.json) |

No cenário 7, o banco/logs comprovaram o commit e o replay anteriores à queda. A observação visual anterior foi confirmada expressamente pelo operador durante a recuperação; a consulta GET200 posterior foi observada pelo agente. Não se alega continuidade da sessão em memória através do crash ou repetição de geração para recriar a prova.

No cenário 8, o agente abriu as duas listas e os 26 detalhes pela interface; o operador confirmou manifesto, listas/amostras apresentadas e reabertura. As confirmações humanas não são apresentadas como inspeção individual de todos os 26 detalhes. O fechamento técnico registrou 66 GETs 200, zero POST/controle, hashes recalculados coerentes e ausência de alteração em todas as linhas de 14 tabelas de domínio/contexto.

Estado persistido comprovado ao concluir B2.3: epoch 4 retired/revisão 1 e epoch 5 ativo/ready/revisão 1; cada baseline com 26 recursos, 20 equipamentos, 6 agentes, 15 pedidos, 26 eventos/membros e um manifesto/seal/recibo. Epochs 1–3 retired/revisão zero/vazios. Snapshots inicial/final iguais, integrity_check ok e foreign_key_check vazio. Nenhum banco foi reaberto ou alterado para registrar este aceite.

### P.2. Evidência histórica e verificações não repetidas

Typecheck/build PASS, **175 testes/17 arquivos** (117 regressões anteriores e 58 de T0005) e **16/2 direcionados** são resultados de 25/10 descritos na seção O. Os 159/15 e test:t0005 42/5 da entrega inicial também permanecem históricos. Nenhum desses comandos foi repetido em B2.3 ou neste registro documental; não se atribui uma nova execução completa dos casos GF-T5/V02 à rodada de oito cenários.

Instalação nativa inteiramente nova, outros sistemas e leitor de tela não foram demonstrados nesta homologação. O incidente elétrico real com recuperação comprovada não é um ensaio controlado de interrupção em todos os pontos de escrita; disco cheio e campanhas de falhas físicas continuam fora da evidência. C01–C05, oito grupos futuros C02, J01, V02 espacial/T0006, demais tickets e ressalvas históricas permanecem nas suas fontes. O aceite encerra T0005 no escopo F05, sem expandir as garantias técnicas observadas.

### P.3. Registro documental e preservação

Foram conferidas as 62 âncoras de arquivos/prefixos da B2.3 e preservados os 80 arquivos atuais de evidência da rodada. Os relatórios locais anteriores continuam com seus pareceres datados, inclusive as recomendações então pendentes; não foram reescritos para simular aceite anterior. Esta seção é o registro posterior da decisão humana.

Somente `README.md`, `docs/TICKETS.md`, `docs/REPO_CURRENT_STATE.md`, `docs/KNOWN_ISSUES.md`, `docs/VERIFICATION_GUIDE.md` e este relatório foram atualizados. Branch main, HEAD `ab4afd6fbeb0a0ee27124b5a6c8dc9c18d0348c8`, trabalho preexistente e índice preservados; sem commit. Código, testes, harness, contratos, ADRs, banco e serviços não foram operados. A validação desta formalização é documental, sem novos testes de aplicação/build/migration.

Conferência deste registro: somente esses seis Markdown diferem da baseline da formalização; os outros 91 arquivos não ignorados e os 80 arquivos de evidência permanecem byte a byte iguais. A listagem Git mantém os 15 rastreados modificados e 18 novos preexistentes, índice sem staging e hash do índice inalterado. Verificados 252 links/âncoras locais nos seis documentos, sem erro; `git diff --check` exit 0, com avisos de normalização futura LF/CRLF, sem erro de whitespace.

**T0001–T0005 DONE / HUMAN_ACCEPTED. T0006–T0020 NOT_AUTHORIZED.** Nenhum serviço da rodada foi encerrado; nenhuma nova tarefa está liberada. Registro concluído para revisão do responsável.
