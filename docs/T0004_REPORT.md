# T0004 — Relatório técnico do inventário heterogêneo

Data: **24/10/2026, America/Sao_Paulo**. Ticket exclusivo [T0004](TICKETS.md#aceite-humano-t0004). Estado vigente: **DONE / HUMAN_ACCEPTED**, por declaração expressa **T0004_HUMAN_ACCEPTED**, conforme [registro de aceite](#aceite-humano-t0004). Homologação complementar V01-T4-19: **três subcasos PASS**, conforme [evidências próprias](#homologacao-v01-t4-19). Sem commit. As seções A–N preservam a entrega e o parecer técnico anteriores ao aceite; referências nelas à prontidão ou à ausência de aceite descrevem aquele momento histórico.

## A. Baseline, autorização e retomada

Baseline inicial limpa: main, HEAD **820dad33b404627d94265652078d2558a654f9c6**, “docs: approve T0004 contracts and functional gate”. Autorização expressa posterior: **T0004_IMPLEMENTATION_HUMAN_AUTHORIZED**. [R-T4-01–07](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao) HUMAN_RATIFIED e [GF-T4-01–12](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0004) HUMAN_APPROVED preservados.

A retomada “IGNIS — T0004 | RETOMADA CONTROLADA DE IMPLEMENTAÇÃO INTERROMPIDA” encontrou o mesmo HEAD, 12 arquivos rastreados modificados e nove novos arquivos de implementação/teste. Não existia este relatório; somente TICKETS havia recebido o registro de autorização. O código, a migração, as jornadas e os testes já estavam implementados. As evidências de navegador estavam em arquivos ignorados locais. A continuação preservou esse trabalho, concluiu documentação/integridade e repetiu verificações finais; não reiniciou o ticket nem alterou contratos.

Na retomada, snapshot SHA-256 de 78 arquivos rastreados/não ignorados permite comprovar que código, testes, configuração e demais fontes preexistentes foram preservados durante o fechamento documental. O diff final contra HEAD inclui o trabalho de implementação anterior, além desta documentação.

## B. Implementação e limites

Concluídos: catálogo versionado de 14 perfis, políticas iniciais por perfil, Equipment heterogêneo, Agent, localizações por tipo, estados iniciais explícitos, API contextual, validação estrita e jornadas Vue. Inventário reutiliza autorização e a unidade transacional/recibos de T0002/T0003.

Sem T0005–T0020: não há gerador de produto, mapa, geocodificação externa, observação dinâmica, telemetria, simulação, despacho, intervenção, analytics, missões ou novo design visual. Fixtures de teste não são F05. Não houve instalação de dependências; package-lock permanece intacto.

## C. Persistência, evolução e recuperação

Nova [0003-heterogeneous-inventory.sql](../apps/server/migrations/0003-heterogeneous-inventory.sql). 0001/0002 não foram editadas. Schema atual **3**; aplicação continua exigindo migração explícita, sem migrar/preparar no boot.

A migração conserva CategoryVersion do radar byte a byte, acrescenta os 13 perfis e category_policy imutável, copia o grafo dependente em tabelas temporárias transacionais e o reconstrói sem desligar foreign_keys. Resource usa referências geradas para Equipment/Agent, cadastro e CurrentState, com FKs diferidas que exigem completude no COMMIT. FKs com discriminador impedem especialização de tipo incompatível ou dupla especialização. Séries são únicas entre todas as categorias no contexto; matrículas têm unicidade própria.

Checks/guardas cobrem atributos exatos/tipos/faixas, mobilidade de catálogo, papéis de localização, causa de manutenção compatível, dimensões exclusivas de estado/atividade e eventos por tipo. Eventos e versões de catálogo/políticas continuam imutáveis/append-only. recursive_triggers=ON faz também REPLACE executar guardas DELETE, sem permitir sobrescrita silenciosa.

Store valida ledger/checksums/user_version e integridade antes da migração, e novamente na transação. Para schema 2, produz backup SQLite consistente por VACUUM INTO, com nome exclusivo `<DATABASE_PATH>.schema2-<UUID>.backup`, verifica abertura/integridade/FKs e só então atualiza. Não copia somente o arquivo principal com WAL ativo. PRAGMA defer_foreign_keys é restrito à transação e retorna 0 ao final.

Provas em SQLite real:

- Banco vazio e evolução 1→3; repetição não duplica/resseta dados.
- Schema 2 populado: IDs, dados, órgão, localizações, estado, pedido inicial, eventos, versões/revisões, grants, sessões e recibos preservados.
- Backup reaberto em schema 2 com recibos/sessão originais e integrity_check=ok.
- Perfil legado divergente recusado sem reparo; schema futuro/checksum inválido seguem regressões existentes.
- Falhas introduzidas em cópia, índice, trigger e ledger revertem DDL e dados.
- Processo interrompido dentro da migração, com o schema original e dados recuperáveis; aplicação posterior íntegra.
- FK check vazio e ausência de especialização/cadastro/estado no commit impedidas por persistência.

Operação futura: parar processos antes de migrar, conferir DATABASE_PATH/backup/espaço e preservar o banco antigo. Falha transacional reverte automaticamente; restauração de backup pós-commit exige parada, preservação da cópia atual e decisão humana se houver escritas posteriores. Não há comando destrutivo de downgrade nem promessa de recuperação de dano físico. A restauração administrativa de produção não foi executada.

## D. Catálogo — resultado por perfil

Manifesto normativo: [12.1 técnica](MVP_TECHNICAL_DESIGN.md#t0004-catalogo). Em cada linha abaixo, os testes exercitam criação, atributos válidos/limites/erros, edição/no-op/imutáveis e os três ramos de agenda. Valores/regras completas continuam na fonte ratificada; nenhuma faixa foi alterada.

| Perfil v1 | Mobilidade | Atributo específico | Resultado observado |
|---|---|---|---|
| fixed_speed_radar | fixed | regulatedSpeedLimitKmh | PASS; contrato T0003 intacto |
| red_light_radar | fixed | monitoredLaneCount | PASS |
| turn_radar | fixed | restrictedMovement | PASS |
| camera | fixed | cameraType | PASS; cadastro também no navegador |
| weighing_scale | fixed | capacityKg | PASS; inclui decimal positivo |
| inspection_vehicle | mobile | occupantCapacity | PASS |
| barrier_gate | fixed | openingWidthM | PASS; inclui decimal positivo |
| taxi | mobile | occupantCapacity | PASS; cadastro também no navegador |
| motorcycle_taxi | mobile | occupantCapacity | PASS |
| school_transport_vehicle | mobile | occupantCapacity | PASS |
| parking_totem | fixed | parkingSpaceCount | PASS |
| scooter | mobile | occupantCapacity | PASS |
| motorcycle | mobile | occupantCapacity | PASS |
| official_vehicle | mobile | occupantCapacity | PASS |

occupantCapacity inclui o condutor; limites novos são demonstrativos, sem validade regulatória. Uma categoria primária por equipamento; série contextual não ganha namespace por categoria. O frontend explica funções sobrepostas e não oferece mudança de categoria/versão de registro persistido.

## E. Agent, DTOs e HTTP

Implementados [agents.ts](../apps/server/src/inventory/agents.ts) e rotas de [routes.ts](../apps/server/src/inventory/routes.ts), conforme [DTOs ratificados](MVP_TECHNICAL_DESIGN.md#t0004-agent). Prefixo D=`/api/v1/datasets/{datasetId}/epochs/{epoch}`:

| Operação | Rota | Confirmação |
|---|---|---|
| Lista | GET D/agents | 200, snapshot contextual, total/page/pageSize/items |
| Detalhe | GET D/agents/{id} | 200, AgentView |
| Criação | POST D/agents | 201 após commit |
| Edição cadastral | PATCH D/agents/{id} | 200 após commit/no-op |

Agent possui UUID Resource, matrícula trim/uppercase única por contexto, nome/função fictícios, organização permitida, cadastro institutional, base opcional, atividade inicial unknown e versão. Não é Actor/conta, não recebe manutenção física, série, sensor, CPF, telefone ou residência.

POST/PATCH usam operações inventory.agent.create.v1/update.v1, commandId, recibo e replay; PATCH compara expectedVersion, não altera atividade/órgão/tipo, e no-op não cria evento/revisão. Matrícula duplicada retorna ENROLLMENT_CONFLICT. Consulta não revela entidade de outro contexto. Paginação estrita, ordem binária por matrícula/id e Cache-Control:no-store.

Equipamentos mantêm suas quatro rotas e operações anteriores. GET D/catalog retorna 14 perfis e categoryPolicies com referências organizacionais, ordenados por código/versão; nenhuma seleção implícita pelo índice zero.

## F. Frontend e GF-T4

[App.vue](../apps/web/src/App.vue), [api.ts](../apps/web/src/api.ts) e [LocationFields.vue](../apps/web/src/LocationFields.vue) implementam destinos Equipamentos/Agentes, lista/detalhe/edição próprios, seleção explícita de code/version, campos condicionais e localização por tipo.

Troca de categoria em rascunho exige confirmação na própria página; cancelar conserva categoria/atributos; confirmar conserva comuns e descarta específicos/solicitação/motivo incompatíveis. Referência cadastral incompatível é retirada sem converter o endereço. A primeira seleção não exige confirmação de descarte inexistente.

O frontend mantém uma intenção imutável em memória durante resultado incerto, impede editar seus campos e oferece reenvio da mesma chave/body/versão/contexto. Sessão perdida bloqueia o rascunho e revalida contexto antes de retomar. Conflito exige consultar/comparar e revisar explicitamente a versão antes de outra intenção. Replay confirma o resultado antigo, seguido de GET atual. No-op recebe mensagem de confirmação sem alterações.

Navegador: formulários de câmera, móvel e Agent, edição de Agent, duplicidade, categorias condicionais, troca confirmada/cancelada, sessão expirada/rascunho recuperado, resultado incerto e revisão de conflito exercitados. Teclado Enter/Tab, foco de feedback/revisão e largura reduzida de 390 px observados; sem overflow horizontal relevante no detalhe conferido. Não é auditoria completa de acessibilidade/leitor de tela.

GF-T4-01–12 continuam HUMAN_APPROVED como decisão funcional; a evidência de implementação está nos casos abaixo, sem transformar isso em aceite humano do ticket. Os três subcasos anteriormente residuais de V01-T4-19 foram executados na [homologação complementar](#homologacao-v01-t4-19).

## G. Manutenção, localização, estado e segurança

Os 14 perfis usam as causas específicas ratificadas, com solicitação apenas explícita e agenda dated/unknown/not_applicable. Omissão/null não cria pedido; próxima manutenção é projeção de Maintenance. Cadastro com pedido confirma/reverte Resource/especialização/localizações/estado/pedido/evento/revisão/recibo juntos. Nenhum boolean independente no equipamento, prioridade derivada de criticidade ou intervenção antecipada.

Radar v1 aceita somente not_installed inicial. Novos perfis aceitam o subconjunto ratificado; operational exige motivo explícito, e fixo exige referência installation e coordenadas completas. Nenhum endereço, ponto ou pedido ativa o recurso automaticamente. Agent inicia unknown; cadastro não altera atividade observacional.

CEP/UF, par numérico completo ou ambos null e faixas geográficas são validados. Mobile usa base cadastral; Agent usa referência institucional; base adicional permanece separada. Não se cria GPS, instante de observação, geocoding ou região fictícia; (0,0) explicitamente informado é um ponto válido, nunca sentinel de ausência.

Auth/Origin/CSRF/read-only/grants/contexto/epoch e códigos existentes preservados. Helper C02, JCS e canonicalVersion não foram alterados. Normalização de criação usa schemas imutáveis do input; PATCH usa união estática antes do hash e valida a categoria persistida depois do replay. Mesma chave com alvo/versão/body divergente conflita. Escrita BEGIN IMMEDIATE e unicidade/CAS preservam concorrência; ocupação esgota timeout limitado em 503, sem recibo parcial.

<a id="matriz-v01-t4"></a>
## H. Matriz individual V01-T4-01–24

Fontes e entradas/expectativas ratificadas permanecem na [matriz normativa](VERIFICATION_GUIDE.md#v01-t4). Um caso contratual pode ter vários testes; **48 testes novos não significam 48 critérios**. “Contrato” = [t0004-contract.test.ts](../apps/server/test/t0004-contract.test.ts); “Integridade” = [t0004-integrity.test.ts](../apps/server/test/t0004-integrity.test.ts). Os nomes dos testes identificam explicitamente os IDs agrupados.

| ID | Estado observado | Evidência e alcance |
|---|---|---|
| V01-T4-01 | PASS | Contrato: 14 perfis/sidecars/ordem/referências e categoria/versão desconhecida |
| V01-T4-02 | PASS | Contrato: teste por perfil, tipos/null/ausência/extra/faixas/enums, inteiros e decimais finitos; PATCH também verifica limite específico |
| V01-T4-03 | PASS | Contrato: perfil antigo/imutabilidade UPDATE/DELETE/REPLACE; versões preservadas no upgrade |
| V01-T4-04 | PASS | Contrato: mobilidade de cada perfil; campos imutáveis; UI fixo/móvel e categoria primária |
| V01-T4-05 | PASS | Contrato/Integridade: banco vazio/1/2, backup, cópia/índice/trigger/ledger, perfil inválido e queda real durante migração |
| V01-T4-06 | PASS | Contrato/Integridade + navegador: Agent, campos próprios, criação/consulta/edição/no-op, JF-06 |
| V01-T4-07 | PASS | Contrato/Integridade: matrícula normalizada, duplicidade em criação/edição, corrida e outro contexto autorizado |
| V01-T4-08 | PASS | Contrato/Integridade + T0003: série única entre categorias, matrícula independente e corrida |
| V01-T4-09 | PASS | Contrato: CEP/UF/textos/papéis; navegador normaliza CEP sem geocoding |
| V01-T4-10 | PASS | Contrato/T0003/C02: pares/faixas/tipos/null/zero explícito, sem coordenada inventada |
| V01-T4-11 | PASS | Contrato + navegador: institution/base/installation por tipo; sem posição/observedAt fabricados |
| V01-T4-12 | PASS | Integridade/T0003/C02: sessão/expiração/grant/Origin/CSRF/read-only/epoch/contexto, parser estrito/413/429/replay negado |
| V01-T4-13 | PASS | Golden T0003 pré-upgrade, hashes/recibos/replay, sessão preservada/renovada, divergências; proxy com resposta perdida e retry explícito após reinício |
| V01-T4-14 | PASS | Integridade: processos independentes para create/update, Kc equivalente/divergente, CAS/no-op e busy limitado; teste manual específico em 24 |
| V01-T4-15 | PASS | Integridade/T0003: falhas por write/pedido/evento/recibo/commit, rollback integral; serialização coberta pela regressão C02 |
| V01-T4-16 | PASS | Integridade/T0003 runtime: queda antes/depois de commit e reinício do mesmo arquivo; navegador também recuperou replay após reinício |
| V01-T4-17 | PASS | Contrato/Integridade: PATCH permitido/imutáveis, substituição de atributos, remoção de base e negativas; sem mudar estado/manutenção |
| V01-T4-18 | PASS | Contrato/Integridade: paginação/ordem/404/no-store; outra conexão confirma cadastro entre count/IDs e a resposta mantém snapshot antigo consistente |
| V01-T4-19 | PASS | Evidências anteriores de teclado/largura reduzida, categoria, duplicidade, sessão/rascunho e timeout/retry preservadas. Homologação complementar observou troca de epoch com cancelar/aceitar descarte, fechamento/reabertura com intenção incerta e GET isolado falhando após commit; passos, servidor e interface em K.1 |
| V01-T4-20 | PASS | Contrato: todos perfis, motivos/precondições, radar v1, unknown e rejeições; navegador confirmou mobile operational por declaração |
| V01-T4-21 | PASS | Contrato: 14×três agendas, causas/replay/omissão/negativas; T03-C intacta; manutenção explícita de taxi no navegador |
| V01-T4-22 | PASS | Typecheck/build/suíte completa 117/10; T0003 17/2; T0004 48/2; 69 regressões preservadas |
| V01-T4-23 | PASS | SQL direto real: recurso incompleto, especialização incorreta, ausência de cadastro/estado no commit, atributos inválidos e FKs |
| V01-T4-24 | PASS manual T0004 | Duas abas partiram da versão 3; B confirmou 4; A, após revalidar CSRF mantendo seu rascunho, recebeu VERSION_CONFLICT; comparação/revisão explícitas precederam a versão 5 |

V01-T4-19 foi inicialmente entregue com evidência parcial/MANUAL_NOT_RUN nesses três subcasos. O PASS atual decorre da execução complementar identificada em K.1, sem inferência a partir da guarda automatizada. Os 24 casos têm evidência PASS; isso não constitui aceite humano do ticket nem auditoria de acessibilidade além do alcance declarado.

## I. Execuções automatizadas e ambiente

Windows, Node **24.22.1**, npm **11.19.1**, SQLite efetivo **3.53.4**. PRAGMAs observados: foreign_keys=1, WAL, synchronous=2 (FULL), busy_timeout=1000; foreign_key_check=[].

Comandos reais do package.json, executados novamente na retomada anterior. **Não reexecutados na homologação complementar V01-T4-19**, que não alterou código/configurações/testes e utilizou os artefatos compilados existentes. Os PASS automatizados abaixo são resultados anteriores preservados. Publicar UUID no build: `VITE_IGNIS_DATASET_ID=10000000-0000-4000-8000-000000000003`; isso é referência pública, não credencial.

| Comando | Resultado |
|---|---|
| npm run typecheck | PASS, backend/Vue/configuração/testes |
| npm run build | PASS, também executado pelos scripts de teste |
| npm test | PASS — 117 testes em 10 arquivos |
| npm run test:t0003 | PASS — 17 testes em 2 arquivos |
| npm run test:t0004 | PASS — 48 testes em 2 arquivos |
| git diff --check | Sem erros de whitespace; avisos LF/CRLF discriminados no fechamento |

Os 117 são 69 anteriores + 48 novos; a evolução 36→44→47→48 novos corresponde ao acréscimo de segurança, processos/crash, falhas de migração, contexto/sessão e snapshot concorrente. Não foram apagados testes para manter uma contagem artificial.

Uma primeira execução Vitest no sandbox falhou EPERM ao renomear cache temporário, antes de descobrir/executar testes. A repetição fora do sandbox passou; não foi classificada como falha funcional. Nesta retomada, suítes com processos reais foram executadas fora dessa restrição. Houve erro de tipagem intermediário no foco da confirmação de categoria, corrigido antes dos PASS finais; nenhum diagnóstico foi ignorado.

Sem instalação limpa do driver em ambiente inteiramente novo, outro SO, benchmark de carga, auditoria de leitor de tela ou deploy. Esses limites não são convertidos em PASS por inferência.

## J. Compatibilidade com T0003

[Fixture golden](../apps/server/test/fixtures/t0003-upgrade.json) capturada executando os serviços originais de T0003/schema 2 antes de substituí-los: criação, edição e no-op reais, com respostas/eventos/recibos/hashes. O teste reconstrói a base com 0001/0002 originais, aplica 0003 e compara todos os dados antigos, preserva sessão, autentica o mesmo principal e reenvia os comandos. Os três retornam replay com corpo/status originais, sem novo efeito. Expectativas antigas não são recalculadas pelo novo normalizador.

| Teste histórico adaptado | Motivo e garantia mantida |
|---|---|
| V01-T3-01 | Sequência agora 1/2/3; upgrade de 1, checksums/repetição/preparo mantidos |
| V01-T3-05 | Catálogo ampliado; verifica 14 perfis e inclusão exata de CATEGORY/refs, mantendo criação/atomicidade/append-only |
| V01-T3-07 | camera agora existe; unknown_category preserva rejeição 422 de categoria inexistente; negativas de camera cobertas pelo schema próprio |

Nenhuma outra asserção de segurança/recibo/concorrência foi removida. SHA-256 dos arquivos preservados: 0001 `44128474386879ffa1c87dea21d5fbbe20f3b22df14e15f8e495c7a37e8bffd5`; 0002 `f5fa870b90aced323347ae29134a6499ef87fccacf1a3108acc141c6f8e38929`.

git diff dos dois arquivos permaneceu vazio. Esses hashes físicos não substituem o ledger: o migrador calcula SHA-256 integral do SQL com CRLF normalizado para LF, mantendo os checksums originais.

## K. Evidências manuais recuperáveis

Navegador in-app, com SQLite isolado **.tmp/t0004-review/ignis.sqlite**, operational dataset 10000000-0000-4000-8000-000000000003, epoch 1. Nenhum dado antigo do ambiente operacional foi limpo. Processos dev, backend compilado e proxy de teste foram encerrados ao final.

- Câmera UI-CAMERA-T4: enum ptz, localização sem ponto, not_installed e nenhum pedido automático.
- Agent UI-AG-T4: matrícula normalizada, instituição, unknown, edição de função; duplicidade recusada e corrigida por intenção revista. [Imagem de largura reduzida](../.tmp/t0004-review/agent-mobile.png).
- Táxi UI-TAXI-T4: campo total de ocupantes, troca câmera→taxi com cancelar/confirmar preservando série/marca e limpando atributos; declaração operational explícita, base sem ponto e pedido dated.
- Sessão artificialmente expirada somente no banco isolado: envio 401, dados protegidos ocultos/rascunho bloqueado, novo acesso ao mesmo contexto e rascunho recuperado/gravado.
- Proxy HTTP de teste em loopback, sem dependência: primeira resposta PATCH foi retida além do timeout do cliente após commit; interface mostrou resultado incerto e campos bloqueados. Backend reiniciado no mesmo arquivo; clique “Reenviar mesma tentativa” recebeu replay. [Log sanitizado](../.tmp/t0004-review/proxy-evidence.jsonl): commandId `6452617c-6f1a-4f93-8adc-a1910fa96dc8` e bodyHash `31c8e8c9e9ef85e5053f1b8b367f13e226277b8103b5735c7f2d8ea92aebef15` iguais; status 200 e replay=true. Versão 3, sem segunda alteração.
- Concorrência: câmera a94d48f2-a970-4cd7-8905-7f71fff3aed4 carregada em versão 3 nas abas 5173/3000. B confirmou versão 4. A recebeu inicialmente CSRF_FORBIDDEN devido ao cookie compartilhado; isso não contou como CAS. Após novo acesso, o rascunho/expectedVersion antigos permaneceram e o envio recebeu VERSION_CONFLICT. Consulta mostrou versão 4/valor de B e rascunho de A, com gravação bloqueada. Apenas revisão expressa liberou nova intenção/versão 5. [Imagem da comparação](../.tmp/t0004-review/conflict-review.png); log contém 403→409→200 em chaves distintas, sem expor cookies/CSRF.

A ressalva histórica MANUAL_INCONCLUSIVE de T0003 continua intacta em seu relatório. O PASS manual acima é evidência nova de V01-T4-24, não promoção retroativa daquele teste.

Imagens/log/proxy/banco são artefatos locais ignorados, não dependências do produto nem arquivos versionados; podem não existir em outro clone. A fixture golden e os testes automatizados são arquivos de entrega reproduzíveis. Não foram capturadas credenciais reais.

<a id="homologacao-v01-t4-19"></a>
## K.1. Homologação complementar V01-T4-19 — três subcasos PASS

Autorização: instrução humana “IGNIS — T0004 | Homologação complementar V01-T4-19”, exclusiva para executar/documentar os três subcasos. Execução em **24/10/2026, 20:43–20:45 America/Sao_Paulo** (logs em UTC, 23:43–23:45). main/HEAD 820dad33b404627d94265652078d2558a654f9c6, 16 arquivos rastreados modificados e dez novos já existentes; nenhum staging ou commit.

Ambiente: Windows, Node 24.22.1, navegador in-app e frontend/backend compilados da entrega anterior, sem rebuild, instalação ou modificação de produto. Banco **novo, exclusivamente descartável** `.tmp/t0004-v19-20261024/discardable.sqlite`, inicializado pelas migrations e prepareOperational existentes. Dataset público `10000000-0000-4000-8000-000000000003`, geração inicial 1; teste 1 cria/controla somente a geração 2 dessa fixture. Não foi executado reset do produto/T0009. Nenhum banco operacional anterior ou artefato de revisão anterior foi alterado.

Instrumentação local ignorada: [proxy.mjs](../.tmp/t0004-v19-20261024/proxy.mjs), [db.mjs](../.tmp/t0004-v19-20261024/db.mjs), [HTTP sanitizado](../.tmp/t0004-v19-20261024/http.jsonl) e [snapshots SQLite](../.tmp/t0004-v19-20261024/db-evidence.jsonl). Proxy loopback :5173 serve o frontend compilado e encaminha API ao backend :3000 em modo dev, mantendo Origin/CSRF. Não substitui funções da aplicação, window.confirm, validações ou handlers de UI; os diálogos reais foram respondidos por getJsDialog/dismiss/accept. Logs não contêm segredo, cookie ou CSRF. Artefatos locais podem não existir em outro clone; os identificadores/resultados relevantes estão transcritos abaixo.

### Teste 1 — troca de epoch com rascunho: PASS

- **Pré-condições:** sessão de teste autorizada, dataset acima/epoch 1/revisão 0, banco sem recursos/eventos/recibos. Destino Agentes, novo rascunho com matrícula `V19-EPOCH-DRAFT`, nome “Rascunho da geração um” e função fictícia; nenhum envio.
- **Passos:** manter o formulário aberto; na fixture SQLite, transação com epoch 1→retired, criação de epoch 2 ready/revisão 0, cópia da referência ORG_LOCAL para 2 e active_epoch→2. Na interface, clicar Confirmar contexto; cancelar o diálogo real. Clicar Confirmar contexto novamente e aceitar o descarte. Abrir novo cadastro.
- **Esperado:** impedir uso/transposição do rascunho antigo; descarte somente explícito; novo contexto/formulário sem dados antigos; nenhuma escrita cadastral automática.
- **Observado na interface:** cancelar exibiu “Rascunho antigo bloqueado. Confirme explicitamente seu descarte antes de abrir outro contexto.” e ocultou inventário/formulário operacional. Aceitar exibiu “Geração alterada. O rascunho antigo foi descartado; revise o contexto antes de iniciar outra intenção.”, geração 2/revisão 0 e lista vazia; novo formulário tinha matrícula/nome/função vazios.
- **Servidor:** log até esse ponto contém somente sessão e GETs de domínio; nenhum POST/PATCH de cadastro em qualquer epoch. Snapshot posterior confirmou zero Resource/Agent/evento/recibo e ambas revisões 0, com epoch 1 retired/2 ready. Sem envio ao contexto antigo ou novo.
- **Evidências:** [rascunho na geração 1](../.tmp/t0004-v19-20261024/01-epoch-draft.png), [cancelamento e bloqueio](../.tmp/t0004-v19-20261024/01-epoch-cancel.png), [descarte aceito/geração 2 vazia](../.tmp/t0004-v19-20261024/01-epoch-accepted.png), log/snapshots acima.
- **Limite:** troca administrativa feita exclusivamente por SQL na fixture, não por uma feature de reset futura. Testado o descarte de rascunho ainda não enviado; a perda de chave de intenção enviada é verificada separadamente no teste 2.

### Teste 2 — fechar com intenção incerta: PASS

- **Pré-condições:** mesmo banco/dataset, epoch 2/revisão 0, novo Agent `V19-LOST-001`, dados e endereço institucional fictícios válidos, coordenadas ausentes. Proxy armado para reter apenas a próxima resposta POST/PATCH bem-sucedida por 16 s, além do timeout de 12 s do cliente; depois fecha essa resposta, sem cancelar o commit upstream.
- **Passos:** Salvar cadastro; observar timeout/resultado incerto com campos bloqueados e botão Reenviar mesma tentativa. Consultar SQLite independentemente para confirmar commit. Fechar a aba sem reenviar/descartar a intenção; abrir uma nova aba da aplicação. Consultar Agentes e Abrir V19-LOST-001 antes de qualquer nova criação.
- **Esperado:** um único cadastro confirmado no servidor, perda da intenção em memória ao fechar, nenhuma promessa/recuperação automática de chave, consulta do persistido antes de nova intenção, sem duplicação involuntária.
- **Observado na interface:** “Não foi possível confirmar o resultado. Os campos estão bloqueados; reenvie a mesma tentativa para consultar sua confirmação.” antes de fechar. Reabertura usou sessão existente somente para consulta e exigiu novo acesso para escrever; não mostrou rascunho nem reenvio recuperado. Lista apresentou exatamente 1 de 1 registros; detalhe mostrou UUID `c3cf68cf-681f-46e7-95cd-6cc53dec9654`, matrícula V19-LOST-001, versão 1, atividade unknown.
- **Servidor:** POST 201 às 23:44:36.820Z, commandId `85a5dee0-716e-4872-9936-9a18db037992`, replayed=false; request_hash canônico do recibo `14f883a353925c04d57cba01f98a872bd98c31d414511d1d0f2f9cef970b9a9c`. SQLite antes de fechar e depois da consulta: **1 Resource, 1 Agent, 1 evento, 1 recibo e revisão 1**. Log da reabertura contém apenas GETs, sem reenvio automático ou segunda criação. O bodyHash de transporte do proxy é distinto do request_hash canônico e não foi confundido com ele.
- **Evidências:** [resultado incerto](../.tmp/t0004-v19-20261024/02-uncertain.png), [detalhe após reabrir](../.tmp/t0004-v19-20261024/02-reopened-detail.png), log/snapshots acima.
- **Limite:** fechamento da aba/interface, não encerramento de todo o processo do navegador. A sessão HttpOnly persistiu legitimamente; intenção/chave/CSRF em memória não foram restaurados. Nenhuma nova criação foi emitida após a conferência, pois o registro desejado já existia.

### Teste 3 — falha isolada do GET posterior: PASS

- **Pré-condições:** mesmo Agent/epoch 2/versão 1 consultado; novo acesso para obter CSRF. Editar função para “Homologação GET confirmado”. Proxy armado para deixar o PATCH responder normalmente e falhar **somente o próximo GET de detalhe desse UUID** em 503; demais rotas e backend continuam disponíveis.
- **Passos:** Salvar cadastro; capturar resposta de commit e GET isoladamente falho; observar mensagens da interface. Conferir persistência no servidor. Restabelecimento automático do proxy após a única falha; clicar Cancelar e consultar inventário, abrir o registro novamente, sem repetir PATCH.
- **Esperado:** confirmação da mutação preservada, indisponibilidade apenas da consulta, sem transformar commit em resultado incerto ou reenviar a mutação; GET restaurado mostra os valores gravados.
- **Observado na interface:** manteve a mensagem própria **“Cadastro atualizado.”** junto ao erro de consulta DATABASE_UNAVAILABLE. O texto “QA: consulta indisponível após gravação confirmada.” veio da falha injetada pelo proxy, não é mensagem atribuída ao produto. Não ofereceu Reenviar mesma tentativa nem disse que o commit foi desfeito. Na recuperação, listagem/detalhe mostraram função alterada e versão 2.
- **Servidor:** PATCH 200 às 23:45:31.572Z, commandId `d23d7d09-55f6-4041-9a1d-bf7af0cdab47`, replayed=false, versão 2; GET correspondente 503 às 23:45:31.578Z; GETs de lista/detalhe depois 200. Resultado final: **1 Resource, 1 Agent, 2 eventos, 2 recibos, revisão 2**, função persistida e versão 2; nenhum PATCH repetido. integrity_check=ok e foreign_key_check vazio.
- **Evidências:** [confirmação e erro de GET simultâneos](../.tmp/t0004-v19-20261024/03-confirmed-get-failed.png), [detalhe restaurado](../.tmp/t0004-v19-20261024/03-restored-detail.png), log/snapshots acima.
- **Limite:** indisponibilidade simulada no proxy de teste, não corrupção/queda do SQLite. O formulário foi limpo após confirmação e permaneceu na tela de edição até retornar à consulta; os valores persistidos foram conferidos por GET e SQL, sem nova gravação.

### Limitações de execução e preservação

A inicialização da fixture foi concluída; a primeira consulta do helper de evidência referenciou body_hash inexistente, corrigido somente nesse helper para request_hash, sem recriar banco ou alterar produto. Um waitFor da automação expirou antes dos 12 s do cliente; o estado incerto foi observado depois, sem repetir o envio. Servidores iniciados no sandbox não ficaram acessíveis por loopback; foram encerrados e iniciados fora dele mediante aprovação. Não se classificaram esses incidentes como falhas funcionais.

Nenhum defeito funcional confirmado nos três subcasos. Não houve mudanças em código, configurações, dependências, testes ou contratos, nem execução de typecheck/build/suítes nesta homologação. Resultados automatizados da seção I permanecem anteriores. Mantêm-se os limites de outro SO, instalação nativa limpa, benchmark, leitor de tela e gates C01–C05/J01. A ressalva histórica MANUAL_INCONCLUSIVE de T0003 não mudou. Processos de teste encerrados após a captura das evidências.

Integridade desta homologação, comparada ao snapshot SHA-256 próprio de entrada: **73/79 arquivos preexistentes idênticos**, seis documentos atualizados (este relatório, README, TICKETS, REPO_CURRENT_STATE, VERIFICATION_GUIDE e KNOWN_ISSUES), nenhum arquivo não ignorado novo ou removido. Todos os arquivos de implementação modificados/não rastreados anteriores permaneceram byte a byte iguais. Checagem documental: **19 Markdown, 344 referências locais válidas, 20 tickets e 24 casos PASS**. Git final: **16 rastreados modificados e dez novos preexistentes**, índice vazio, HEAD/branch intactos; `git diff --check` exit 0 sem erros (somente avisos LF/CRLF), `git diff --stat` 440 inserções/166 exclusões nos 16 rastreados, novos excluídos dessa estatística e conferidos por `git ls-files --others --exclude-standard`. Banco/helper/log/capturas novos estão ignorados. Sem listeners de teste restantes nas portas 3000/5173.

## L. Documentos e arquivos de entrega

Novos arquivos: 0003-heterogeneous-inventory.sql; inventory/catalog.ts e agents.ts; fixture golden; support/t0004-fixture.ts, t0004-child.ts e t0004-process.ts; t0004-contract.test.ts e t0004-integrity.test.ts; este relatório.

Arquivos modificados: inventory/contract.ts, maintenance.ts, prepare.ts, routes.ts, service.ts; persistence/store.ts; três expectativas de etapa em t0003-inventory.test.ts; App.vue, LocationFields.vue, api.ts; script test:t0004 em package.json; README, TICKETS, REPO_CURRENT_STATE, VERIFICATION_GUIDE e KNOWN_ISSUES para estado/runbook/evidências.

Contratos técnicos/funcionais ratificados, AGENTS, brief, arquitetura, ADRs, relatórios antigos, núcleo C02/auth e lockfile não foram alterados. Na retomada, mudanças adicionais ficaram na documentação; fontes de implementação preexistentes preservadas por comparação SHA-256.

## M. Limitações, validação humana e Git

Próxima etapa: revisão e validação independente humana do ticket. Não houve commit/staging/push/merge/deploy. Branch main/HEAD 820dad33b404627d94265652078d2558a654f9c6 mantidos. Bancos, PNGs, logs e builds permanecem ignorados. Nenhuma dependência nova.

Integridade final da retomada: **73 dos 78 arquivos preexistentes idênticos por SHA-256**; os cinco alterados foram exclusivamente README, KNOWN_ISSUES, REPO_CURRENT_STATE, TICKETS e VERIFICATION_GUIDE. Um arquivo novo adicional: este relatório. Nenhum arquivo removido. Código, testes, configurações e migração encontrados na retomada ficaram integralmente preservados. A comparação protegida contra HEAD também ficou vazia para contratos, ADRs, relatórios T0001–T0003, migrations 0001/0002, núcleo C02/auth e lockfile.

Checagem documental da retomada anterior: 19 Markdown, 328 referências locais válidas, cercas de código balanceadas, 20 tickets e 24 linhas V01-T4 (então 23 PASS e uma com subcasos manuais residuais). `git diff --check`: exit 0, sem erros; Git emitiu somente avisos de futura conversão LF→CRLF. Índice vazio. `git diff --stat` anterior: 16 arquivos rastreados, 440 inserções e 166 exclusões; não inclui os dez arquivos novos abaixo. A homologação complementar atualiza somente os documentos de resultados/governança e passa V01-T4-19 a PASS. Nenhum banco ou evidência local ignorada aparece nessa lista.

Resultado de `git status --short` (o diretório fixtures contém somente t0003-upgrade.json, confirmado por `git ls-files --others --exclude-standard`):

```text
 M README.md
 M apps/server/src/inventory/contract.ts
 M apps/server/src/inventory/maintenance.ts
 M apps/server/src/inventory/prepare.ts
 M apps/server/src/inventory/routes.ts
 M apps/server/src/inventory/service.ts
 M apps/server/src/persistence/store.ts
 M apps/server/test/t0003-inventory.test.ts
 M apps/web/src/App.vue
 M apps/web/src/LocationFields.vue
 M apps/web/src/api.ts
 M docs/KNOWN_ISSUES.md
 M docs/REPO_CURRENT_STATE.md
 M docs/TICKETS.md
 M docs/VERIFICATION_GUIDE.md
 M package.json
?? apps/server/migrations/0003-heterogeneous-inventory.sql
?? apps/server/src/inventory/agents.ts
?? apps/server/src/inventory/catalog.ts
?? apps/server/test/fixtures/
?? apps/server/test/support/t0004-child.ts
?? apps/server/test/support/t0004-fixture.ts
?? apps/server/test/support/t0004-process.ts
?? apps/server/test/t0004-contract.test.ts
?? apps/server/test/t0004-integrity.test.ts
?? docs/T0004_REPORT.md
```

Pendência anterior de V01-T4-19 encerrada tecnicamente pelos três PASS observados em K.1. O timeout histórico de diálogos da sessão inicial permanece como registro de ambiente; nesta homologação o diálogo real de epoch foi cancelado/aceito com sucesso. Revisão e aceite humanos do ticket continuam necessários.

Roteiro de revisão:

1. Usar banco local descartável identificado; seguir [README](../README.md#executar-a-fundacao-t0001), migrar/preparar explicitamente e informar segredo próprio no ambiente do backend.
2. Selecionar cada perfil e conferir campos/limites na fonte ratificada; cadastrar fixo/móvel/Agent, editar e rejeitar duplicatas.
3. Conferir manutenção omitida e os três ramos de agenda; manter atividade/situação distintas de manutenção/posição.
4. Exercitar troca de categoria com cancelar/confirmar; teclado, largura menor, sessão expirada/novo acesso e resultado incerto; para reproduzir os três subcasos complementares, seguir K.1 em banco descartável próprio.
5. Para concorrência, carregar a mesma versão antes da edição concorrente; se CSRF interromper, revalidar sem descartar o rascunho antigo e só considerar CAS quando o backend responder VERSION_CONFLICT. Comparar/revisar antes de nova intenção.
6. Reproduzir scripts de teste e upgrade em fixtures, sem apontar testes para banco do usuário. Não restaurar backup sobre gravações posteriores sem revisão humana.

C01 conserva o limite de instalação limpa nova não reproduzida; C02 mantém oito grupos sem fechamento integral, com mais evidência cadastral; C03/C04/C05 e J01 continuam nos respectivos gates. T0005–T0020 não autorizados.

## N. Parecer técnico anterior ao aceite humano

**T0004_ALL_VERIFICATIONS_READY_FOR_HUMAN_ACCEPTANCE**

Código, migração, API e frontend entregues para revisão; verificações automatizadas anteriores preservadas e evidências manuais identificadas. Os três subcasos complementares de V01-T4-19 receberam PASS por observação de interface e servidor; matriz com 24 casos PASS dentro do alcance declarado. Isso não equivale a DONE / HUMAN_ACCEPTED nem autoriza outro ticket.

<a id="aceite-humano-t0004"></a>
## O. Aceite humano e encerramento formal — 24/10/2026

O responsável pelo projeto declarou expressamente **T0004_HUMAN_ACCEPTED** nesta conversa, após a entrega técnica e a homologação complementar V01-T4-19. Estado final do ticket: **DONE / HUMAN_ACCEPTED**, conforme [backlog](TICKETS.md#aceite-humano-t0004) e [estado real](REPO_CURRENT_STATE.md#aceite-humano-t0004).

Este registro documenta a decisão humana; não afirma testes novos ou validação independente adicional não descrita na declaração. Os resultados e limitações deste relatório permanecem intactos. C01–C05, J01, condições dos ADRs e a ressalva histórica de T0003 continuam em suas fontes. O aceite não autoriza T0005–T0020, instalações, alterações de implementação, staging ou commit.

Formalização exclusivamente documental, com preservação dos arquivos de implementação/configuração/teste, dependências, contratos ratificados e ADRs. Nenhum teste de aplicação, build ou migração executado neste encerramento. main/HEAD 820dad33b404627d94265652078d2558a654f9c6 mantidos.

Integridade do encerramento comparada ao snapshot de entrada: **73/79 arquivos idênticos por SHA-256**, somente seis documentos alterados (README, TICKETS, REPO_CURRENT_STATE, KNOWN_ISSUES, VERIFICATION_GUIDE e este relatório), nenhum arquivo novo/removido. Referências documentais: 19 Markdown, 356 links locais válidos, 20 tickets preservados. `git diff --check`: exit 0, sem erros, apenas avisos LF/CRLF; índice vazio. `git status --short`: os mesmos 16 rastreados modificados e dez novos preexistentes da entrega T0004; `git diff --stat`: 457 inserções e 167 exclusões nos 16 rastreados, excluindo os novos. Nenhum commit, staging ou alteração de implementação nesta formalização.
