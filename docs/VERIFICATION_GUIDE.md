# Guia de verificação

<a id="verificacao-c03"></a>
## C03 — contrato ratificado; provas técnicas ainda não aceitas

Decisão humana de 26/10/2026: **“PROJECT IGNIS — Registro formal da ratificação C03”**. C03 **HUMAN_RATIFIED**, D01–D12 **RATIFIED** no [contrato específico](C03_TELEMETRY_CONTRACT.md#decisoes). [Cenários C03-S01–S30](C03_TELEMETRY_CONTRACT.md#cenarios) e [critérios por grupo](C03_TELEMETRY_CONTRACT.md#testes) são normativos para a futura execução; todos **NOT_RUN** neste registro. Complementam V05/V05-I e V06, sem remover as matrizes existentes nem suas expectativas.

V05/V06 **NOT YET ACCEPTED** nos respectivos escopos. T0007 **PLANNED / NOT_STARTED / NOT_AUTHORIZED**: núcleo causal/ingestão e provas internas de resolução em T0007; conclusão pública e integração V06 em T0012; histórico/coverage_interval em T0008, relógio/run/reset em T0009 e alertas/Central nos tickets próprios. Não exigir igualdade artificial de revisões/recibos entre ordens de conhecimento: testar proteção causal, CAS, isolamento e falha posterior elegível.

Verificar futuramente aliases/início imutável, corte inclusivo, dois episódios/causas, Kc/Ke/Ks, rollback em conexões reais, quatro perfis FX restritos, limites de frescor/posição, silêncio/reinício/CLOCK_UNTRUSTED, limites de GET não persistido e snapshots com mesmo par revisão/corte. Preservar regressões T0005/T0006 e asserções dos 184 testes existentes. Ratificação não prova implementação nem ativa fontes reais.

Registro atual somente documental: testes de aplicação, typecheck, build e migrations **não executados**, por ausência de alteração executável. Os PASS históricos T0001–T0006/J01 permanecem. Schema 5; migration 0006 **RESERVED / NOT_CREATED**. Textos datados abaixo, inclusive C03 ainda pendente na preparação de V05-I, conservam seu estado histórico anterior; fonte contratual atual é o documento C03 vinculado.

**Estado vigente — 26/10/2026:** T0001–T0006 **DONE / HUMAN_ACCEPTED** (Gate **J01 PASS / HUMAN_ACCEPTED**). [Aceite humano final de T0006](TICKETS.md#aceite-humano-t0006) após **7/7 cenários funcionais PASS** e suíte automatizada **184 testes/20 arquivos PASS** (`npm run test:t0006` **9/3 PASS**, `npm run typecheck` e `npm run build` PASS), conforme [relatório T0006](T0006_REPORT.md#aceite-humano-t0006). Migration `0005` implementada (schema 5) e migration `0006` reservada para T0007. T0007–T0020 NOT_AUTHORIZED; C01–C05 (incluindo C03 antes de T0007) e demais gates futuros preservados.

Histórico do aceite T0005 — **26/10/2026:** T0001–T0005 **DONE / HUMAN_ACCEPTED**. [Aceite humano final de T0005](TICKETS.md#aceite-humano-t0005) após oito cenários funcionais B2.1–B2.3 PASS, incluindo recuperação supervisionada do cenário 7. [Consolidação, evidências e verificações não repetidas](T0005_REPORT.md#aceite-humano-t0005). Os 26 V02-T5 PASS técnicos, 175 testes/17 arquivos, 16/2 direcionados e typecheck/build são resultados históricos de 25/10; não foram repetidos neste registro de aceite. Não há reclassificação de critérios posteriores: V02 espacial, V03/J01 e demais gates preservados; T0006–T0020 NOT_AUTHORIZED. Os registros datados abaixo conservam suas modalidades e resultados históricos.

Histórico da formalização T0005 — **25/10/2026**: [T5-D01–D16/A01–A05](MVP_TECHNICAL_DESIGN.md#t0005-contrato) HUMAN_RATIFIED e [GF-T5-01–12](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0005) HUMAN_APPROVED. [V02-T5-01–26](#v02-t5) todos **NOT_RUN**; T0005 **PLANNED / NOT_AUTHORIZED**, T0006–T0020 não autorizados. Nenhum teste/build executado nesta formalização; preservar resultados anteriores. V02 espacial completo permanece T0006/J01, sem PASS por aprovação documental.

Execução T0004 — 24/10/2026: [relatório e resultados individuais](T0004_REPORT.md#matriz-v01-t4). Typecheck/build PASS; npm test 117/10; T0003 17/2; T0004 48/2: resultados automatizados anteriores preservados, não reexecutados na homologação complementar. [V01-T4-19 complementar](T0004_REPORT.md#homologacao-v01-t4-19): três subcasos antes residuais receberam PASS por observação de interface/servidor em banco descartável; matriz atual com 24 casos PASS. R-T4-01–07 HUMAN_RATIFIED e GF-T4-01–12 HUMAN_APPROVED preservados. T0004 DONE / HUMAN_ACCEPTED por declaração expressa T0004_HUMAN_ACCEPTED ([registro](TICKETS.md#aceite-humano-t0004)), após o parecer técnico T0004_ALL_VERIFICATIONS_READY_FOR_HUMAN_ACCEPTANCE; nenhum teste adicional executado no registro do aceite; T0005–T0020 não autorizados. Os status NOT RUN das matrizes de preparação abaixo são históricos, não substituem os resultados observados do relatório. Critérios/entradas/expectativas permanecem intactos.

**Estado atual — 24/10/2026:** T0001–T0004 DONE / HUMAN_ACCEPTED; aceite T0004 e evidências no [relatório](T0004_REPORT.md#aceite-humano-t0004). T0003 permanece aceito por decisão do responsável em 24/10/2026. [Relatório T0003](T0003_REPORT.md): tipos/build PASS, 69 testes/8 arquivos incluindo os 52 anteriores, 16 V01-T3 PASS em suíte específica de 17 testes/2 arquivos. C02 mantém 21 V00-I PASS e oito grupos V05-I pendentes, com parcela cadastral T0003 verificada e integrações restantes NOT RUN; C03/C04/C05 permanecem nos respectivos tickets. Instalação limpa do driver em ambiente inteiramente novo não reproduzida; outros sistemas NOT RUN. Contratos e resultados esperados abaixo preservados.

<a id="aceite-humano-t0003"></a>
## Validação independente e aceite humano de T0003

O responsável reproduziu no Windows (Node 24.22.1/npm 11.19.1) typecheck/build PASS, test:t0003 17/17 PASS, npm test 69/69 PASS e regressões T0001/T0002 52/52 PASS; git diff --check sem erros, somente avisos LF/CRLF. Os **16 resultados automatizados V01-T3 permanecem PASS**, sem alterar suas entradas/expectativas. [Registro completo do aceite e validação manual](T0003_REPORT.md#aceite-humano-t0003).

Abertura/acesso/cadastro/consulta/edição/persistência e rejeição de duplicidade foram confirmados no Opera GX e Microsoft Edge. Separadamente, **concorrência manual entre abas: MANUAL_INCONCLUSIVE**. CSRF_FORBIDDEN impediu a primeira tentativa antes da guarda de versão; na segunda, autenticação atualizou o estado carregado e as confirmações foram sequenciais. Não se reproduziu uma tentativa efetivamente obsoleta, e não se observou sobrescrita indevida. Não promover a PASS manual ou declarar defeito sem evidência. V01-T3-13 automatizado continua PASS (concorrência real, replay antigo e no-op). Reavaliação futura não cria novo ticket automaticamente. Nenhum teste de aplicação foi reexecutado pelo agente nesta formalização.

<a id="comandos"></a>
## Comandos existentes versus propostos

Comandos executados na raiz com Node 24.22.1 e npm 11.19.1, conforme [README](../README.md#executar-a-fundacao-t0001). T0002 ajustou a faixa npm ao ambiente validado pelo responsável e reproduziu instalação pelo lockfile. T0003 recebeu autorização individual posterior; nenhum ticket posterior liberado. Evidência histórica com npm 12.2.1 permanece no [relatório T0001](T0001_REPORT.md).

| Comando existente | Finalidade / pré-condição |
|---|---|
| `npm ci` | Reinstalar a partir do lockfile; validação também com `--offline --cache .tmp/npm-cache --no-fund`, após popular cache |
| `npm run db:migrate` | Preparar explicitamente o arquivo SQLite e bootstrap técnico, antes de dev/start; repetir preserva IDs/schema |
| `npm run db:prepare-operational` | Preparo explícito/repetível do contexto operacional T03-B após migrations; não cria equipamento nem repara divergência |
| `npm run test:t0003` | Build + 17 testes/2 arquivos, cobrindo os 16 V01-T3 e o limite adicional de mutações |
| `npm run dev` | Vite 127.0.0.1:5173 e backend 127.0.0.1:3000; Ctrl+C encerra ambos |
| `npm run dev:server` / `npm run dev:web` | Processos de desenvolvimento separados, também usados pelo comando conjunto |
| `npm run typecheck` | TypeScript do backend, Vue, configuração e testes |
| `npm test` | Build completo + todos os testes Vitest |
| `npm run test:t0002` | Build + 33 testes em 4 arquivos, incluindo todos os 21 V00-I; descoberta conferida |
| `npm run test:unit` | Saúde via injeção HTTP, configuração, ausência de build e socket real |
| `npm run test:smoke` | Build + processo compilado, live/estáticos, parada/reinício e erros |
| `npm run build` / `npm start` | Build Vue/servidor e execução estática local; start exige build |

Lint separado não configurado (NOT RUN). `test:integration`, `test:e2e` e `demo:prepare` **não existem**: dependem de tickets posteriores e autorização própria. Não inferir testes de domínio a partir da fundação. Resultados por comando no relatório; versões no lockfile. Rede/loopback/processos locais exigiram execução com permissão ampliada; verificações não foram desabilitadas. O aviso npm sobre script nativo não aprovado e a validação do binário Windows estão registrados no relatório.

## Evidência e ambiente

Para cada caso: registrar ticket, revisão de código quando houver Git, versões reais, OS, dataset/epoch/manifesto, passos, resultado esperado/observado, requestIds relevantes e status `PASS/FAIL/NOT_RUN` com motivo. Só marcar gate completo quando casos aplicáveis passarem. Não simular um teste crítico somente com mocks da persistência.

Fixture de referência proposta: até 200 equipamentos, 30 agentes, 10 regiões e 50 mil eventos; o teste de volume deve registrar cardinalidades reais. Fixture funcional menor deve conter fixo/móvel, categoria sem emissor, agente, duas causas simultâneas, região sem dados e histórico parcial. Não usar dados pessoais reais. Todo reset é restrito a dataset de teste.

## Casos verificáveis

### V00 — Fundação e persistência

Relaciona T0001/T0002. Em ambiente limpo, verificar runtime/driver, health/live, readiness e configuração ausente. Criar dado técnico, parar/iniciar e confirmar persistência. Aplicar esquema em banco vazio e em versão anterior; repetir não duplica versão. Falha de FK, tentativa entre datasets e erro no meio da transação deixam zero gravações parciais. Escrita pública sem sessão/segredo/CSRF é recusada.

**Aprovação:** comandos reais reproduzíveis, versão de SQLite registrada, FKs ativadas e rollback comprovado. **Falhas relevantes:** banco no diretório efêmero, readiness saudável com esquema incompatível, escrita não autorizada ou driver que só funciona em uma máquina.

<a id="v00-idempotencia"></a>
### V00-I — Casos contratuais de idempotência para T0002

**Execução em 24/10/2026: todos os 21 IDs PASS.** Matriz caso → arquivo/teste → resultado/evidência no [relatório T0002](T0002_REPORT.md#d-matriz-dos-21-casos-v00-i). A tabela normativa abaixo foi preservada integralmente; suas entradas e resultados esperados não foram adaptados à implementação. Estes IDs são casos de V00, não novos tickets. Fonte normativa: [identidade/canonicalização](MVP_TECHNICAL_DESIGN.md#idempotencia) e [atomicidade](MVP_TECHNICAL_DESIGN.md#recibos-atomicos). A operação técnica existe somente nos testes, sem endpoint público, domínio futuro ou simulador.

**Fixture da suíte:** dois datasets autorizados com uma geração ativa cada e um epoch aposentado de teste; principal estável `operator:test`; operação `verification.receipt.v1` existente **somente na suíte**, target null, `commandId=00000000-0000-4000-8000-000000000010`. Payload válido `{expectedVersion:0,value:1}`. O callback técnico compara a revisão da DatasetEpoch com expectedVersion, avança essa revisão uma vez e devolve 200 `{revision:1,value:1}`; value é dado seguro do resultado. Não representa CRUD ou dado demo. Um segundo payload permitido com value=2 serve para conflito. Cada caso começa de fixture limpa, salvo quando explicitar sequência. Contar recibos por Kc e revisão antes/depois; não simular persistência com mocks.

**Vetor documental de bytes, não implementação do normalizador:** para dataset `00000000-0000-4000-8000-000000000001`, epoch 1 e a fixture acima, Cc deve serializar na única linha a seguir, sem BOM ou LF final:

```json
{"actorId":"operator:test","body":{"expectedVersion":0,"value":1},"canonicalVersion":1,"datasetId":"00000000-0000-4000-8000-000000000001","epoch":1,"operation":"verification.receipt.v1","target":null}
```

Esperado: **200 bytes UTF-8**, SHA-256 `8529d6d5286b0d06c21188e77743a6194b0df0ffa154eaf588c9b3138fee285c` (H0). O vetor foi definido na preparação documental e agora conferido contra o canonicalizador em V00-I02. Variar a ordem de chaves ou escrever value como 1.0/1e0 deve chegar a esses mesmos bytes. Os casos de tipo abaixo podem usar schemas restritos exclusivos da suíte, sem estender o schema da fixture nem APIs reais.

| Caso | Entrada / sequência futura | Resultado esperado |
|---|---|---|
| V00-I01 — primeira confirmação | Kc ausente, payload base | 200, corpo original; um recibo e revisão 0→1 na mesma transação |
| V00-I02 — replay normalizado | Depois de I01, reordenar chaves, trocar 1 por 1.0/1e0 e caixa hexadecimal do UUID | H0 e mesmos bytes; 200/corpo original + Idempotency-Replayed=true; revisão e contagem inalteradas |
| V00-I03 — conteúdo divergente | Depois de I01, mesma Kc, value=2 | Hash diferente; 409 IDEMPOTENCY_CONFLICT; recibo/corpo original e revisão 1 preservados |
| V00-I04 — alvo/guarda divergentes | Depois de confirmar uma fixture com alvo válido, mesma Kc/outro target.id; também base com expectedVersion=1 em vez de 0 | 409 por conteúdo; target não cria outra Kc; não executar CAS/efeito novamente |
| V00-I05 — metadados de servidor | Mesmo input com receivedAt, recordedAt, dataNow, wallNow, effectiveAt, IDs gerados, correlationId/requestId e sessão transitória internos diferentes | Mesmo Cc/H0; mesmo recibo; nenhum metadado derivado do processamento aparece nos bytes |
| V00-I06 — campos indevidos | Cliente insere receivedAt/dataNow/campo desconhecido no corpo não admitido, ou chave JSON repetida | 400, sem recibo/efeito; não validar estabilidade de hash aceitando campos inválidos silenciosamente |
| V00-I07 — tipagem/precisão | Tipo numérico trocado por string; NaN/Infinity/integer inseguro; fração em versão inteira | Tipo/JSON estrutural inválido: 400; número finito fora de limite ou versão fracionária: 422; sem recibo. Número JSON literal 9007199254740993 deve ser recusado antes de arredondamento permissivo |
| V00-I08 — números finitos | Normalização pura no schema numérico: -0/0, 1/1e0, 0.3/0.30000000000000004 | Dois primeiros pares iguais; último par diferente; sem arredondamento de apresentação ou epsilon |
| V00-I09 — opcionais | Schema de teste permite note opcional nullable sem default; depois schema com flag default estático false | Ausente e note:null distintos; flag omitida e false equivalentes. Campo não nullable com null: 422 |
| V00-I10 — texto/arrays | Schema de teste: `"A"`/`"a"`, `" A"`/`"A"`, U+00E9/`e`+U+0301, escapes da mesma string, [1,2]/[2,1] | Diferenças preservadas salvo escapes equivalentes; arrays não são reordenados; propriedades aninhadas são ordenadas por JCS |
| V00-I11 — tempo de cliente | Campo tipado: 2026-10-23T10:00:00-03:00 e 2026-10-23T13:00:00.000Z; depois mudar 1 ms | Primeiro par canônico 2026-10-23T13:00:00.000Z e mesmo hash; mudança de 1 ms dá outro hash |
| V00-I12 — tempo inválido/civil | Timestamp sem offset, -00:00, data impossível, segundo 60 ou quatro casas fracionárias; dueDate=2026-10-23 | Instantes inválidos: 422; data civil conserva literal, não vira timestamp. String não tipada como instante permanece literal |
| V00-I13 — resposta perdida/reinício | Confirmar I01, suprimir envio da resposta, fechar/reabrir banco e reenviar Kc | Recibo e revisão persistem juntos; 200 original/replay; nenhum segundo efeito |
| V00-I14 — rollback em cada fronteira | Injetar falha após atualização da revisão, durante inserção do recibo e imediatamente antes do commit | Revisão continua 0 e recibo ausente; retry válido confirma uma vez. Falha interna é 500 sanitizado ou 503 de indisponibilidade conforme a causa, nunca sucesso parcial |
| V00-I15 — concorrência equivalente | Duas conexões reais disputam Kc/hash iguais; segurar vencedor por menos que o timeout | Um efeito/recibo; perdedor lê replay após commit. Se o primeiro reverter, o segundo pode confirmar como primeira operação |
| V00-I16 — concorrência divergente/busy | Mesma Kc com value 1/2; depois manter escritor bloqueando por mais de 1000 ms | Com aquisição após vencedor: 409 para divergente; timeout: 503 DATABASE_UNAVAILABLE e nenhum efeito do perdedor; retry posterior decide por recibo |
| V00-I17 — contextos/atores/operações | Reutilizar commandId no segundo dataset autorizado/ativo, depois com outro principal/operação de fixture autorizado | Kc diferentes; recibos independentes, sem replay cruzado. Principal sem acesso recebe 401/403 antes de revelar recibos |
| V00-I18 — sessão renovada/estado alterado | Depois de confirmar, trocar cookie da sessão mantendo principal; alterar revisão por outro comando; retry original | Mesma Kc, resposta antiga com revisão original; não rejeitar por expectedVersion agora obsoleta nem refazer efeito |
| V00-I19 — epoch aposentado | Fixture marca epoch anterior aposentado e ativa outro; retry antigo, depois mesma commandId explicitamente no novo contexto | Antigo: 409 de geração antes do replay; novo: Kc distinta. Nenhum reset/scheduler implementado para esse caso |
| V00-I20 — integridade SQL | Tentar duplicar Kc diretamente e referenciar epoch de outro dataset; injetar falha de FK na transação | UNIQUE/FK compostas impedem inconsistência; nenhum componente NULL; efeito e recibo parciais revertidos, sem substituir recibo original |
| V00-I21 — ambiente SQLite | Instalar futuramente driver autorizado, registrar versão SQLite embutida, abrir/reabrir arquivo local, consultar PRAGMAs em duas conexões | WAL efetivo, foreign_keys=ON por conexão, synchronous=FULL, busy_timeout=1000; versão com correção WAL-reset conforme arquitetura; readiness recusa esquema incompatível |

Para concorrência, usar conexões/execuções independentes com barreira de teste; duas chamadas sequenciais no mesmo loop não comprovam corrida. Para queda de processo, incluir interrupção antes do commit e depois dele com resposta suprimida, reabrindo **o mesmo arquivo**. Readiness e guardas de capacidade/CSRF/contexto continuam obrigatórias no restante de V00, além desta matriz. Os resultados observados de T0002 estão no relatório; a aprovação técnica dessa execução não encerra integrações posteriores nem equivale a aceite humano.

<a id="v05-idempotencia"></a>
### V05-I — Integrações posteriores de C02, fora de T0002

**Preparação original: todos NOT RUN.** Após T0003, os oito grupos continuam sem fechamento integral: cadastro/edição com recibos e replay foram comprovados no [relatório T0003](T0003_REPORT.md#e-matriz-v01-t3); intervenção T0012 e demais integrações restantes continuam NOT RUN. Usar [Ce/Ke/Ks](MVP_TECHNICAL_DESIGN.md#identidade-eventos) e as mesmas regras de bytes/tipos, sem criar ingestão/cursor na fundação.

| Estágio / caso | Entrada e resultado esperado |
|---|---|
| T0007 — evento equivalente | Mesma Ke e Ce, ordem de chaves/offset equivalente de occurredAt; variar metadados gerados e avançar dataNow além da tolerância original: hash/recibo iguais; 200/disposition/revisão originais, indicador de replay, sem cursor/freshness/causa adicionais |
| T0007 — input imutável divergente | Na mesma Ke, variar separadamente source.kind autorizado, entityId/resourceId, channel, sequence, observationType, values, units, schema/eventType admitidos, occurredAt ou causationId: divergência validamente tipada conflita 409. Fonte sem binding falha 403, não vira teste de hash |
| T0007 — dualidade de chaves | Novo commandId com mesma Ke/Ce: nenhum novo evento/efeito; mesmo commandId com outro evento: 409; Ks já ocupada com outro eventId: 409 e rollback do novo recibo Kc |
| T0007 — unidades/clamp | Repetir instante original tolerado que foi clampado ao dataNow anterior: não recalcular hash/resultado; trocar unidade/valor originais mesmo com grandeza equivalente conflita. Conversão física da projeção não modifica bytes de Ce |
| T0007 — atomicidade integral | Concorrer ingestões e falhar entre evento, cursor, projeções/causas/alertas existentes e recibos: somente um conjunto confirmado ou rollback integral; repetir evento não reabre episódio |
| T0003/T0012 — uso pelo domínio | Cadastro/edição/intervenção reutilizam recibo; replay com versão original já obsoleta retorna resposta antiga; mudança de alvo/guarda/evidência com mesma chave conflita. Não fechar precedência temporal C03 nesta matriz |
| T0008/T0009 — histórico/reset | coverage_interval aceita somente pela preparação interna e mantém recordedAt sintético fora do hash; queda de tick não duplica efeitos; reset real preserva 409 para geração antiga e isolamento. Staging/CAS/fencing só nesses tickets |
| T0015 — missão | Mesmo commandId/evidência de tentativa não consome nova tentativa nem cria segunda intervenção; commandId novo não substitui barreiras de attemptId/missão. Unicidade resolutiva e CAS são verificados após C04 detalhada; nenhuma guarda de reserva é fechada aqui |

C03 ainda precisa especificar comparação temporal, empate e episódios antes de T0007; C04 ainda precisa especificar propriedade/liberação condicional de reservas antes de T0015. As matrizes acima não suprem esses contratos nem seus gates.

### V01 — Inventário e atributos

Criar/editar/consultar equipamento de cada categoria do catálogo e um agente. Verificar regras de série/matrícula, schema/versionamento, fixo/móvel e manutenção independente de situação. Repetir commandId e disparar duas edições com mesma versão. Tentar categoria inexistente, atributo extra, UF/CEP inválido, coordenada parcial e série equivalente normalizada.

**Aprovação:** dados válidos persistem/reabrem; duplicatas não criam especializações órfãs; uma edição concorrente vence e outra conflita; motivo de dado não aplicável é preservado. **Falha:** aceitar qualquer JSON ou confundir manutenção preventiva com estado maintenance.

### V02 — Geração válida e geografia

Executar manifesto com seed/versões fixas em duas gerações. Comparar registros normalizados excluindo auditoria de parede/tokens; conferir contagens, atributos, unicidade, endereços fictícios e distribuição em polígonos. Testar ponto em fronteira, fora da cidade e ausência de coordenada. Replay na mesma geração não duplica dados. Gerador em dataset operacional deve ser recusado.

**Aprovação:** resultados semanticamente iguais, nenhuma coordenada zero usada como ausência e região conforme regra determinística. **Falha:** dados parecem válidos, mas não passam pelo cadastro normal.

### V03 — Mapa, filtros e disponibilidade — gate J01

Cadastrar recurso e consultar snapshot/mapa. Combinar categoria/situação/órgão/região/bbox; comparar contagens com consulta independente ao banco da fixture. Verificar cadastro/base/posição com identificação da origem. Usar exemplo de disponibilidade da seção 3 do design e denominador zero. Verificar agentes fora do denominador e truncamento explícito.

**Aprovação:** numerador/denominador corretos, filtros aplicados à mesma revisão de mapa e indicadores; recursos sem localização permanecem consultáveis. Sem tiles, recursos/polígonos locais e lista continuam acessíveis. **Falha:** mapa parcial apresentado como total ou cliente recalculando indicador com página incompleta.

### V04 — Determinismo, atomicidade, pausa e reset

Gerar histórico e ticks duas vezes com mesmo manifesto; comparar eventos/estado normalizados. Pausar, avançar relógio de parede e confirmar dataNow/freshness constantes. Forçar crash antes e depois do commit de um tick, retomar e comparar com execução sem crash. Reset com staging falho não troca ponteiro. Disparar reset concorrente e evento antigo após a troca; observar um vencedor e nenhuma escrita na nova geração pelo token anterior. Reinício do processo deixa run pausado, sem rajada compensatória.

**Aprovação:** mesmos fatos sem duplicação, nenhum tick confirmado sem eventos correspondentes, geração ativa íntegra e geração aposentada imutável. **Falha:** reiniciar redefine IDs sem contexto, reexecuta efeito ou usa tempo real para ordenar fatos simulados.

### V05 — Ingestão, ordenação e comunicação

Enviar duplicado equivalente, chave com outro conteúdo, sequência atrasada, timestamp regressivo com sequência maior, lacuna, unidade inválida, emissor não autorizado, clock acima de tolerância e posição em recurso fixo. Verificar cursos independentes de saúde/posição. Desconectar emissor esperado e observar unknown/stale; enviar evento histórico e confirmar que não rejuvenesce comunicação. Fonte sem emissor esperado não gera ausência.

**Aprovação:** classificação e códigos do pipeline; nenhuma regressão de estado e nenhum furto/falha inferidos por ausência. Medir 5 eventos/s e 10 navegadores na fixture: visibilidade até 5 s e snapshot p95 até 500 ms, registrando ambiente e amostras. **Falha:** responder 2xx antes do commit ou usar hora de recebimento como dado fresco.

### V06 — Alertas e manutenção — gate J02 com V04/V05

Simular falha e acompanhar estado, necessidade/causa, alerta e snapshot. Repetir condição, reconhecer, resolver causa e provocar recorrência. Alterar agenda para vencida/próxima, testar prioridade crítica e recurso sem heartbeat. Falhar entre gravação de estado e alerta. Concluir intervenção com outra causa ainda aberta.

**Aprovação:** um ciclo ativo por regra/recurso, reconhecimento não remove causa, recorrência cria novo ciclo; rollback não deixa estado sem alerta; manutenção parcial não libera equipamento indevidamente. **Falha:** um alerta por heartbeat ou jogo/conclusão manual apagando todas as falhas.

### V07 — Histórico, intervalos e cortes

Consultar paginação estável com empates de horário; seguir vínculo entre comando, evento, transição, solicitação e intervenção. Construir timeline de referência com cobertura conhecida/lacunas, horários UTC e vencimento civil em Brasília. Verificar intervalos sintéticos limitados ao contexto interno, sem frescor ou transição, rejeitados na rota externa; corte no meio do intervalo não pode aproveitar cobertura declarada só ao fim. Consultar corte passado depois de chegar evento tardio ou editar agenda; dados conhecidos apenas depois não podem entrar na análise retrospectiva.

**Aprovação:** intervalos/downtime e cobertura iguais ao cálculo independente; ausências não preenchem uptime; estado/agenda do corte são os vigentes naquele instante, não os atuais. **Falha:** usar dados futuros na janela ou contabilizar evento duplicado como episódio de falha.

### V08 — Predição explicável — gate J04 com V07

Conferir manualmente exemplo P01, fatores ausentes/renormalização e casos insuficientes. P02: validar ponderação, deterioração, Q não aplicável, região vazia e amostra pequena. Com mesma revisão/parâmetros, recalcular e comparar fatores/score. Modificar revisão durante cálculo e resetar antes do commit. Executar protocolo temporal/seeds reservadas e comparar baselines conforme seção 9 do design.

**Aprovação:** fórmulas e limites corretos, score null quando insuficiente, contexto/corte/horizonte/fatores visíveis; ausência de vazamento; stale identificado; relatório traz métricas efetivamente observadas e limitações. Sem ganho sobre baseline, relatar isso sem alegar previsão validada. **Falha:** “score 80” apresentado como “80% de chance” ou risco de criminalidade inferido de falhas.

### V09 — Missões e três jogos — gate J03

Para cada mecânica, iniciar em categoria compatível, enviar solução válida/inválida, adulterar `success`, nonce e equipamento, repetir/submeter simultaneamente, esgotar tentativas e expirar sessão. Cancelar após reserva e verificar solicitação aberta/estado consistente. Desativar/furtar ou alterar causa durante a missão. Resetar e tentar concluir missão antiga. Verificar intervenção e alertas com duas causas abertas e comunicação ainda stale.

**Aprovação:** validador do servidor decide; no máximo uma intervenção simulada; todas as tentativas aceitas são rastreáveis; outra causa permanece; nenhuma operação em recurso real ou geração antiga. **Falha:** sucesso do cliente basta, expiração usa relógio pausado ou repetição cria múltiplas manutenções.

### V10 — Tour e isolamento — gate J05

Iniciar duas sessões em datasets distintos; avançar etapa que dispara cenário, recarregar/retomar e reenviar comando. Interromper rede; encerrar uma sessão e resetar seu cenário. Confirmar que a outra mantém dados/run e que efeitos confirmados da primeira não são revertidos silenciosamente.

**Aprovação:** etapa não repete efeito; progresso recuperável; término pausa run próprio e bloqueia novos disparos; epoch antigo retorna erro explícito e permite recomeçar. **Falha:** tour utiliza um dataset público mutável compartilhado ou muda estado por caminho privilegiado.

### V11 — Execução completa, segurança e recuperação

Após gates: preparar distribuição em ambiente limpo, iniciar com um processo de aplicação, executar J01–J05, reiniciar processo e recuperar banco. Fazer backup consistente e restaurar em dataset/ambiente separado. Não copiar banco principal isolado de WAL ativo. Bloquear acesso a sessão/dataset alheio e ingestão sem binding; conferir quotas, segredo ausente em bundle/logs e erro interno sanitizado. Desabilitar tiles/rede externa e manter núcleo demonstrável. Confirmar prazo/configurações/documentação com a distribuição final.

**Aprovação:** todas as nove features verificadas, comandos reais e limitações registrados, recuperação sem perda de fatos confirmados, nenhum segredo exposto. Deploy público, se desejado, exige autorização própria e validação específica do host escolhido; este teste não publica a aplicação. **Falha:** depender de serviço gratuito indisponível para a única demonstração ou README descrevendo comandos não existentes.

## Verificações exigidas pelo aceite condicional

Verificações técnicas abaixo **NOT RUN**, exceto o subconjunto runtime/build de C01 já aceito em T0001. C02 foi detalhada documentalmente nesta preparação; condições e gates no [backlog](TICKETS.md#condicoes-do-aceite). Especificação não substitui evidência técnica.

| Condição | Caso / estágio futuro | Critério adicional |
|---|---|---|
| C01 | V00, T0001/T0002 | Registrar compatibilidade real de runtime/build e driver Windows/SQLite/FKs/persistência/rollback |
| C02 | [V00-I](#v00-idempotencia), T0002; [V05-I](#v05-idempotencia), T0007 e integrações posteriores | Contrato documental preparado: vetor canônico, replay/conflito, metadados excluídos, isolamento, concorrência, rollback e recuperação; todos os testes novos continuam NOT RUN |
| C03 | V05, T0007; V06, T0012 | Após contrato temporal revisado, processar observação anterior à intervenção antes/depois da conclusão, empate temporal e novo episódio genuinamente posterior; não reabrir causa resolvida por dado antigo nem descartar falha posterior; verificar histórico/estado/alertas e concorrência |
| C04 | V09, T0015 | Após guardas revisadas, expirar/falhar/cancelar missão quando solicitação já foi resolvida/cancelada ou reserva mudou; não reabrir nem liberar reserva alheia. Concorrer conclusão e expiração/cancelamento; preservar `disabled`/`stolen`, demais estados administrativos e outras causas |
| C05 | V07/V08, T0013/T0014 | Conferir cálculo/cortes e limitações na saída; publicar resultados observados sem inferir validade estatística/externa |

## Resultado dos gates

<a id="validacao-v11"></a>
### Complementos de aceite v1.1

**Aplicação por estágio:** V00 em T0001 cobre processo/build/saúde; T0002 acrescenta SQLite/contexto/capability local/CSRF/recibos. Não exigir provisionamento de visitante ou V11 completo antes de haver aplicação. V01 em T0003 usa categoria inicial; catálogo completo só T0004. V02 determinismo começa em T0005; V04 de tick/reset só T0009. T0007 testa ingestão/rollback/V05 sem simular scheduler inexistente. T0010 testa tempo por relógio injetável; T0011 integra scheduler e Central. T0008 testa cortes com consulta técnica; T0012 acrescenta consulta de histórico na interface. T0015 testa motor com adaptador exclusivo da suíte; E2E de puzzle real só em T0016–18. Os gates completos continuam exigidos antes dos dependentes que os consomem e em T0020; um caso posterior não deve ser falsamente marcado PASS.

| Caso mínimo analítico | Referência de implementação / aceite futuro | Evidência preditiva que não pode ser presumida |
|---|---|---|
| Equipamento estável, 30 dias conhecidos | F=U=0; demais fatores fixados; score conforme soma independente, não necessariamente zero | Estabilidade passada não garante ausência futura de falha |
| Falhas recorrentes com todos os fatores conhecidos | Exemplo P01=80; repetir observações do mesmo episódio não aumenta F; aumentar F com os outros constantes não reduz score | Ordenação correta em fixture não comprova antecipação |
| Recém-cadastrado, menos de 7 dias | insufficient_data e score null, mesmo com criticidade elevada | Não interpretar ausência de falha como baixo risco |
| Histórico com 79% de cobertura e denominador zero em outra fixture | Insuficiência; verificar também fronteira exata de 80%, fatores L/D ausentes e nenhuma divisão por zero | Renormalização não recupera evidência histórica faltante |
| Região com 2 equipamentos ou menos de 80% de P01 válido | Score null; contagens/motivos presentes; caso suficiente usa fórmula ponderada e Q ausente divide por 0,85 | Regiões não observadas não são controles de baixo risco |
| Padrões sintéticos diferentes | Separar seeds e também processos geradores: estável, recorrente, degradação, falhas independentes aleatórias e inversão de padrão; registrar baseline/empates/amostra | Ganho no mesmo gerador pode desaparecer em padrão novo; resultado sintético não valida uso real |

V07/V08 adicionais: períodos com durações/criticidades desiguais verificam a razão de somas ponderadas; o mesmo conjunto de recursos é usado nas duas janelas de T. Testar dia civil em Brasília versus duração de 24 h, intervenção futura excluída e Q não aplicável. O oráculo aritmético deve ser calculado independentemente da função sob teste. Nenhuma dessas verificações foi executada: só há documentos.

V03/V08/V11 cartográficos: bloquear internet/host de tiles, omitir geocodificação, cadastrar recurso sem ponto e consultar região insuficiente. Conferir IDs/nomes/polígonos locais, consulta/lista/detalhe, indicadores e alertas, resultados/fatores e motivo de score null. Bbox exclui sem ponto explicitamente; removê-lo recupera o recurso. Simular falha do componente mapa e verificar acesso aos mesmos dados via consulta tabular. Aprovar somente se não houver posição inventada, risco zero por ausência, retries ilimitados ou diferença de revisão entre representações equivalentes. Nenhum tile é baixado em massa.

| Gate | Casos necessários | Situação nesta fase |
|---|---|---|
| Fundação | V00 | PASS e aceite humano em 23/10/2026 apenas no subconjunto T0001; SQLite/readiness/guardas T0002 NOT RUN; V00 completo pendente |
| J01 | V01–V03 | NOT_RUN |
| J02 | V04–V06 | NOT_RUN |
| J03 | V09 e consistência V06 | NOT_RUN |
| J04 | V07–V08 | NOT_RUN |
| J05 | V10 e isolamento V11 | NOT_RUN |
| Entrega | V00–V11 aplicáveis | NOT_RUN |

Não substituir `NOT_RUN` por PASS com base apenas nesta especificação. Evidências futuras devem informar diferenças entre ambiente de desenvolvimento, distribuição local e eventual hospedagem.


<a id="v01-t3-radar"></a>
## V01-T3 — Contrato mínimo de radar fixo e contexto operational

**Execução de T0003 em 24/10/2026: 16 casos PASS**, com evidência na [matriz E do relatório](T0003_REPORT.md#e-matriz-v01-t3). A preparação documental anterior tinha todos NOT RUN. As entradas/resultados esperados permanecem integrais. Adição documental autorizada em 24/10/2026 para T03-A/B/C; não altera entradas/resultados dos 21 V00-I ou dos oito grupos V05-I. Fonte: [adição contratual mínima](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo); [gate funcional parcial](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional). Contrato pronto para revisão não significa código, provisionamento ou testes executados.

Fixture futura: banco SQLite isolado com migrations T0002/T0003, operador local estável, demo existente e operational preparado pelo mecanismo contratado. Catálogo fixed_speed_radar v1 e ORG_LOCAL determinísticos; nenhum equipamento antes da primeira criação. Corpo válido usa série exclusiva, brand/model fictícios, criticality explícita 1–5, regulatedSpeedLimitKmh=60 **somente como valor fictício de teste**, registrationLocation válido de referência base e sem solicitação inicial. 60 não é default ou limite real. Contar recursos/especializações/localizações/estados/necessidades/eventos/recibos, versões e revisão antes/depois; integrações críticas usam SQLite real.

| Caso | Entrada / sequência | Resultado esperado futuro |
|---|---|---|
| V01-T3-01 — preparo separado | Aplicar migrations, executar preparo operacional explícito em banco com demo, sem equipamento | IDs/code/kind operational/epoch1/revision0 e grant corretos; ORG_LOCAL/catálogo exatos; demo/ator/segredo inalterados; zero cadastro/solicitação |
| V01-T3-02 — preparo repetido/colisão | Repetir; depois introduzir código/ID/perfil incompatível, grant revogado ou epoch avançado em fixtures distintas | Repetição íntegra retorna mesmos IDs sem duplicar/resetar; divergência recusa sem reparo silencioso/escrita parcial |
| V01-T3-03 — referência e acesso | Configuração ausente/UUID inválido; sessão ausente, grant negado, epoch antigo e tentativa ao demo sem permissão | UI não descobre outro contexto; 401/403/409 conforme causa; servidor não confia no ID público nem vaza recursos |
| V01-T3-04 — mesma origem/CSRF | Desenvolvimento via proxy planejado e distribuição; Origin indevida, sem token ou após recarga só com cookie | Origem/cookie/CSRF preservados; mutação inválida recusada; novo acesso existente recupera token, sem endpoint novo ou leitura anônima |
| V01-T3-05 — perfil único | GET catalog e POST válido sem initialMaintenance | Uma categoria fixa/organização determinísticas; 201, not_installed, version1, uma revisão/evento/recibo; zero solicitação; agenda unknown |
| V01-T3-06 — atributo do radar | Ausência/null/string/fração/0/201 em regulatedSpeedLimitKmh; depois fronteiras 1 e 200 | Obrigatório/tipo/estrutura 400, nulidade/faixa/fração 422; fronteiras aceitas como demonstração, sem sensores ou validade legal presumidos |
| V01-T3-07 — identidade/unicidade | Série com espaços/caixa equivalente em novo commandId; órgão/categoria fora da única referência ou de outro contexto | Série normalizada conflita 409 sem registro órfão; referências recusadas conforme contrato, sem acesso cruzado |
| V01-T3-08 — localização | Base conhecida com referenceType=base; pares nulos, par parcial, UF/CEP inválidos e regionId enviado | Cadastro/base rotulados sem instalação/posição dinâmica; ausência de ponto não vira 0,0; coordenada parcial/valor semântico 422, campo extra 400 |
| V01-T3-09 — ramos de agenda | Solicitação explícita com priority e schedule dated, unknown e not_applicable em fixtures limpas | Uma solicitação open/version1 por intenção; data/motivo preservados; projeção distingue três estados; situação segue not_installed |
| V01-T3-10 — agenda inválida | Data avulsa, data impossível, dated sem data, unknown com data, not_applicable sem motivo e prioridade ausente | 400/422 conforme estrutura/regra; nenhum efeito/recibo; sem pedido automático ou boolean Equipment |
| V01-T3-11 — falha conjunta | Falhar após Resource, localização, pedido, evento e recibo, inclusive antes do commit | Rollback integral; revisão/versões/contagens originais; retry válido confirma uma vez |
| V01-T3-12 — replay/reinício | Confirmar cadastro com pedido, perder resposta e reiniciar; reenviar intenção equivalente e depois divergente | 201/corpo originais + indicador replay, nenhum segundo pedido/efeito; divergente 409; geração aposentada continua prevalecendo |
| V01-T3-13 — edição concorrente | Duas edições na mesma versão; retry do vencedor após outra alteração; PATCH não vazio sem mudança efetiva | Um vencedor/um VERSION_CONFLICT; replay original antes de guarda mutável; no-op não aumenta versão/revisão nem cria evento de mudança |
| V01-T3-14 — edição restrita | Alterar categoria/mobilidade/initialState/initialMaintenance/regionId por PATCH; limpar baseLocation com null | Campos proibidos 400; base adicional removível sem apagar cadastro; nenhuma transição ou mudança de manutenção por atalho |
| V01-T3-15 — leituras/paginação | Consultar detalhe/lista/catálogo, pageSize fora do limite e página além do total | Envelope/contexto/revisão e referências coerentes, paginação 1–200/default50; ordem série/id estável; total real distinto da página; sem filtros/mapa antecipados |
| V01-T3-16 — durabilidade/regressão | Reabrir mesmo arquivo e repetir preparo/consultas; executar suítes pertinentes T0001/T0002 após implementação | Cadastro/pedido/recibos e IDs persistem; ator estável; live/ready/sessão anteriores preservados; resultados reais relatados, sem presumir PASS agora |

Aceite futuro de T0003 exige demonstrar esses casos aplicáveis após autorização de implementação. Preparo real, migrations, APIs, formulários e regressões pertencem a essa execução futura; não são pré-condição para o responsável revisar/aprovar o contrato documental. A política opcional de manutenção continua proposta a ratificar no gate, conforme seção 11.3 técnica. J01 maior e C03/C04/C05 permanecem em seus estágios próprios.

Resultado vigente: T0003 DONE / HUMAN_ACCEPTED após reprodução independente no Windows e validação manual informada; concorrência manual entre abas permanece MANUAL_INCONCLUSIVE, separada dos 16 PASS automatizados. A política inicialmente proposta foi ratificada no [aceite funcional](SYSTEM_DESIGN_FUNCTIONAL.md#manutencao-inicial); a execução real e seus limites estão no [relatório](T0003_REPORT.md). O texto de preparo/revisão acima registra a etapa anterior. J01 e as oito integrações V05-I permanecem pendentes.

<a id="v01-t4"></a>
## V01-T4 — Matriz de expectativas ratificadas e histórico da preparação (24/10/2026)

**Registro histórico: todos os 24 casos estavam NOT RUN na preparação.** IDs V01-T4-01–24 formalizam P01–P24 da análise anterior; não colidem com V01-T3/V00-I nem criam tickets. Ratificação R-T4-01–07 e aprovação GF-T4-01–12 foram seguidas por autorização individual e implementação T0004; [resultados atuais](T0004_REPORT.md#matriz-v01-t4) separados das expectativas preservadas abaixo.

A matriz abaixo permanece integralmente idêntica à preparação: IDs, fontes, pré-condições, entradas, resultados esperados, tipos, evidências, limites e status. Termos de proposta/ratificação nas linhas registram sua origem ou dependência documental agora satisfeita; nenhuma obrigação de implementação, compatibilidade ou prova técnica foi considerada executada. Incluem backup, migração transacional com banco vazio/upgrade com dados, constraints/especializações, rollback, hashes/recibos antigos e regressão dos 69 comportamentos aceitos. A ressalva manual T0003 continua MANUAL_INCONCLUSIVE, sem defeito confirmado.

**Fixture futura comum F-T4:** SQLite real isolado em arquivo local; bootstrap demo preservado e contexto operational autorizado, duas conexões/processos quando houver corrida; segundo dataset autorizado e epoch aposentado só em fixture, sem implementar reset. Backup schema 2 com radar v1, pedido inicial, localizações, versões/revisão, evento, recibos create/update/no-op, sessão/ator/grants e manifesto de hashes pré-upgrade. Treze novos perfis somente depois de ratificação R-T4-01–06. Todos os dados são fictícios; não usar banco operacional do usuário. F-T4 não é gerador F05.

**Evidência comum E-T4:** revisão de código/OS/Node/npm/SQLite e PRAGMAs reais, dataset/epoch, manifesto/fixture, passos/input/expected/observed, código HTTP/requestId seguros, contagens/versões/revisões/recibos antes/depois e arquivo/nome do teste; registros manuais com navegador/passos sem segredo. Capturar cada subcaso e fronteira, não um único exemplo feliz. NOT RUN só vira PASS por execução observada e rastreada. Baseline histórica: 69 testes/8 arquivos, 21 V00-I e 16 V01-T3 PASS aceitos; nenhum foi repetido nesta preparação.

| ID / cenário original | Fonte normativa ou proposta a ratificar | Pré-condições | Entradas positivas | Entradas negativas | Resultado esperado | Tipo | Evidência exigida / dependências e limites | Estado |
|---|---|---|---|---|---|---|---|---|
| V01-T4-01 / P01 catálogo | R01/R02; técnica 12.1; R-T4-01/02 | F-T4 com manifesto ratificado | Ler catálogo contextual; cada um dos 14 code/v1 | Código/versão inexistente em criação; tentar sobrescrever perfil | Catálogo completo, referências válidas, ordem definida; inexistente 422; imutabilidade persistente | Contrato HTTP + integração SQL | E-T4 + comparação de 14 linhas e sidecar, bytes radar antigo; não taxonomia universal | NOT RUN |
| V01-T4-02 / P02 atributos | Técnica 11.1/12.1; R-T4-01 | Cada perfil isolado | Cada exemplo + da matriz, limites inclusivos, decimais finitos nos tipos number | Cada exemplo −, ausente/null/tipo errado, extra, fração em integer e não finitos/inteiros inseguros no JSON bruto | Somente schema da versão aceito; 400 estrutura/tipo/extra/ausência, 422 faixa/null/enum; sem efeitos de erro | Unitário normalização + contrato + integração | E-T4 + submatriz 14 perfis × criação/edição/limites; regras fictícias identificadas; sem sensor universal | NOT RUN |
| V01-T4-03 / P03 versões | CategoryVersion/I02; técnica 12.1/12.7 | Radar v1 pré-upgrade | Reabrir/editar radar com seu schema; consultar versão persistida | UPDATE/DELETE/REPLACE de perfil; “última versão” implícita; alterar categoria por PATCH | Perfil antigo e FK preservados; mutações negadas; versão não migra automaticamente | SQL + contrato + regressão | E-T4 + bytes/hash perfil antes/depois; eventual versão extra é fixture, não decisão de produto | NOT RUN |
| V01-T4-04 / P04 mobilidade | I05; técnica 12.1/12.4 | Um fixed e um mobile por perfil ratificado | Cadastro com mobilidade derivada da versão; UI mostra valor real | Enviar mobility no body; classificar base como rastreamento; duplicar viatura para outra função | Campo extra 400; mobilidade coerente; categoria primária única; sem posição inventada | Contrato + integração + manual | E-T4 + rótulos/manifesto; mobilidades novas dependem R-T4-01 | NOT RUN |
| V01-T4-05 / P05 migração | Técnica 2/12.6; I01/I03; R-T4-06 | Cópia consistente schema 2 e banco vazio | Aplicar sequências completas, upgrade com registros, repetir íntegra | Checksum/schema futuro/dado inválido; falha em cópia, índice, trigger, ledger, antes de commit e processo interrompido | Upgrade atômico; FKs/checks/triggers mantidos; recusa/rollback sem alteração parcial; prontidão correta | Integração arquivo real + crash/recovery | E-T4 + backup validado, inventário/bytes pré/pós, foreign_key_check/integridade zero; provar ciclos com FK ON antes de tráfego; nenhum SQL executado agora | NOT RUN |
| V01-T4-06 / P06 agentes | R03; técnica 12.3; JF-06 complementar | F-T4 com Agent ratificado | Criar, listar, detalhar, editar nome/função/matrícula/localização; no-op | Campos Equipment/conta/pessoais; kind/atividade editável; texto vazio | AgentView e identidade próprios, unknown inicial, 201/200, versão/evento/revisão corretos; negativos 400/422 sem efeitos | Contrato + integração + manual | E-T4 + jornada JF-06 em dev/distribuição futuros; R-T4-04/07 | NOT RUN |
| V01-T4-07 / P07 matrícula | Unicidade contextual seção 2/12.3 | Dois Agents/contextos e edições | “ ag-01 ” normaliza AG-01; mesma matrícula em outro contexto autorizado | Nova criação ou edição colidindo com AG-01; corrida com duas chaves | 409 ENROLLMENT_CONFLICT; um recurso completo; sem órfãos/evento/recibo do perdedor | Unitário + integração concorrente | E-T4 + normalização binária/contagens; matrícula distinta de série e PK | NOT RUN |
| V01-T4-08 / P08 série | Seção 2/11.1/12.1 | Equipamentos de categorias distintas | Série nova; mesma série em outro contexto autorizado | Mesmo serial normalizado entre duas categorias, criação/edição/corrida | 409 SERIAL_CONFLICT independentemente da categoria; nunca duplicar Resource | Integração HTTP/SQL | E-T4 + contagens e casos radar/novo perfil; série não ganha namespace por categoria | NOT RUN |
| V01-T4-09 / P09 endereço | Técnica 11.1/12.4 | Cadastro/base por tipo | CEP 01001000 e máscara 01001-000, UF SP, textos fictícios | CEP incompleto/máscara diversa, UF inexistente/minúscula, texto só espaços, null | Normalização exata do CEP; 400 tipos/extras ou 422 semântica; nenhuma geocodificação | Unitário + contrato + manual | E-T4 + todos os papéis; validade de formato não certifica endereço real | NOT RUN |
| V01-T4-10 / P10 coordenadas | Técnica 2/11.1/12.4/12.5 | Recursos dos quatro ramos semânticos | Par null, limites ±90/±180, par explícito (0,0) e decimal finito | Só latitude/longitude, fora de faixa, string, NaN/Infinity; operational fixo sem par | Par completo ou ausente conforme ramo; erro 400/422; zero nunca é sentinel; cadastro permitido sem ponto continua consultável | Unitário + contrato + integração | E-T4 + prova de ausência de ponto inventado; polygons/fronteiras espaciais somente T0006 | NOT RUN |
| V01-T4-11 / P11 proveniência | I05/R03; técnica 12.4 | Fixo instalado/não instalado, móvel, Agent | Cadastro installation/base/institutional permitido; base adicional explícita | institutional em Equipment, installation em Agent/móvel proposto, observedAt/posição no input; base exibida como atual | Papéis/tipos validados; nenhuma observação dinâmica/origem/instante fabricados nem inferência de estado | Contrato + integração + manual | E-T4 + tabela cadastro/base/situação; posição observada T0007, mapa T0006 não testados aqui | NOT RUN |
| V01-T4-12 / P12 segurança | I01/C02; técnica 12.3/12.7; auth existente | Sessões/grants válidos e inválidos; DTOs válidos | Leitura autorizada; mutação com Origin/CSRF válidos | Sessão ausente/expirada, origem/CSRF incorretos, read-only, grant/epoch alheio, body >64KiB, propriedades JSON repetidas, >60 mutações/min | 401/403/409/400/413/429 conforme barreira existente; sem vazamento ou recibo/efeito; códigos preservados | Contrato HTTP + integração real | E-T4 + todas as quatro rotas Agent e Equipment, inclusive replay negado; não tratar rejeição CSRF como teste CAS | NOT RUN |
| V01-T4-13 / P13 idempotência | I02/C02; técnica 12.7 | Recibos reais pré-upgrade e novos comandos | Replay após upgrade/reinício/novo acesso, propriedades reordenadas e defaults estáticos equivalentes | Mesma Kc com target/expectedVersion/body divergente; contexto não autorizado/aposentado | Bytes/hash antigos iguais, código/corpo originais com replay; sem nova revisão/pedido; conflito 409 e acesso prevalece | Vetores unitários + HTTP/SQL + reinício | E-T4 + bytes Cc/SHA-256 e recibos pré/pós; CREATE/PATCH Equipment/Agent e no-op; não fechar V05-I integral | NOT RUN |
| V01-T4-14 / P14 concorrência | I04/C02; técnica 12.3/12.7 | Dois processos/conexões e barreira real | Edição com versão atual, replay antigo após outra mudança | Duas chaves com mesma versão, mesma Kc equivalente/divergente; busy >1000 ms | Um vencedor, outro VERSION_CONFLICT ou replay/conflito de identidade; busy 503 limitado, nunca dois efeitos | Integração concorrente real | E-T4 + sincronização/contagens/revisões; no-op com versão atual não muda domínio; sequencial não comprova corrida | NOT RUN |
| V01-T4-15 / P15 atomicidade | I03; técnica 12.2/12.3/12.6 | Instrumentação exclusiva de teste/SQLite real | Confirmar unidades de cadastro/edição/pedido | Falhar após cada write, evento, revisão, serialização, recibo e COMMIT | Tudo ou nada; sem especialização/localização/estado/pedido órfãos, 500/503 sanitizados; retry mesma chave confirma uma vez | Injeção de falha + arquivo real | E-T4 + snapshot/contagem pré/pós em cada fronteira; não adicionar endpoint público de falha | NOT RUN |
| V01-T4-16 / P16 durabilidade | C01/I03; técnica 12.6 | Mesmo arquivo local/WAL, processos reais | Salvar Equipment/Agent/pedido, parar/reabrir e consultar/replay | Interromper antes de commit e após commit com resposta suprimida | Efeito/recibo sobrevivem juntos ou ambos ausentes; nenhum reset/novo principal | Smoke + crash/recovery | E-T4 + PRAGMAs/SQLite e mesmo path; não alegar resistência a dano físico nem instalação limpa nova | NOT RUN |
| V01-T4-17 / P17 edição restrita | Técnica 11.1/12.1/12.3; design 15.1 | Registros de cada perfil/version | PATCH parcial de campos e substituição completa de attributes/Location; null base | Alterar category/version/kind/mobility/org/state/activity/manutenção/position; attributes de outro perfil; PATCH vazio | Campos proibidos/estrutura 400, valores incompatíveis 422, sem alterações parciais; categoria não muda | Contrato + integração + manual | E-T4 + quadro editáveis/imutáveis; mudanças de categoria/transição administrativa fora do ticket | NOT RUN |
| V01-T4-18 / P18 consultas | Técnica 11.1/12.1/12.3; design 15.1/15.2 | Vários equipamentos/agentes, páginas pequenas e snapshot concorrente | GET lista/detalhe/catálogo, page além do total, ordem binária, perfis reais | Query extra, page inválida/0, pageSize>200, id inacessível; mistura revisão | Paginação/códigos previstos, total real, snapshot consistente, no-store e projeção segura; 404 sem vazamento | Contrato + integração snapshot + manual | E-T4 + limites/ordem/campos exatos; filtros avançados/bbox T0006, não antecipar | NOT RUN |
| V01-T4-19 / P19 recuperação | Design 15.1–15.3/GF-T4-02/08/09 | UI futura autorizada; rascunho e intenção incerta | Teclado, erro/retorno, reautenticação no mesmo contexto, confirmação/cancelamento de troca de categoria | Timeout após commit, erro de consulta após sucesso, contexto diferente, fechar/recarregar, descartar atributo sem confirmar | Preservar comuns/rascunho autorizado e intenção imutável; não reenviar em outro contexto; rótulos/foco/mensagens acessíveis; sem promessa de persistência | Manual/E2E funcional + HTTP controlado | E-T4 + navegador/passos/largura menor/capturas sem segredo; leitor de tela só declarar se testado; gate funcional precisa ratificação | NOT RUN |
| V01-T4-20 / P20 estados | R04/I05; técnica 3/12.5 | Todos os perfis e motivos/locais válidos | Omitido→not_installed; novos operational explícitos com motivo/precondições; Agent unknown | Radar v1 operational; demais estados iniciais não admitidos; motivo ausente, initialStateReason indevido; status inferido por ponto/pedido | Restrições propostas e contratos antigos preservados; 400/422 conforme estrutura/semântica; sem transição oculta | Contrato + integração + manual | E-T4 + todos os ramos da tabela; R-T4-05 indispensável; transições completas não verificadas | NOT RUN |
| V01-T4-21 / P21 manutenção | T03-C; técnica 12.2; R-T4-03 | Cada um dos 14 perfis e Agent | Omitido/null e pedido explícito com dated/unknown/not_applicable | Causa do radar enviada a outra categoria, motivo/prioridade/data inválidos, data avulsa, campos booleanos, pedido em Agent | Sem auto-criação, causas por perfil, agenda/projeção correta, atomicidade/replay; Agent rejeita; sem mudar situação | Contrato + integração + manual | E-T4 + 14 × ramos de agenda e negativos, causa persistida/revisão; não intervenção/agenda avançada T0012 | NOT RUN |
| V01-T4-22 / P22 regressão | Aceites T0001–T0003; técnica 12.7 | Implementação autorizada e fixture nova isolada | typecheck, suítes específicas existentes, suíte completa, build e smoke dev/distribuição | Incompatibilidade de radar/recibo/contexto ou checks; desligar teste antigo para passar | Preservar 69 comportamentos aceitos e 21 V00-I/16 V01-T3; adaptar só expectativas literais justificadas; resultados reais discriminados | Regressão automatizada + smoke/manual | E-T4 + comandos/contagens/mapeamento antes/depois; nenhum comando executado agora; novos scripts exigem implementação autorizada | NOT RUN |
| V01-T4-23 / P23 especializações | Seção 2/I01; técnica 12.6 | Schema novo isolado, FK ON, transação real | Resource + especialização/localização/estado correspondentes completos | Commit sem especialização/cadastro/estado, dupla especialização, kind incompatível, FK entre contextos, manutenção em Agent, dados inválidos por SQL direto | CHECK/FK/guardas impedem commit inconsistente; zero órfãos; rollback integral; sem enfraquecer validação do radar | Integração SQL direta | E-T4 + todas as constraints/triggers e commit diferido; validação só no serviço não substitui barreiras persistentes propostas | NOT RUN |
| V01-T4-24 / P24 entre abas | Ressalva humana T0003; design 15.1/16 | Duas abas/sessões do mesmo principal, CSRF válido em cada uma, mesma versão carregada sem refresh | Uma aba confirma; outra tenta alterar com versão comprovadamente antiga | Reautenticar recarregando versão ou receber CSRF_FORBIDDEN antes do CAS | Conflito e revisão explícita quando realmente obsoleto; caso não alcança CAS permanece MANUAL_INCONCLUSIVE, sem PASS artificial | Manual complementar | E-T4 + versões/códigos/ordem de passos; sem promessa tempo real. Não bloqueio automático se integridade automatizada PASS e interação segura; evidência de sobrescrita real exige tratar regressão | NOT RUN |

**Adaptação de regressões, sem alteração agora:** V01-T3-01 conserva checksums/evolução/repetição, ajustando sequência ao schema novo; V01-T3-05 conserva perfil exato e referências, acrescentando manifesto completo; V01-T3-07 troca camera por código desconhecido no caso de categoria inexistente e verifica camera com atributos inválidos segundo 400/422 apropriado. Nenhum dos três pode ser removido ou convertido em PASS sem execução. Registrar relação teste antigo → expectativa de etapa ajustada → garantia preservada no relatório futuro.

**Fronteiras:** V02 de T0004 cobre apenas endereço, pares de coordenadas, papéis e ausência de ponto. Seed/geração/determinismo são T0005; polígonos/point-in-polygon/bbox/mapa/J01 são T0006. Observações dinâmicas/precedência C03 são T0007/T0012; reservas C04 T0015; analytics C05 T0013/T0014. Não fechar V05-I, V02 completo ou J01 com esta matriz. Os resultados PASS aceitos de T0001–T0003, GF01–GF08 aprovados e MANUAL_INCONCLUSIVE manual permanecem intactos.

<a id="v02-t5"></a>
## V02-T5 — F05, contratos ratificados e resultados de implementação, 25/10/2026

Fonte contratual humana: “IGNIS — T0005 | Formalização documental dos contratos ratificados”, baseada no segundo parecer preparatório. [T5-D01–D16/A01–A05](MVP_TECHNICAL_DESIGN.md#t0005-contrato) HUMAN_RATIFIED; [GF-T5-01–12](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0005) HUMAN_APPROVED. A autorização individual de implementação está em [TICKETS](TICKETS.md#implementacao-t0005). **26 PASS técnicos históricos**: 01–23 por testes automatizados/integração, 24–26 por interação assistida no navegador com evidência independente do servidor. [Matriz de evidências e limitações](T0005_REPORT.md#i-matriz-v02-t5); 175 testes/17 arquivos e typecheck/build PASS em 25/10. A posterior homologação funcional dos oito cenários e a declaração humana de 26/10 encerraram T0005 como [DONE / HUMAN_ACCEPTED](TICKETS.md#aceite-humano-t0005). O aceite é uma decisão humana separada dos PASS técnicos; não reexecuta ou altera expectativas/modalidades da matriz. Relatórios/resultados T0001–T0004 intactos.

Fixture futura F-T5: SQLite real local descartável com migrations autorizadas, FKs/recursive_triggers ON, WAL/FULL/busy_timeout existentes, operador/grants reais de teste, demo ativo ready vazio e contexto operacional para negativas. Dois contextos/epochs isolados por fixture, sem implementar reset, com mesmos inputs gerando mesmos UUIDs contextuais. Versão anterior schema 3 populado para upgrade/replays T0003/T0004; nenhuma geração/teste em banco do usuário. Processos/conexões independentes com barreiras reais para corridas/crash. Preset ratificado 20/6 e máximo 200/30; falhas injetadas em cada fronteira de domínio/manifesto/recibo/fechamento.

Rechecagem corretiva P2: **16/2 provas direcionadas e 175/17 na suíte completa PASS** após retomada; [evidência atual](T0005_REPORT.md#p2-corrections). V02-T5-10/15 reforçados por leitura dos eventos realmente persistidos, divergências reason/evidenceIds/changes, associação e snapshot após edição. V02-T5-26/GF-T5-09 repetidos para revisão dos defaults e intenção incerta em troca de epoch: provas de componente e observação real de recusa/aceite/ausência de POST no novo contexto. Modalidades e critérios abaixo não alterados; PASS técnico não é homologação humana.

Evidência E-T5: revisão de código/OS/Node/npm/SQLite/PRAGMAs reais, contexto/manifesto/seed/versões, input normalizado, esperado/observado, requestIds seguros, contagens/versões/revisões/grupo antes/depois, arquivo/nome de teste e status com motivo. Manual: navegador/passos/capturas e evidência independente do servidor sem segredo. A01 testa IDs iguais em contextos distintos e joins/FKs corretos; A02 exige SQL direto e COMMIT sob guardas reais, não só mocks; A03 separa tempos sintéticos e reais; A04 verifica snapshot inicial após edição; A05 mede máximo sem redução silenciosa.

| ID | Verificação e critério de aprovação | Modalidade preservada | Rastreabilidade | Estado |
|---|---|---|---|---|
| V02-T5-01 | Mesma configuração em dois contextos/gerações isolados, IDs derivados equivalentes, P/contentHash/contagens iguais excluindo somente metadados contratados | Automatizada | D05/06; A01/A04 | PASS |
| V02-T5-02 | Seeds de referência distintas alteram dados previstos mantendo validade/contagens; não exigir diferença de todo campo nem testar só hash da seed | Automatizada | D05; A04 | PASS |
| V02-T5-03 | Vetores da raiz/fluxos/contador, rejeição, precisão decimal/coord., UUID, Unicode sem NFC e ordenação; sem dependência de locale/relógio | Automatizada | D05/06; técnica 13.5 | PASS |
| V02-T5-04 | UUID/logicalKey/série/matrícula únicos no contexto, repetíveis em outro; colisão local falha sem salt; chaves globais reais preservadas | Automatizada | D06; A01 | PASS |
| V02-T5-05 | Cada um dos 14 schemas/políticas selecionados gera cadastro válido através do domínio; preset cobre todos | Automatizada | D10/12/13; catálogo T0004 | PASS |
| V02-T5-06 | Tipos/faixas/enums/atributos exatos, grades e exclusividades validados pelo cadastro real; sem schema permissivo paralelo | Automatizada | D05/10; T03-C/R-T4 | PASS |
| V02-T5-07 | Equipment not_installed/Agent unknown, radar v1 intacto; cadastro/agenda/ponto não ativam estado ou observação | Automatizada | D07/10; A03 | PASS |
| V02-T5-08 | Omissão e agendas unknown/dated/not_applicable coerentes; causa por perfil, prioridade independente; preset 5+5+5+5 e 15 pedidos; datas civis explícitas | Automatizada | D10/12; A03 | PASS |
| V02-T5-09 | Papéis/endereço fictício/par ou null, zero não sentinel; preset seis sem ponto/vinte pares; regionId null sem pertencimento inventado | Automatizada | D11; V02 cadastral | PASS |
| V02-T5-10 | Manifesto/G/P/hashes/contagens/proveniência corretos; R+1 uma vez, ordinais 1..N, recibo pai e FKs contextuais; editar cadastro não muda snapshot/contentHash inicial | Integração | D04/08/14; A01/A02/A04 | PASS |
| V02-T5-11 | Mesma Kc equivalente retorna código/corpo originais sem efeito, inclusive após edição posterior/nova sessão/reinício; acesso atual obrigatório | Integração | D09; C02 | PASS |
| V02-T5-12 | Mesma Kc com configuração/guarda divergente retorna conflito, sem sobrescrever recibo ou gerar dados | Integração | D09; C02 | PASS |
| V02-T5-13 | Dois processos, mesma Kc: um efeito/grupo; replay ou busy limitado e retry; não comprovar corrida com chamadas sequenciais | Integração concorrente | D08/09; A02/A05 | PASS |
| V02-T5-14 | Kcs/principais diferentes disputam contexto: um baseline, outro conflito/busy; exclusividade não depende só de Kc | Integração concorrente | D03/09; A02 | PASS |
| V02-T5-15 | Falha em item/pedido/evento/associação/manifesto/fechamento/serialização/recibo/commit reverte tudo. SQL direto tenta prefixo, buraco, duplicata, N incorreto, contexto/revisão/pai/evento/recurso alheios, fechar cedo, sem fechar/recibo, adulterar após fechar: COMMIT inconsistente recusado | Integração com falhas e SQL direto | D04/08; A01/A02/A04 | PASS |
| V02-T5-16 | Processo interrompido pré/pós-commit: grupo/manifesto/recibo todos ausentes ou todos íntegros; recuperação/replay sem reset. Leitor não publica revisão após página parcial de ordinais | Processos reais | D08/09; A02/A05 | PASS |
| V02-T5-17 | Operational, dataset/grant alheio, sessão/Origin/CSRF/read-only recusados sem efeito/vazamento; IDs iguais não cruzam FKs/joins | Segurança | D02/06/09; A01 | PASS |
| V02-T5-18 | Epoch aposentado/preparing externo recusado, inclusive com recibo; nenhuma troca silenciosa de contexto/capability | Integração de contexto | D01/02/09 | PASS |
| V02-T5-19 | Demo já populado, manifesto ou referência divergente intactos; nenhum reparo/mescla/exclusão; segunda Kc conflitante | Integração | D03/13 | PASS |
| V02-T5-20 | Negativos/fracionários/excesso/total zero/duplicata/categoria-versão desconhecida, extras, JSON inválido, 413/429; ordem e códigos de 13.3 preservados | Contrato HTTP | D02/09/12; C02 | PASS |
| V02-T5-21 | Exercer 200 Equipment/30 Agents e medir duração total, lock/transação, memória, bytes de resposta, SQLite/WAL, reinício/replay e concorrência. Máximo inviável bloqueia aceite ou exige revisão humana, nunca redução silenciosa | Integração e medição real | D08/12; A05 | PASS |
| V02-T5-22 | Nenhum TelemetryEvent/coverage_interval, histórico de 60 dias, tick, alerta, ScenarioRun, scheduler, missão, mapa ou reset; recordedAt sintético não serve como observação/cobertura real | Automatizada | D01/07/11/14; A03 | PASS |
| V02-T5-23 | T0001–T0004, upgrade schema 3 populado, bytes/hashes/recibos e eventos antigos ordinal 1 preservados; novas garantias não afrouxam o legado | Regressão automatizada | D06/08/09; A01/A02 | PASS |
| V02-T5-24 | Duas fixtures/gerações isoladas: comparar manifesto, contagens e amostras cadastrais/tempos/proveniência; nenhuma feature de reset necessária | Manual | D04/05/07/15; A01/A03/A04 | PASS |
| V02-T5-25 | Preparar/revisar/confirmar/cancelar, teclado/foco/largura reduzida, parâmetros/defaults, limite e bloqueio operacional; erro separado de vazio | Manual | D16; GF-T5-01–06/12 | PASS |
| V02-T5-26 | Timeout pós-commit/retry, reautenticação, epoch, fechar/perder chave/consultar, GET falho após sucesso e isolamento: evidência UI+servidor sem recuperar chave fictícia | Manual com rede controlada | D09/15/16; GF-T5-07–12 | PASS |

**Reconciliação V02:** esta matriz cobre F05/determinismo/validade e localização cadastral da etapa. Não substitui nem remove os casos V02 existentes de distribuição em polígonos, ponto de fronteira/externo e classificação regional: permanecem NOT_RUN em T0006, junto de V03/J01. Os PASS de V02-T5 não são V02 integral nem encerramento de J01. V04 de histórico/tick/reset permanece nos tickets posteriores. A formalização documental anterior não executou testes; os resultados atuais pertencem exclusivamente à implementação individualmente autorizada e ao relatório vinculado.
