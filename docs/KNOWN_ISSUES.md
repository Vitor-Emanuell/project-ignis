# Pendências e riscos

<a id="limites-c03"></a>
## C03 ratificado — limites preservados e pendências não bloqueantes do registro

Em 26/10/2026, **“PROJECT IGNIS — Registro formal da ratificação C03”** aprovou C03 **HUMAN_RATIFIED**, D01–D12 **RATIFIED**. [Fonte normativa](C03_TELEMETRY_CONTRACT.md), [governança](TICKETS.md#ratificacao-c03). A pendência de ratificação contratual está encerrada; **provas técnicas não**: V05/V06 NOT YET ACCEPTED. T0007 PLANNED / NOT_STARTED / NOT_AUTHORIZED; schema 5; migration 0006 RESERVED / NOT_CREATED. Menções históricas abaixo a C03 pendente permanecem como evidência anterior, não como estado contratual atual.

- FX-NONE-v1, FX-FIXED-v1, FX-MOBILE-v1 e FX-AGENT-v1 são exclusivamente fixtures/homologação isolada. Ativação de fontes reais exige aprovação explícita de perfis, canais, intervalos, métricas e bindings; atributos cadastrais não autorizam sensores/faixas físicas.
- Fonte autenticada pode declarar fato fisicamente falso: C03 protege identidade/causalidade, não comprova verdade física. Confirmação humana ou evidência independente contra fabricação completa exigiria outro escopo.
- Conclusão cobre somente causa/episódios até o corte inclusivo, preserva falha posterior elegível e não garante disponibilidade. CAS/conclusão pública serão integrados em T0012.
- Regressão temporal conhecida falha fechada, sem clamp corretivo silencioso do relógio. GET sem escrita não garante monotonicidade durável entre reinícios; revisão e corte são distintos e cliente deve recusar respostas obsoletas/regressivas.
- **Divergências não relacionadas ao fechamento C03, a reconciliar sob escopo próprio:** README ainda contém descrição de db:migrate/schema 4 e J01 pendente; relatório T0006 menciona REG-SUL enquanto migration 0005 contém REG-ZONA-EXPANSAO; o percentual 85,71% (12/14) atribuído ao baseline 20/6 exige explicitar preparação da fixture operacional, pois T0005 gera equipamentos not_installed. Não corrigidos silenciosamente nem reinterpretados como novos resultados. Aceite humano T0006 preservado.
- C01/C02/C04/C05, limites históricos de ambiente e ADRs Accepted — Conditional não são encerrados por ratificação C03. Nenhum teste/build/migration novo neste registro documental.

<a id="implementacao-t0006"></a>
## T0006 — aceite humano registrado e Gate J01 concluído, 26/10/2026

**T0006 DONE / HUMAN_ACCEPTED** e **Gate J01 PASS / HUMAN_ACCEPTED**, conforme aceite humano expresso em 26/10/2026 após **7/7 cenários funcionais PASS** ([fonte humana](TICKETS.md#aceite-humano-t0006), [relatório T0006](T0006_REPORT.md#aceite-humano-t0006)). Verificações automatizadas: `npm run typecheck` PASS, `npm run build` PASS, `npm run test:t0006` `9/3` PASS e `npm test` `184/20` PASS. Migration `0005` implementada (schema `5`); migration `0006` permanece reservada para T0007. T0007–T0020 NOT_AUTHORIZED.

- **Defeito do Cenário 7 resolvido antes do aceite:** a sobreposição de `el.className` pelo `patchClass` do Vue 3 ao ativar `tileFallbackActive` removia `.leaflet-container` (`overflow: hidden`) enquanto `scrollWheelZoom: true` capturava a rolagem da página. Corrigido em `OperationalMap.vue` (remoção de `:class` dinâmico do nó `ref="mapContainer"`, `scrollWheelZoom: false`, contenção estrita `26rem` / `overflow: hidden` / `contain: layout paint size`, `tileLayer.remove()` no fallback e limpeza em `close()`), com teste de regressão dedicado em `t0006-ui.test.ts` e reteste humano aprovado.
- **Observação não bloqueante de UX (Cenário 1):** na criação do baseline demonstrativo pela interface web, o código numérico HTTP `201` não é exibido diretamente na tela (a interface apresenta mensagem de confirmação, geração `1`, revisão `1` e contagens `20` equipamentos / `6` agentes / `15` solicitações).
- **Condições preservadas:** C01–C05 (incluindo C03 obrigatória antes de T0007, C04 antes de T0015 e C05 em T0013/T0014) e ADRs Accepted — Conditional permanecem vigentes.

<a id="implementacao-t0005"></a>
## T0005 — aceite humano registrado, riscos preservados, 26/10/2026

**T0005 DONE / HUMAN_ACCEPTED**, homologação funcional aceita expressamente pelo responsável em 26/10/2026 após os oito cenários B2.1–B2.3 PASS, incluindo a recuperação supervisionada do cenário 7. Pendência de aceite humano de T0005 encerrada; [parecer final](T0005_REPORT.md#aceite-humano-t0005), [fonte humana](TICKETS.md#aceite-humano-t0005). Typecheck/build PASS, 175 testes/17 arquivos (58 de T0005, incluindo 16 corretivos) e 26 V02-T5 PASS técnicos permanecem evidências históricas, não repetidas neste aceite. T0006–T0020 NOT_AUTHORIZED; limitações abaixo não dispensadas.

A01: IDs contextuais iguais coexistem no mesmo arquivo e em fixtures distintas. A02: constraints/FKs/triggers/certificado e SQL adversarial/crash demonstram ausência de grupo parcial. A03: baseTime sintético separado de receivedAt/auditoria reais. A04: P/hash imutáveis após edição. A05: máximo 200/30 medido e aprovado no ambiente local, sem promessa de desempenho geral. O relatório contém medidas e alcance das garantias, incluindo memória antes/depois e high-water do processo de teste, sem alegar pico isolado da operação.

Auditoria independente encontrou P2-01 (comparação não verificava integralmente eventos gravados) e P2-02 (revisão de defaults não protegida no descarte). Ambos corrigidos e verificados no [fechamento corretivo](T0005_REPORT.md#p2-corrections): 16 provas direcionadas, rechecagem histórica após edição e observação de defaults/seed/troca limpa/intenção incerta/GET503. Intenção incerta6→7 concluída após retomada, sem POST no7. O harness Vue testa estados/foco por callback e não equivale a leitor de tela; a inspeção visual realizada e os episódios de timeout do diálogo estão discriminados no relatório. O parecer técnico anterior foi sucedido pelo aceite humano expresso vinculado acima.

Defeitos encontrados e corrigidos durante QA: reconsulta repetida por observação de array recriado, DataCloneError ao copiar corpo reativo de Vue e foco perdido ao remover botão de cancelamento. Fluxos correspondentes novamente observados. A ferramenta de navegador também apresentou timeout ao lidar com diálogo; a sessão foi recuperada e a prova de recusa/aceite explícitos repetida. Nenhum desses episódios foi ocultado por mudança do contrato ou marcado PASS antes da nova observação.

Limites preservados: instalação limpa do driver nativo em ambiente inteiramente novo não reproduzida; sem ensaio controlado de disco cheio/interrupção elétrica, leitor de tela ou portabilidade para outros sistemas. O incidente elétrico real do cenário 7 foi diagnosticado e recuperado com evidências preservadas; não equivale a uma campanha controlada de falhas físicas nem comprova recuperação em todos os pontos de escrita. Injeções de falha/processos reais e medição local mantêm o alcance documentado. C02 tem evidência adicional de demo.generate.v1, mas oito grupos de integração futura não encerrados; C03/T0007–T0012, C04/T0015, C05/T0013–T0014, J01, V02 espacial/T0006 e MANUAL_INCONCLUSIVE histórico T0003 permanecem. ADRs Accepted — Conditional intactos.

<a id="contratos-t0005"></a>
## Histórico — contratos T0005 ratificados, anterior às provas técnicas

Fonte humana “IGNIS — T0005 | Formalização documental dos contratos ratificados”. Pendência de escolha contratual do segundo parecer encerrada pela ratificação T5-D01–D16 com condições normativas A01–A05; GF-T5-01–12 HUMAN_APPROVED. [Backlog](TICKETS.md#contratos-t0005), [contratos](MVP_TECHNICAL_DESIGN.md#t0005-contrato), [gate](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0005). **T0005 PLANNED / NOT_AUTHORIZED; V02-T5-01–26 todos NOT_RUN**. Não confundir ratificação com prova técnica ou autorização.

| Condição normativa | Risco / prova futura obrigatória |
|---|---|
| A01 — identidades | Não presumir PK global/contextual: comprovar IDs iguais em duas gerações, referências completas e isolamento, preservando ator/dataset/sessão/catálogo globais |
| A02 — grupos | Schema atual só ordinal 1; evolução deve impedir grupo parcial por constraints/FKs/triggers/fechamento, com testes de SQL direto e crash. CHECK isolado não prova completude |
| A03 — tempo | recordedAt sintético não é auditoria/telemetria real; preservar receivedAt e proveniência para futuros consumidores |
| A04 — hash inicial | Persistir/verificar P canônica imutável; não recomputar histórico de cadastros editados ou excluir diferenças de negócio |
| A05 — máximo | Medir 200 Equipment/30 Agents: duração, lock, memória, resposta, SQLite/WAL, reinício/replay/concorrência. Inviável bloqueia aceite ou exige revisão humana; não reduzir limites silenciosamente |

Sem SQL de produto/migration ou teste novo nesta formalização; não há promessa de desempenho. V02 espacial, J01 e funcionalidades T0006–T0020 permanecem nos seus escopos. C01 conserva limitação de instalação limpa nova, C02 oito grupos futuros sem encerramento integral e C03/C04/C05/ADRs condicionais preservados. Inconsistências históricas de cabeçalhos fora dos documentos autorizados, inclusive arquitetura, não foram corrigidas; estados atuais são os registros posteriores do backlog/estado real.

<a id="implementacao-t0004"></a>
## Estado vigente — T0004 aceito, riscos e condições preservados

T0004 DONE / HUMAN_ACCEPTED pela declaração humana expressa T0004_HUMAN_ACCEPTED, conforme [aceite](TICKETS.md#aceite-humano-t0004) e [relatório](T0004_REPORT.md#aceite-humano-t0004). R-T4-01–07/GF-T4-01–12 preservados. Catálogo/Agent/API/UI/schema 3 e compatibilidade demonstrados por 117 testes/10 arquivos, 48 novos; aceite do ticket registrado expressamente, sem autorização dos posteriores ou dispensa das condições pendentes.

P16 recebeu provas técnicas de upgrade populado, backup, FKs/completude/exclusividade, rollback/queda, hashes/recibos/replays originais T0003 e regressão. Isso não equivale a ensaio de restauração administrativa de produção, dano físico, instalação nativa inteiramente nova ou benchmark. Risco operacional residual: revisão de backup/espaço/parada e preservação de escritas posteriores antes de qualquer recuperação real.

**V01-T4-19 — pendência de evidência encerrada tecnicamente:** os três subcasos receberam PASS observado na [homologação complementar](T0004_REPORT.md#homologacao-v01-t4-19): troca de epoch com cancelamento/aceite explícito do descarte e zero escrita; fechamento com intenção incerta, consulta após reabrir e um único cadastro; PATCH confirmado seguido de GET isolado 503, preservando confirmação e mostrando versão 2 ao restaurar consulta. Banco novo descartável, logs HTTP/SQLite e capturas identificados no relatório. Diálogos reais foram controlados nesta sessão; o timeout inicial permanece histórico. Nenhum defeito funcional confirmado. Parecer técnico anterior T0004_ALL_VERIFICATIONS_READY_FOR_HUMAN_ACCEPTANCE, posteriormente sucedido pelo aceite humano expresso de T0004. Testes automatizados anteriores preservados, não reexecutados nesta homologação documental/manual.

**V01-T4-24 — PASS manual novo:** duas abas com versão 3, B confirmou 4, A revalidou CSRF mantendo o rascunho antigo, recebeu VERSION_CONFLICT e só gravou 5 após consulta/comparação/revisão. [Imagem/log e sequência](T0004_REPORT.md#k-evidências-manuais-recuperáveis). Não altera a ressalva MANUAL_INCONCLUSIVE histórica de T0003.

C01 mantém a limitação de instalação limpa nova não reproduzida; C02 oito grupos sem fechamento integral, embora o uso cadastral tenha mais evidência; C03/T0007–T0012, C04/T0015 e C05/T0013–T0014 mantidos. J01 pendente, ADRs Accepted — Conditional, T0005–T0020 não autorizados. Textos protegidos de arquitetura/brief/ADRs e registros antigos continuam históricos conforme suas fontes; README sincronizado no escopo T0004. Sem nova dependência, commit, staging ou banco versionado.


<a id="aceite-contratual-t0004"></a>
## Histórico — ratificação T0004 registrada, anterior às provas de implementação

Decisão humana de 24/10/2026 “IGNIS — T0004 | Formalização do aceite contratual R-T4-01–07 e do gate funcional complementar”: [sete R-T4 HUMAN_RATIFIED](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao) e [12 GF-T4 HUMAN_APPROVED](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0004). Pendência documental de aceite de P16 encerrada somente nesse alcance; os riscos técnicos não foram declarados resolvidos. T0004–T0020 continuam PLANNED / NOT_AUTHORIZED, [24 V01-T4](VERIFICATION_GUIDE.md#v01-t4) NOT RUN e J01 pendente.

| Alcance de P16 | Estado / limite preservado |
|---|---|
| R-T4-01–03: catálogo, classificação e manutenção | HUMAN_RATIFIED conforme matrizes existentes; occupantCapacity inclui condutor, limites fictícios sem validade regulatória; radar v1/T03-C intactos |
| R-T4-04/05: Agent, localização e estados | HUMAN_RATIFIED; operational inicial de novo fixo exige declaração explícita e precondições, jamais inferência por ponto/endereço/base; sem transições adicionais |
| R-T4-06: evolução e compatibilidade | Plano HUMAN_RATIFIED; backup/migração/FKs/exclusividade/rollback/bytes/recibos e regressões ainda exigem execução futura autorizada |
| R-T4-07 / GF-T4-01–12 | Grupo HUMAN_RATIFIED e gate HUMAN_APPROVED; sem aceite de visual, J01, testes ou autorização de implementação |
| Demais riscos/condições | C01–C05/ADRs mantidos; instalação limpa em ambiente inteiramente novo não reproduzida, C02 integral não encerrada, C03–C05 nos respectivos tickets |

A ressalva manual entre abas permanece MANUAL_INCONCLUSIVE, sem defeito confirmado; V01-T3-13 continua PASS histórico. Fontes protegidas e sincronização histórica D07 permanecem fora do escopo. A preparação de P16 abaixo conserva a rastreabilidade anterior ao aceite; suas pendências de ratificação não descrevem o estado vigente. Nenhum novo ticket, código, teste, migration, configuração, dependência, banco, staging ou commit nesta execução.


<a id="preparacao-t0004"></a>
## Histórico — preparação T0004 e riscos, anterior ao aceite contratual

**P16 — preparação contratual pronta para revisão, implementação não autorizada.** Diretrizes humanas D05–D08 aprovadas para detalhamento, identificadas como T4-D05–T4-D08 sem substituir D05–D07 históricos. T0004 PLANNED / NOT_AUTHORIZED, [gate complementar](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0004) PENDING_HUMAN_APPROVAL, [24 novos V01-T4](VERIFICATION_GUIDE.md#v01-t4) NOT RUN. Não há defeito T0003 inferido da ausência de capacidades futuras.

| Pendência / risco (não ticket novo) | Evidência e impacto | Decisão / prova necessária |
|---|---|---|
| Ratificação de domínio | [R-T4-01–03](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao): 13 schemas/mobilidades/limites fictícios, capacidade incluindo condutor, totem estacionamento e viatura, radares não velocímetros, causas de manutenção por perfil | Aprovar/revisar detalhes explicitamente, sem lhes atribuir validade legal; manter radar v1/T03-C intactos |
| Agent/localização/estado inicial | R-T4-04/05: DTOs, matrícula/publicLabel/função, institutional, unknown e ramo operacional explícito com motivo; limitar outros estados iniciais é proposta | Ratificação humana e JF-06/gate complementar; não inferir estado por ponto nem abrir edição de atividade/transições |
| Migração com dados | Schema 2 restringe Resource/Equipment/CurrentState/Maintenance/Event a primeira fatia; nova completude propõe ciclos de FKs diferidas e reconstrução do grafo dependente | R-T4-06; backup consistente e prova V01-T4-05/23 com FKs ON, sem enfraquecimento ou alteração 0001/0002; falha exige rollback/revisão |
| Compatibilidade de comandos | Normalização não pode consultar categoria/estado mutável antes de replay; novos defaults indiscriminados mudariam bytes de radar antigo | Vetores pré/pós e recibos inalterados em V01-T4-13; manter operations/C02/canonicalVersion; preservar 69 comportamentos aceitos com três expectativas de etapa adaptadas e rastreadas |
| Aprovação funcional | Seleção/troca de categoria, JF-06, dados heterogêneos e recuperação ampliam a fatia aceita de T0003 | R-T4-07 e GF-T4-01–12 pendentes; gate/ratificação não substituem autorização individual |
| Fontes protegidas e histórico | README ainda descreve T0003 aguardando revisão; cabeçalhos históricos em arquitetura/brief/ADRs não refletem todos os aceites; log atual confirma T0003 versionado em 236d2e2 | Preservados por restrição desta execução; consultar estado vigente/TICKETS/relatório e registros posteriores. Sincronização geral D07 histórico exige escopo próprio |

Sem pendência de alternativa não especificada para improvisação no código: as escolhas candidatas estão fechadas para revisão em [12 técnica](MVP_TECHNICAL_DESIGN.md#t0004-contrato), porém não ratificadas. Eventual rejeição exige revisão documental anterior à implementação; não compensar com campo livre/schema arbitrário.

Ressalva entre abas permanece [MANUAL_INCONCLUSIVE](#concorrencia-manual-t0003), V01-T3-13 automatizado PASS histórico; V01-T4-24 só acompanha experiência com versão efetivamente obsoleta e CSRF válido. Não impor bloqueio automático se integridade automatizada/interação segura forem demonstradas, nem ignorar evidência futura de sobrescrita real.

C01 mantém limites já registrados; C02 oito integrações futuras sem fechamento integral; C03/T0007–T0012, C04/T0015, C05/T0013–T0014 e ADRs permanecem. J01 não concluído; gerador, mapa, observações, simulação, intervenção, analytics, jogos, tour e distribuição final continuam em T0005–T0020 sem autorização. Nenhum código, dependência, teste de aplicação ou commit nesta preparação.


Atualização em 24/10/2026: T0001/T0002 DONE / HUMAN_ACCEPTED; T0003 DONE / HUMAN_ACCEPTED por decisão do responsável em 24/10/2026. [Relatório e limitações](T0003_REPORT.md); [estado real](REPO_CURRENT_STATE.md#implementacao-t0003). T0004–T0020 não autorizados. Riscos técnicos futuros permanecem abertos.

| ID | Tipo / impacto | Encaminhamento e evidência para encerrar |
|---|---|---|
| P01 | Decisão arquitetural encerrada com condições; T0001 encerrado por aceite humano em 23/10/2026 | Três ADRs Accepted — Conditional; C01–C05 abaixo rastreiam pendências. [Aceite T0001](REPO_CURRENT_STATE.md#aceite-humano-t0001); demais tickets exigem autorização individual |
| P02 | Git/T0001 e contrato C02 versionados antes da implementação | Baseline T0002: main, HEAD a07e25b, working tree inicialmente limpa; alterações atuais sem staging/commit |
| P03 | Runtime/build/persistência verificados no Windows; familiaridade da equipe não medida | Node 24.22.1/npm 11.19.1 no PATH atual; instalação limpa e suíte no relatório T0002. Ambientes anteriores preservados no histórico |
| P04 | Risco: prazo até 27/10 comporta pouca estabilização e nove features | Seguir caminho crítico de TICKETS; reduzir volume/sofisticação, sem omitir features; reportar inviabilidade ao primeiro gate falho |
| P05 | Evidências técnicas Windows de T0002 reproduzidas e aceitas; outros ambientes NOT RUN | SQLite 3.53.4/WAL/FKs/FULL/timeout confirmados pelas suítes reproduzidas pelo responsável. Instalação limpa do driver nativo em ambiente inteiramente novo não reproduzida nessa validação humana. O npm ci/aviso nativo e o prebuild Windows são evidências da implementação, sem generalização a outros alvos |
| P06 | Risco: reset/ticks/missões concorrentes ou FKs sem contexto | Testes V04/V09/V10 de geração antiga, CAS e rollback; manter validação em toda transação |
| P07 | Limitação: pesos, limites de cobertura e horizonte sem validação empírica | Parâmetros aceitos como demonstração no ADR-0003; C05: executar avaliação temporal V08 e publicar limitações/resultados reais |
| P08 | Risco: histórico sintético circular ou com informação futura | Seeds/cenários reservados e snapshots temporais; V07/V08 verificam corte de conhecimento e baseline independente |
| P09 | Decisão: provedor de tiles/deploy não escolhido | Antes de publicação, verificar termos, disponibilidade, persistência e escrita segura; lista/polígonos locais como fallback cartográfico |
| P10 | Risco: SQLite síncrono e snapshots/seed grandes bloquearem ciclo | Orçamento limitado, lotes de staging, transações curtas e medições de ingestão/snapshot; revisar ADR-0001 se limites persistirem |
| P11 | Gate funcional de T0003 HUMAN_APPROVED; implementação aceita pelo responsável | [GF01–GF08](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional) e T03-C ratificados em 24/10/2026. Autorização individual posterior registrada em [TICKETS](TICKETS.md#autorizacao-t0003); T0003 DONE / HUMAN_ACCEPTED, conforme [aceite humano](T0003_REPORT.md#aceite-humano-t0003). JF-06/ampliações T0004/posteriores e J01 permanecem nos próprios gates; visual definitivo não iniciado |
| P12 | Evidência: regulamento da competição recebido apenas no briefing | Responsável confirmar versão oficial, submissão e critérios; não inventar exigências adicionais. Prazo foi adotado como informado |
| P15 | T03-A/B/C implementados no alcance de T0003; 16 V01-T3 PASS, sem encerrar riscos futuros | [Relatório](T0003_REPORT.md#e-matriz-v01-t3): perfil/refs/migração, preparo operational, API/UI e manutenção inicial explícita/atômica verificados. 1–200 km/h continua fictício sem validade regulamentar. Sem intervenção T0012, manutenção avançada ou categoria adicional; D05–D07 e condições arquiteturais futuras preservadas. Gate técnico não equivale a aceite humano |

<a id="concorrencia-manual-t0003"></a>
## Observação de validação — concorrência manual entre abas de T0003

**MANUAL_INCONCLUSIVE**, conforme validação independente do responsável registrada no [aceite T0003](T0003_REPORT.md#aceite-humano-t0003). A primeira tentativa foi recusada por CSRF_FORBIDDEN antes da guarda de versão; na segunda, autenticação atualizou o estado carregado e as alterações foram confirmadas sequencialmente. Não se reproduziu atualização efetivamente obsoleta nem se observou sobrescrita indevida.

V01-T3-13 automatizado permanece PASS, com concorrência real, replay antigo e no-op. A observação limita a conclusão sobre a experiência manual entre abas; não é defeito confirmado de integridade, não promove o teste manual a PASS e não impede o aceite humano formalmente concedido. Pode ser reavaliada futuramente, sem novo ticket automático ou autorização de implementação/correção nesta execução.

<a id="condicoes-do-aceite"></a>
## Condições do aceite — 23/10/2026

Aprovador: responsável pelo projeto; evidência: instrução humana “IGNIS — Formalização da Aprovação Arquitetural”, seções 1–2. [ADRs](adr/README.md) Accepted — Conditional. Decisão aprovada não equivale a correção contratual concluída, verificação técnica aprovada ou autorização de ticket. **Nenhuma condição técnica foi declarada atendida nesta formalização.**

| ID | Natureza / situação atual | Gate / responsável futuro | Evidência para encerrar |
|---|---|---|---|
| C01 | Evidências técnicas reproduzidas no Windows pelo responsável — ADR-0001 preservado | T0001/T0002 DONE / HUMAN_ACCEPTED; alcance limitado à validação registrada | [Aceite](REPO_CURRENT_STATE.md#aceite-humano-t0002): SQLite 3.53.4/WAL/FKs/FULL/timeout e suítes PASS. Instalação limpa do driver em ambiente inteiramente novo não reproduzida na validação humana; outros sistemas e V11 final NOT RUN |
| C02 | Fundação T0002 aceita, com 21 V00-I aprovados; integração integral pendente — ADR-0002 | Aceite exclusivo T0002; aplicação aos módulos exige autorização própria | [Chaves/projeção/JCS/SHA-256/recibos](MVP_TECHNICAL_DESIGN.md#idempotencia) preservados; 21 [V00-I](VERIFICATION_GUIDE.md#v00-idempotencia) PASS; oito grupos V05-I pendentes/NOT RUN. Sem pipeline Ce/Ke/Ks, reset real ou reservas; ADR e condição integral não encerrados |
| C03 | Correção contratual pendente — ADR-0002 | Revisão documental antes de T0007; implementação/verificação T0007 e integração T0012 | Precedência telemetria/conclusão, empate e episódios especificados; V05/V06 não reabrem causa por observação anterior e aceitam falha posterior legítima |
| C04 | Correção contratual pendente — ADR-0003 | Revisão documental antes de T0015; implementação/verificação T0015 | Liberação condicional por propriedade/versão da reserva; V09 não reabre resolved/cancelled nem sobrescreve disabled/stolen ou outros estados administrativos, inclusive sob concorrência |
| C05 | Limitação documental preservada; verificação técnica pendente — ADR-0003 | T0013/T0014 | P01/P02 permanecem heurísticos demonstrativos conforme seção 9; V07/V08 e resultados reais. Validade estatística/externa não demonstrada nem prometida |

Não há novo ticket. C02 recebeu preparação documental e implementação de T0002 especificamente autorizadas, sem alterar ADR-0002. C03/C04 ainda precisam de suas revisões específicas antes dos gates. Prazos/critério de entrada: [TICKETS](TICKETS.md#condicoes-do-aceite); casos futuros: [VERIFICATION_GUIDE](VERIFICATION_GUIDE.md).

<a id="preparacao-c02"></a>
### Resultado da preparação documental de C02

Registro histórico da preparação anterior, versionada em a07e25b. As afirmações de implementação ainda não autorizada e testes NOT RUN descrevem aquela execução; o resultado vigente de T0002 está na tabela acima e no relatório.

Ambiguidades efetivas estavam em I02 (escopo/hash sem algoritmo), seções 4/5 (hash que excluía apenas receivedAt e misturava input com clamp/tempos derivados), CommandReceipt (sem campos mínimos/ordem de consulta) e seção 6 (replay original versus duplicate, versão obsoleta e geração aposentada). Foram explicitadas nas fontes normativas, sem nova arquitetura: projeção fechada de input, schema estático, normalização tipada/JCS/SHA-256, Kc contextual por principal/operação, Ke/Ks futura, uma transação para efeito/recibo e replay antes de precondições mutáveis de domínio. Exceção de autenticação `/session` não armazena segredos/recibos contextuais. Não foi criado framework genérico.

**Parecer documental: T0002_CONTRACT_READY.** Nenhum outro bloqueio documental real identificado para a fundação limitada de T0002. Isso não é liberação de implementação nem aceite humano do contrato/ticket. Continuam gates técnicos de C01/parte técnica C02 (driver Windows, SQLite efetivo corrigido, FKs/WAL, durabilidade/rollback/concorrência e guardas), todos NOT RUN nesta execução. P14 é divergência de evidências/pré-requisitos já registrada, não prova de falha de execução de T0002. C03 impede fechar precedência antes de T0007, C04 impede fechar reservas antes de T0015; não bloqueiam a infraestrutura de recibos descrita. P13 mantém defasagens fora do escopo; ADRs Accepted — Conditional preservados, sem necessidade de mudar sua decisão ou texto para produzir o contrato.

<a id="defasagens-documentais-fora-desta-execucao"></a>
## Defasagens documentais fora desta execução

**P13 — correção documental parcial:** README foi sincronizado nas entregas T0001/T0002. SYSTEM_ARCHITECTURE.md e PROJECT_BRIEF.md ainda contêm descrições da revisão anterior (revisão aberta/ausência de Git/arquitetura não aprovada); sua revisão geral permanece fora desta execução. Consultar [AGENTS](../AGENTS.md), [ADRs](adr/README.md), [TICKETS](TICKETS.md) e [estado real](REPO_CURRENT_STATE.md). ADRs foram preservados, inclusive relatos históricos; autorizações individuais posteriores estão registradas em TICKETS e não liberam outros tickets.

**P14 — divergência de npm resolvida tecnicamente em T0002:** T0001 usou Node 24.22.1/npm 12.2.1 selecionados na sessão, enquanto o responsável validou Node 24.22.1/npm 11.19.1 no [aceite](REPO_CURRENT_STATE.md#aceite-humano-t0001). T0002 observou essas últimas versões no PATH, ajustou engines/packageManager e reproduziu `npm ci --offline --cache .tmp/npm-cache --no-fund`, tipos, build e testes com npm 11.19.1. A faixa atual é `>=11.19.1 <13`; não houve alteração da instalação global. Aviso do script nativo e restrições de DNS/loopback/processos estão no relatório. Outros sistemas operacionais permanecem NOT RUN.

## Parecer residual da revisão v1.1 — histórico anterior ao aceite

O texto desta seção é histórico; referências a aprovação/Git ainda necessários foram superadas pelo registro atual acima. Riscos técnicos sem evidência continuam abertos.

Na revisão v1.1, recomendada para aprovação **com ressalvas**, com P01–P12 então abertos conforme suas evidências. Corrigidas inconsistências documentais de dependência e aplicação antecipada de testes; nenhuma falha de implementação foi comprovada. Não há estimativa empírica de esforço que demonstre viabilidade dos 20 tickets até o prazo. O [calendário revisado](TICKETS.md#planejamento-v11) propõe checkpoints, não garantia.

A fundação agora especifica introdução incremental dos mecanismos, preservando transação/contexto/validação desde a primeira operação que os exige. Isso reduz antecipação de infraestrutura, mas não elimina risco de implementação de reset e concorrência. Provisão pública por visitante não deve bloquear primeira fatia local e permanece condicionada à escolha de publicação interativa.

Validade externa dos índices permanece não demonstrada; mesmo seeds reservadas não substituem dados reais. Resiliência cartográfica foi especificada sem adquirir recursos; requer teste futuro. Não há nova dependência externa nem mudança de stack proposta. Documentos de referência não autorizados para edição (README, AGENTS, brief, playbook e índice ADR) foram preservados; sua atualização futura, se necessária após aprovação, exige escopo próprio.

Decisões humanas ainda necessárias: aceitar/revisar os três ADRs, aprovar fundação incremental/gates/contingência v1.1 e os parâmetros demonstrativos; escolher modo de distribuição (local como mínimo, escrita pública somente com controles completos); autorizar separadamente Git, preparação do design funcional mínimo e depois T0001. Acabamento visual exige autorização/aceite próprios quando for solicitado.

## Possibilidades posteriores

Itens excluídos são mantidos unicamente no [brief](PROJECT_BRIEF.md#exclusoes). Possibilidades posteriores: hardware/credenciais reais, PostgreSQL/PostGIS se justificado, canal SSE após medição, autenticação corporativa, séries temporais/ML com validação externa e operação distribuída. Nenhuma gera ticket prioritário nesta entrega.

## Pendências documentais

Nenhum dos documentos essenciais solicitados foi adiado nesta entrega. Permanecem para fases posteriores: especificação visual/interativa após autorização de System Design, contratos executáveis/OpenAPI, versões e comandos reais, evidências de build/testes/validação analítica e runbook específico do provedor se houver deploy. Não foram tratados como implementação já existente. O aceite arquitetural atual está nos ADRs e não comprova essas entregas.
