# C03 — Contrato ratificado de telemetria, causalidade e snapshots

<a id="ratificacao-c03"></a>
## 1. Decisão humana, autoridade e estado

**C03: HUMAN_RATIFIED. D01–D12: RATIFIED.** Registro de 26/10/2026, por autorização humana expressa **“PROJECT IGNIS — Registro formal da ratificação C03”**. O responsável aprovou integralmente as decisões e todos os limites, condições e ressalvas das análises **“C03: Consolidação e Ratificação Contratual”** e **“C03: Fechamento dos últimos pontos contratuais”**, esta última com parecer READY_FOR_FINAL_C03_APPROVAL. Os refinamentos finais de D01/D03, D06, D08 e D12 prevalecem sobre suas recomendações preliminares.

Autorização desta execução: documentação, verificação documental e um commit local. **Não autoriza implementar T0007**, executar migrations, alterar bancos ou iniciar serviços. Checkpoint anterior: main / `de14734d415f72c4dff8423be586b80cf1e9ba07`. Schema vigente **5**; migration **0006: RESERVED / NOT_CREATED**, exclusivamente T0007. T0001–T0006 **DONE / HUMAN_ACCEPTED**; T0006/J01 **PASS / HUMAN_ACCEPTED**; T0007 **PLANNED / NOT_STARTED / NOT_AUTHORIZED**. V05/V06 **NOT YET ACCEPTED** nos respectivos escopos; casos C03 deste documento **NOT_RUN**.

Este documento é a fonte normativa específica C03, complementar ao [design técnico](MVP_TECHNICAL_DESIGN.md#contratos), ao [C02](MVP_TECHNICAL_DESIGN.md#idempotencia) e ao [ADR-0002](adr/0002-eventos-snapshots-e-isolamento.md). Especializa as seções 1/3/4/5/6 técnicas apenas nos pontos ratificados abaixo. Menções anteriores a C03 pendente descrevem o estado histórico anterior; não substituem esta decisão. C02, C04, C05 e os ADRs Accepted — Conditional não são encerrados integralmente por este registro. [Rastreabilidade](TICKETS.md#ratificacao-c03), [verificação](VERIFICATION_GUIDE.md#verificacao-c03), [limites e pendências](KNOWN_ISSUES.md#limites-c03).

Distinções obrigatórias:

- **Normas preexistentes preservadas:** isolamento contextual, C02/Kc/Ke/Ks, atomicidade/recibos, separação de dimensões, histórico sem retrocesso, manutenção não concluída automaticamente por observação.
- **Implementação existente no checkpoint:** autenticação de operador, Kc/canonicalização, inventário, pedidos iniciais, baseline T0005, regiões/snapshot T0006. Não existem ingestão T0007, fontes/cursores/episódios C03 ou migration 0006.
- **Contrato agora ratificado, ainda não implementado:** D01–D12 abaixo. Aprovação contratual não é PASS técnico, homologação T0007 ou autorização individual de implementação.
- **Resultado histórico:** 184/184 testes em 20 arquivos, typecheck/build PASS de T0006; não reexecutados neste registro exclusivamente documental. Testes, builds e migrations não são necessários para verificar esta alteração documental.

<a id="decisoes"></a>
## 2. Matriz integral de decisões

| ID | Decisão ratificada | Dependências | Status |
|---|---|---|---|
| D01 | Ocorrência original e início imutável para causalidade; ajuste temporal de projeção separado | D03, D08 | RATIFIED |
| D02 | Corte inclusivo de conclusão; recorrência estritamente posterior; sem desempate por UUID/chegada | D01, D03 | RATIFIED |
| D03 | Episódio contextual independente de causeCode na chave; atributos imutáveis, aliases recusados e resolução da causa até o corte | D01, D02, D10 | RATIFIED |
| D04 | CAS e avaliação causal na mesma transação; conflito explícito e preservação de falha posterior | D03, D10, D11 | RATIFIED |
| D05 | Disposição estável e efeitos por dimensão; revisão por conhecimento novo, sem efeito adicional de replay | D01, D06, D09 | RATIFIED |
| D06 | Perfis versionados explícitos; quatro perfis somente de fixture/homologação isolada; ativação operacional separadamente aprovada | D07, D09, D10 | RATIFIED |
| D07 | Principal de fonte e credencial próprios; binding contextual e identidade/cursores preservados | D06, D08 | RATIFIED |
| D08 | UTC operacional, relógio lógico demo e relógio de teste separados; regressão conhecida falha fechada; limites de persistência explícitos | D01, D07, D11 | RATIFIED |
| D09 | Proprietário da comunicação, intervalo/TTL explícitos, fallback de posição e nenhuma inferência entre dimensões | D05–D08 | RATIFIED |
| D10 | Necessidade ativa por recurso/causa, episódios/evidências separados; conclusão não elimina pendências posteriores | D03, D04, D06 | RATIFIED |
| D11 | Núcleo e provas em T0007; conclusão pública de manutenção e integração V06 em T0012 | D03, D04, D10 | RATIFIED |
| D12 | Revisão e corte distintos, leitura transacional consistente e proteção do frontend contra obsolescência/regressão temporal | D08, D09, D11 | RATIFIED |

<a id="fontes-identidades"></a>
## 3. Fontes, autorização, identidades e replay — D07/C02

Fonte tem principal estável resolvido pelo servidor, distinto do operador que a provisionou. `source.id` declarado não concede acesso. Credencial de ingestão é separada da sessão/cookie de navegador; rotação da credencial e reinício não mudam a identidade do principal. Provisionamento é local e explícito, sem habilitação automática na migration ou no boot. Uma fonte ativa por recurso/canal e um proprietário por campo projetado; canais independentes não disputam o mesmo campo. Bindings referenciam contexto, recurso, canal e versão explícita do perfil.

Credencial, grant/capacidade, binding e epoch ativo/pronto são revalidados antes de devolver recibos. Fonte revogada não recebe replay; epoch aposentado retorna conflito de geração antes do replay. Troca de fonte não apaga eventos, episódios, cursores ou recibos; reativar a mesma fonte preserva sua sequência. Reiniciar sequência alteraria Ks e não é autorizado por um novo binding. Transferência administrativa de autoria de episódio não pertence à ingestão.

```text
Kc = (datasetId, epoch, actorId, operation, commandId)
Ke = (datasetId, epoch, sourceId, eventId)
Ks = (datasetId, epoch, sourceId, resourceId, channel, sequence)
operation = telemetry.ingest.v1
target = null
```

Preservar [Cc/Ce, normalização e JCS/SHA-256 de C02](MVP_TECHNICAL_DESIGN.md#identidade-eventos): corpo projetado inclui somente campos imutáveis admitidos; `resourceId` coincide com `entityId`; metadados gerados, credenciais, receivedAt/recordedAt, ajuste temporal, revisão resultante e isSimulated atribuído pelo servidor ficam fora do hash. OccurredAt original é normalizado antes do ajuste. Unidade/valor originais permanecem na identidade, mesmo quando outra unidade expressa grandeza equivalente. Opcionais causationId/units omitidos normalizam para null conforme C02; heartbeat sem diagnóstico usa values={}. `episodeStartedAt` integra values dos eventos de falha e a identidade canônica, junto de episodeId/causeCode; timestamps e sequência não podem ser retirados do hash.

| Situação | Resultado obrigatório |
|---|---|
| Kc equivalente | Código/corpo originais, `Idempotency-Replayed: true`, sem novo efeito ou revisão |
| Kc divergente | 409 sem gravação; mesmo commandId com outro evento conflita |
| Nova Kc, Ke equivalente | Resposta original do evento; pode gravar apenas novo recibo Kc na mesma transação, sem duplicar evento/cursor/efeito/revisão |
| Ke divergente | 409, inclusive eventId reutilizado para outro recurso da mesma fonte/contexto |
| Ks ocupada por outro eventId | 409, mesmo com valores físicos iguais; rollback do novo recibo |
| Acesso revogado/sem binding | Recusa antes de expor recibo; fonte informada não substitui autenticação |
| Epoch aposentado | 409 contextual prevalece sobre replay |

Kc é consultada antes de Ke/Ks e antes de guardas mutáveis de negócio. Replay confirmado não recalcula tempo, clamp, disposition, freshness, IDs ou resultado, mesmo após outra operação modificar o recurso. Validade atual de acesso continua obrigatória. Erros não consomem chave; resposta confirmada não é substituída por resposta da tentativa posterior.

<a id="tempos"></a>
## 4. Semântica temporal — D01/D08

| Campo | Semântica ratificada |
|---|---|
| occurredAt | Ocorrência original informada pela fonte, UTC normalizado; imutável em Ce |
| episodeStartedAt | Início declarado do episódio; imutável, não posterior a occurredAt; integra values/Ce de falhas |
| receivedAt | Recebimento real da tentativa confirmada; replay conserva o original, tentativas podem ter auditoria separada |
| recordedAt | Momento em que o fato confirmado ficou conhecido no relógio de domínio; não retrodatado à ocorrência atrasada |
| processingDataNow | Amostra interna única do relógio de domínio para decisão transacional do evento novo |
| observationEffectiveAt | Tempo ajustado para projeção: no operacional, min(occurredAt, processingDataNow); fora do hash |
| effectiveAt do evento operacional derivado | Momento da transição aplicada no domínio, referenciando a observação original sem se passar por ela |
| completedAt | Corte causal explícito da conclusão autorizada; não inferido do recebimento |

C03 compara causalidade com os instantes originais/início do episódio, não exclusivamente com o ajuste dependente do momento de recebimento. Tempo do fato, conhecimento e auditoria não são intercambiáveis. Precisão/offset/normalização seguem C02: UTC normalizado, no máximo milissegundos, sem truncamento permissivo.

Evento operacional novo tolera até **30.000 ms** no futuro em relação a processingDataNow; acima disso: 422 sem evento/recibo. Evento tolerado conserva occurredAt no hash e recebe ajuste separado; **não avança dataNow**. Limite histórico inferior é explícito/persistido, nunca anterior ao nascimento do recurso nem ao início autorizado do fluxo/histórico; adotar o maior desses limites. OccurredAt e início do episódio devem respeitá-lo. Não há janela móvel arbitrária de últimos N dias. Replay não reavalia esses limites.

<a id="relogios"></a>
## 5. Fonte, amostragem e confiança do relógio — D08

| Contexto | Fonte de dataNow | Avanço |
|---|---|---|
| Operacional | UTC do sistema operacional por provedor injetável | Avança durante silêncio, independentemente de eventos |
| Demo com contexto temporal autorizado | Relógio lógico persistido desse contexto | Somente por comandos/transações autorizados; pausa conserva valor |
| Baseline T0005 sem run | Não possui relógio de simulação ativo | baseTime não é promovido a dataNow ativo |
| Fixture | Relógio explicitamente controlado pelo teste | Ações da fixture, sem alterar relógio do sistema |

Autenticação, segurança e expiração de credenciais permanecem no relógio real, separados do relógio demo/fixture. Sem contexto temporal demo autorizado, ingestão demo falha explicitamente; T0007 não cria ScenarioRun a partir do manifesto. Fixtures podem fornecer seu próprio contexto temporal isolado. T0008/T0009 introduzem os contextos correspondentes de produção.

No operacional, persistir um marco de UTC confiável já utilizado para detectar regressões conhecidas, não um contador que substitua UTC. Atualizá-lo nas transações mutáveis pertinentes, sem revisão de domínio adicional apenas por metadados de relógio; manter máximo observado em memória durante o processo. **GET não grava o marco.** Inicialização não usa baseTime sintético como UTC confiável. Relógio lógico demo precisa sobreviver ao reinício, mas sua criação/avanço de produção permanece nos tickets próprios.

Ingestão usa uma amostra de processingDataNow para todas as decisões do evento novo dentro da unidade transacional. Snapshot usa um corte único para todos os recursos/indicadores. Replay não reamostra para recalcular resultado. Silêncio não congela relógio operacional. Reinício com UTC pelo menos igual ao marco durável retoma UTC atual, sem replay de eventos nem compensação automática do tempo demo.

UTC inferior ao marco confiável conhecido, durável ou observado no processo: operações dependentes desse relógio falham fechadas com **503 CLOCK_UNTRUSTED**, sem resultado parcial. Não corrigir silenciosamente por max(now, marco). A condição conhecida também não prolonga silenciosamente sessões: requisições dependentes da validade temporal das credenciais falham fechadas enquanto o relógio não for confiável. Não há ajuste automático do banco; a última apresentação válida pode permanecer indicada como antiga.

**Limite ratificado:** GET pode observar horário superior ao último marco durável. Após morte do processo e retorno do relógio a instante intermediário, o banco sozinho pode não detectar a regressão. O frontend recusa retrocesso contra seu último corte conhecido. Não se promete monotonicidade temporal durável de toda leitura entre reinícios. Persistir leituras ou adicionar fonte temporal durável independente seria outra decisão, não parte implícita de C03.

<a id="episodios"></a>
## 6. Integridade causal, episódios e resolução — D01/D02/D03/D10

```text
CauseKey   = (datasetId, epoch, resourceId, causeCode)
EpisodeKey = (datasetId, epoch, resourceId, episodeId)
```

CauseCode é atributo imutável do episódio, **não componente que permita reutilizar episodeId para outra causa** no mesmo recurso. Episódio mantém início imutável, origem autorizada, evidências e eventual cobertura por resolução. Identidades são contextuais, não globalizadas entre gerações.

Invariantes executáveis:

1. Mesmo episódio não muda causeCode, episodeStartedAt ou fonte de origem por ingestão.
2. `limiteHistorico <= episodeStartedAt <= occurredAt`.
3. EpisodeId, início, causa, ocorrência e sequência integram a identidade imutável do evento.
4. Mesmo contexto/recurso/causa e mesmo início declarado com outro episodeId conflitam; não criar alias. A granularidade continua milissegundos.
5. Aumentar sequência não autoriza redefinir episódio; receivedAt não decide precedência causal.
6. Corte de resolução confirmado de uma causa nunca retrocede e não resolve outra causa/recurso/contexto.
7. Validar identidade/coerência de entrada nova antes de classificá-la como histórica; atraso não torna contradição aceitável. Replay confirmado equivalente continua anterior a guardas mutáveis e conserva resposta/disposição originais.

| Entrada nova | Resultado |
|---|---|
| occurredAt anterior a episodeStartedAt | 422, sem evento/recibo |
| Mesmo episódio com outro início/causa/origem | 409, sem alteração |
| Outro episódio, mesma causa e início já registrado | 409, alias conflitante |
| fault_cleared de episódio desconhecido | 422, sem fabricar episódio |
| Episódio iniciado antes ou exatamente no corte da causa | 200 / historical se demais requisitos válidos; motivo de cobertura; sem reabertura/rejuvenescimento |
| Novo episódio iniciado depois do corte | Candidato à aplicação, ainda sujeito a fonte/perfil/janela/cursor |
| Fora de ordem pelo cursor | historical, sem efeito presente, mesmo se posterior a uma resolução antiga |

Conclusão atesta resolução **somente da causa selecionada até completedAt, inclusive**. Episódio iniciado em t<=C fica coberto; t>C não fica coberto. Empate favorece a conclusão para essa causa. Não desempatar por UUID, chegada ou ordem de commit. Repetir episódio coberto, inclusive com mensagem posterior, não é recorrência: recorrência exige outro episodeId e início estritamente posterior, além das demais guardas. Outra causeCode permanece intacta.

Fault_cleared encerra a indicação observacional naquele momento, mas não resolve automaticamente a necessidade/intervenção. Nova detecção do mesmo episódio ainda não resolvido pode atualizar evidência sem criar outro ciclo automaticamente. Métrica isolada não cria falha por limiar inventado.

Uma necessidade ativa por recurso/causa pode agregar episódios/evidências separados. Conclusão que cobre episódio anterior não torna a necessidade resolvida se resta episódio posterior; intervenção pode registrar resultado mantendo pendência explícita. Outra causa ou intervenção em andamento também impede operacional indevido. Necessidade preventiva não obriga sair de operational. Prioridade é explícita; não derivar automaticamente de criticidade/score ou reaproveitar códigos preventivos iniciais como falha telemétrica. Pedidos T0005 são preservados, sem conversão automática em episódios.

A associação administrativa pode refletir ordem do conhecimento: conclusão conhecida antes de recorrência pode produzir pedido posterior; recorrência conhecida antes pode manter o pedido ativo. Isso não permite duplicar necessidades ativas. Não se exige igualdade artificial de IDs, revisões, recibos ou histórico administrativo entre histórias distintas de conhecimento; verificar a proteção causal e causas remanescentes.

**Limite de confiança:** identidade/replay/aliases/contradições não reabrem causa resolvida. Uma fonte que fabrique conjuntamente novos IDs, sequência e timestamps coerentes apresenta um novo fato falso; autenticação não comprova veracidade física. Resistência a essa fabricação deliberada exigiria confirmação humana ou evidência independente confiável, não autorizadas implicitamente por C03.

<a id="pipeline"></a>
## 7. Ordenação, disposições, concorrência e atomicidade — D04/D05

Fluxo de comando: autenticar/conferir contexto e limites, validar estrutura estática e hash; abrir transação; revalidar acesso/geração; Kc, depois Ke/Ks; somente para evento novo avaliar elegibilidade, coerência, janela, cursor e resolução; persistir toda a unidade; responder apenas após commit. Nenhuma rede dentro da transação.

Sequência é inteiro seguro não negativo. Separar maior sequência vista de maior tempo aceito para projeção. Sequência inferior inédita é histórica; sequência superior com ocorrência original regressiva também. Empate de ocorrência com sequência superior é elegível. Sequência superior histórica avança máximo visto, preservando tempo projetado. Ajuste temporal não pode retroceder instante já projetado. Lacunas são registradas sem espera infinita/preenchimento inventado. Evento válido ignorado por regra de estado conserva a barreira de ordenação do fluxo, distinguindo aceitação no fluxo de mudança física. Canais de falha separam causas coexistentes; posição/heartbeat não tornam falha histórica por compartilhamento indevido de cursor.

Manter `applied/historical/ignored` e motivos/efeitos por dimensão. `Applied` significa ao menos uma projeção aceita, não necessariamente transição física; heartbeat em stolen pode atualizar comunicação sem desbloquear stolen. Histórico não altera estado, comunicação, posição ou alertas atuais. Ignorado conserva motivo e evidência sem efeito proibido; não esconder alteração real atrás de classificação grosseira. Rejeições inválidas não se tornam eventos de domínio confirmados. Disposição e resposta confirmadas não são reescritas por conclusão posterior nem recalculadas em replay.

Evento novo persistido, inclusive historical/ignored, acrescenta conhecimento e recebe uma revisão de domínio por transação. Replay ou apenas recibo novo para Ke existente não incrementa revisão. Várias projeções na mesma transação mantêm uma revisão; versões das entidades efetivamente alteradas avançam uma vez. GET não persiste envelhecimento nem incrementa revisão.

BEGIN IMMEDIATE serializa escritas, mas não decide causalidade. Comando novo de conclusão verifica versões esperadas/estado de intervenção e solicitação. Guarda vencida: 409 sem conclusão parcial/recibo; não retentar automaticamente com versões novas. Nova intenção exige revisão explícita. Kc equivalente confirmada retorna replay antes de revalidar versões antigas. Outra Kc para intervenção concluída não cria segunda conclusão. Conclusão válida preserva episódio posterior, outras causas, estados administrativos e intervenções remanescentes, reavaliados na mesma transação.

Evento, cursor, episódios/evidências, projeções, histórico, necessidades aplicáveis, revisão e recibos são atômicos; alertas somente quando seu estágio existir. Falhar em qualquer fronteira reverte a unidade; serializar resposta antes do commit; não usar recibo processing público, segundo commit de confirmação ou substituição de recibo. Resposta perdida é resolvida pela mesma identidade, nunca por compensação presumida.

**Limite de determinismo:** não há promessa de mesma classificação para toda permutação de eventos; chegar após sequência superior pode tornar evento histórico. C03 não aplica históricos silenciosamente para forçar igualdade. A propriedade é não reabrir evidência coberta e não apagar falha posterior elegível. Nas provas de permutação, separar guardas CAS vencidas, eventos históricos e diferenças legítimas de conhecimento.

<a id="perfis"></a>
## 8. Perfis ratificados exclusivamente para fixture — D06

Categoria cadastral, perfil telemétrico e perfil de fixture são distintos. Perfis são declarativos/versionados e vinculados explicitamente; ausência de capacidade proíbe observação. Nenhum sensor, intervalo ou faixa física de produção é inferido dos 14 perfis cadastrais. RegulatedSpeedLimitKmh não é velocidade observada; capacityKg não autoriza pesagem; occupantCapacity não é sensor de ocupação; causas initial_* são pedidos preventivos, não falhas telemétricas.

| Perfil | Representante cadastral | Capacidades/parâmetros ratificados de teste |
|---|---|---|
| FX-NONE-v1 | camera v1 | Nenhum canal; emissor explicitamente não esperado; not_applicable e rejeição de ingestão sem capacidade |
| FX-FIXED-v1 | camera v1 | Heartbeat, fixture_fault_a e fixture_fault_b, métrica artificial fixture_scalar; intervalo 10.000 ms; posição dinâmica proibida |
| FX-MOBILE-v1 | inspection_vehicle v1 | Heartbeat e posição em canais separados; intervalo 10.000 ms; validade de posição 30.000 ms |
| FX-AGENT-v1 | Agent | Posição e agent_activity separados; validade de posição 30.000 ms; sem falha física, manutenção ou métrica de equipamento |

Fixture_scalar é número finito, unidade artificial `fixture_unit`, domínio de teste [0,1], sem interpretação física/operacional. Esses valores não são capacidades reais de câmera nem intervalos de produção. Os quatro perfis são autorizados **somente para fixtures e homologação isolada**, carregados pelo bootstrap correspondente, não instalados automaticamente em bancos operacionais nem selecionáveis pelo payload externo. Categoria/versões existentes permanecem imutáveis. Nenhum schema arbitrário fornecido pelo cliente é aceito.

Cada binding aponta para perfil/versão; capacidade ausente não tem fallback permissivo. FX-NONE é condição artificial, não declaração sobre câmeras reais. Ausência de perfil não significa ausência de emissor; revogação de fonte não transforma unknown/stale em not_applicable.

Ativação operacional real exige aprovação explícita de categorias/recursos, expectativa de emissor, canais/fontes/bindings, expectedInterval, validade de posição, causas, métricas/unidades/faixas/conversões. Nenhum desses valores de produção foi aprovado por esta ratificação. PASS de fixture não libera ativação. Esse gate não impede ratificar o mecanismo genérico.

<a id="projecoes"></a>
## 9. Comunicação, posição, métricas e atividade — D09

Perfil habilitado declara canais/tipos/campos projetados, proprietário da comunicação, expectativa de emissor e expectedInterval positivo quando esperado, TTL de posição quando permitida, causas, métricas/unidades/conversões/faixas e versão/proveniência. Sem defaults ocultos ou inferência de sensores. Somente o canal designado renova comunicação; posição/métrica não renovam outras dimensões implicitamente.

- Not_applicable: ausência de emissor explicitamente declarada. Unknown: emissor esperado sem observação válida aplicável. Fresh: idade <=3*expectedInterval; stale: idade superior. Duplicado, inválido ou histórico não renova lastObservedAt.
- Equipamento sem emissor não gera ausência; regras de alerta unknown após registeredAt+3*expectedInterval pertencem a T0010, sem envelhecimento real indevido de demo pausado.
- Posição fresca prevalece; após TTL, fallback cadastral/base com positionKind e positionObservedAt explícitos; não tratar posição antiga como atual. Par válido completo, precisão não negativa; fixo não recebe posição dinâmica. Região operacional e cadastral não se confundem.
- Métrica somente com capacidade/unidade/faixa aprovadas; conversão após identidade, sem inventar limiar de falha. Fixture não confere capacidade física.
- Agent tem available/assigned/off_duty/unknown explicitamente observado; posição/heartbeat não inferem atividade. Conservar identidade e instante da atividade; não criar timeout para off_duty/unknown sem regra própria. Agent não recebe manutenção física.
- Comunicação ausente não implica malfunction/stolen. Telemetria não desbloqueia not_installed/disabled/stolen. Recuperação observada só pode tornar operational quando não restam causas bloqueantes/intervenção; conclusão de manutenção não garante disponibilidade.

<a id="snapshot"></a>
## 10. Corte consistente e integração R05/R06 — D12

| Campo | Semântica |
|---|---|
| revision | Revisão confirmada visível na transação de leitura |
| dataNow | Relógio de domínio amostrado para a resposta |
| dataAsOf | Corte da avaliação temporal; igual a dataNow no snapshot corrente |
| wallGeneratedAt | UTC real no início da construção; não promete instante do envio pela rede |

No operacional, os três campos temporais podem usar a mesma amostra UTC. No demo, dataNow/dataAsOf usam relógio lógico e wallGeneratedAt usa real. DataAsOf não implementa consulta histórica arbitrária: snapshot representa **estado confirmado na revisão R + avaliação temporal no corte T**.

Abrir transação e estabelecer snapshot SQLite; resolver contexto/revisão/configuração visíveis; amostrar relógio uma vez e conferir confiança; calcular comunicação, posição, filtros, recursos e indicadores no mesmo corte; construir resposta da mesma visão e encerrar sem escrita. Commit concorrente não entra parcialmente. Configurações que alteram projeção são versionadas e, ao serem vinculadas, refletidas na revisão contextual. Mesmos contexto/revisão/corte/filtros/versões de projeção produzem mesmo conteúdo de domínio; requestId e auditoria não são conteúdo de domínio.

Preservar R05: AND entre campos, OR entre valores do mesmo campo; mapa/lista/resumo/indicadores no mesmo conjunto e corte. Bbox usa posição resolvida; sem coordenadas fica fora somente quando filtro espacial exige ponto. Limite 500 e truncated não reduzem universo de indicadores/resumo. Preservar filtros existentes; não antecipar toda expansão de T0011.

R06: elegíveis são equipamentos não arquivados filtrados em operational/malfunction/maintenance; disponíveis são elegíveis operational com fresh/not_applicable; disponibilidade=100*disponíveis/elegíveis. Zero elegíveis retorna null e no_eligible_equipment. Excluir not_installed/disabled/stolen e informar suas contagens; Agent nunca entra no denominador. Unknown/stale não muda situação física. Não recalcular disponibilidade no cliente.

Frontend compara por datasetId+epoch+filtros normalizados+versões relevantes e identifica localmente a requisição. Descartar resposta de consulta anterior à troca de contexto/filtros; revisão menor é antiga. Corte menor que o já aceito **não substitui silenciosamente**, mesmo com revisão maior: sinalizar inconsistência e reconsultar. Mesma revisão/corte maior pode ser aceita por envelhecimento; mesma revisão/mesmo corte exige conteúdo de domínio equivalente, divergência é erro. Novo epoch autorizado invalida apresentação/cache antigos. Não usar apenas ordem lexicográfica (revision,dataAsOf): revisão maior não esconde retrocesso temporal. WallGeneratedAt é auditoria, não substitui dataAsOf; demo pausado pode ter novo horário real sem novo corte lógico.

Adaptação da lógica do componente existente deve constar do futuro escopo autorizado; não é autorização de interface nova. O snapshot atual baseado em max(effective_at) não é relógio operacional implementado; o contrato descreve sua evolução futura.

<a id="http-persistencia"></a>
## 11. HTTP, migration e compatibilidade previstos

Única rota nova de domínio prevista na fatia: `POST /api/v1/datasets/{datasetId}/epochs/{epoch}/telemetry`, com commandId/envelope parcial tipado. Resultado 200 **após commit**: eventId, disposition, resultingRevision e appliedAt quando aplicável; metadados seguros podem explicar motivos/efeitos. Preservar envelope de erro e limites técnicos: ingestão unitária, JSON estrito até 64 KiB, strings/notas conforme C02, números finitos/inteiros seguros, 20/s por fonte, 429 com retry informado e limite de eventos por geração sem truncamento silencioso. 400 estrutura, 401/403 acesso, 404 entidade inacessível/inexistente sem vazamento, 409 identidade/versão/contexto/estado, 422 semântica/janela, 503 indisponibilidade ou CLOCK_UNTRUSTED; erro interno sanitizado. Nenhum campo interno de processamento é aceito como comando do cliente. Eventos internos MaintenanceCompleted/StateChanged e coverage_interval não são aceitos pela rota externa.

Migration **0006**, exclusivamente futura T0007: fontes/bindings/perfis versionados, eventos Ke/Ks, cursores, episódios/evidências/resoluções, tempos/proveniência e metadados temporais mínimos; apenas evolução de Maintenance necessária ao núcleo aprovado. FKs contextuais, unicidades/checks e índices devem preservar os objetos existentes. Actor atualmente admite só operador, MaintenanceRequest só open/versão 1 e OperationalEvent só ações cadastrais: restrições precisam de evolução controlada, não bypass.

Schema atual continua 5. Futuro upgrade 5→6 exige backup SQLite consistente com conteúdo confirmado do WAL, validação, teste em banco vazio/schema 5 populado, repetição e rollback de DDL/DML. Migrador atual cobre backup 2/3/4, devendo contemplar 5 na implementação autorizada. Não copiar apenas arquivo principal com WAL ativo. Migrations anteriores/checksums permanecem intactos.

T0005: preservar manifesto, selos, membros, hashes, recibos e eventos de criação; evolução legítima do estado corrente não reescreve projeção histórica nem interpreta baseTime/recordedAt sintéticos como telemetria ou cobertura real. T0006: preservar regiões, filtros, fórmula R06 e fronteiras de snapshot; baseline cadastral not_installed não tem disponibilidade operacional inventada.

<a id="cenarios"></a>
## 12. Cenários temporais e de identidade obrigatórios

Todos **NOT_RUN** neste registro. C=12:00:10.000Z, causa elétrica, salvo indicação; eventos sujeitos às demais guardas/cursor. CAS vencido significa conflito seguro antes de nova intenção.

| Caso | Entrada/ordem | Resultado esperado |
|---|---|---|
| C03-S01 | Episódio começa 12:00:09; observação → conclusão | Coberto, não permanece falha dessa causa |
| C03-S02 | Conclusão → chegada de episódio iniciado 12:00:09 | Histórico coberto; sem reabertura/rejuvenescimento |
| C03-S03 | Início exatamente C, nas duas ordens | Conclusão inclusiva prevalece para essa causa |
| C03-S04 | Conclusão → novo episódio iniciado C+1 ms | Falha posterior elegível permanece |
| C03-S05 | Episódio posterior chega antes da conclusão antiga | Não apagado; CAS vencido dá 409, conclusão válida mantém pendência posterior |
| C03-S06 | Episódio antigo iniciado 12:00:09, mensagem às 12:00:12 | Continua coberto, não vira recorrência |
| C03-S07 | Mesmo episódio com início/causa/origem alterados | 409 e zero alteração |
| C03-S08 | Outro ID com mesma causa/início já registrado | 409 por alias, inclusive concorrente |
| C03-S09 | Novo início 12:00:11, ocorrência antiga 12:00:09 | 422; ocorrência anterior ao início |
| C03-S10 | Novo ID, início/ocorrência 12:00:11 | Nova afirmação elegível, não prova física; sujeita às guardas |
| C03-S11 | Concluir elétrica com mecânica aberta | Mecânica permanece; não tornar operational indevidamente |
| C03-S12 | fault_cleared conhecido / desconhecido | Atualizar evidência sem concluir Maintenance / 422 sem fabricar episódio |
| C03-S13 | Sequência maior com tempo menor / inferior inédita | Histórico; máximo visto avança quando maior, projeção não retrocede |
| C03-S14 | Agora 12:00:00, ocorrência +20 s / +30.000 ms / +30.001 ms | Dois primeiros tolerados/ajustados sem avançar relógio; último 422 |
| C03-S15 | Duas conexões, mesma Kc equivalente / divergente | Uma confirmação e replay / 409 para divergente |
| C03-S16 | Duas Kc para mesma intervenção | Uma conclusão; outro conflito de estado/versão/unicidade |
| C03-S17 | Recurso stolen recebe heartbeat e conclusão | Stolen preservado; comunicação independente |
| C03-S18 | Demo pausado, tempo real avança | Telemetria não envelhece; credencial pode expirar |
| C03-S19 | Fixture intervalo 10.000 ms, idade 30.000 / 30.001 ms | Fresh / stale |
| C03-S20 | Posição FX-MOBILE idade 30.000 / 30.001 ms | Fresca / fallback; posição FX-FIXED recusada |
| C03-S21 | Scalar 0/1, externo a [0,1], unidade/tipo errados | Limites aceitos; demais recusados, sem capacidade física implícita |
| C03-S22 | Perfil fixture em bootstrap operacional / initial_* como falha | Recusa; não herdar capacidade de cadastro |
| C03-S23 | Fonte revogada, outro canal/recurso/dataset, epoch antigo | Acesso/contexto recusados antes de recibo; sem vazamento |
| C03-S24 | Reinício UTC>=marco / UTC<marco; regressão em processo | Retomar UTC / CLOCK_UNTRUSTED, sem correção silenciosa |
| C03-S25 | GET observa acima do marco; reinício com UTC intermediário | Limite durável explícito; cliente recusa retrocesso conhecido |
| C03-S26 | Mesma revisão, corte avança durante silêncio | Frescor/R06 podem mudar sem escrita; dataNow=dataAsOf |
| C03-S27 | Posição expira enquanto resposta é construída | Mapa/lista/indicadores usam uma decisão temporal do corte único |
| C03-S28 | Resposta antiga após mudar bbox; revisão maior com corte menor | Descartar consulta antiga; sinalizar inconsistência temporal, não substituir |
| C03-S29 | Escrita concorrente ao snapshot | Uma revisão inteira, nunca combinação parcial |
| C03-S30 | Mesmo corte demo pausado, novos GETs | Conteúdo de domínio estável, wallGeneratedAt pode avançar |

<a id="testes"></a>
## 13. Critérios de verificação e aceitação por estágio

| Grupo | Provas obrigatórias futuras |
|---|---|
| C03 temporal | S01–S18; ambas ordens, igualdade e 1 ms; causa/corte/episódio não retrocedem; histórico não reabre; falha posterior elegível preservada |
| Propriedades | Variar IDs/tempos/seq isoladamente; causa não cruza contexto; aliases concorrentes; permutações com domínio de comparação explícito, sem exigir mesmos recibos/revisões/IDs |
| C02/V05-I | Kc/Ke/Ks, offsets/normalização, campos imutáveis divergentes, metadados excluídos, unidade original, clamp, novo comando para Ke, replay após estado/tempo/reabertura e resposta perdida |
| Persistência real | Conexões/processos com barreiras; falhas entre evento, cursor, episódio, projeção, revisão, marco e recibo; rollback integral; integridade/FKs |
| Segurança/perfis | S21–S23; credencial própria/bindings/revogação/isolamento; limites; payload interno; fixture não acessível em produção; Agent sem manutenção física |
| Relógios/projeções | S19–S20/S24–S27; silêncio/reinício/regressão, TTL/intervalo exatos, segurança real com demo pausado, histórico sem rejuvenescimento |
| Snapshot/cliente | S26–S30; filtros R05, same-cut, 500/501, sem ponto, fronteiras regionais, denominador zero, 1/3 disponível, obsolescência e regressão temporal |
| Migration/regressão | Banco vazio/schema 5 populado, backup válido, repetição/rollback, FKs/triggers/recibos preservados; T0005 manifesto/hashes e T0006 R05/R06; manter asserções dos 184 testes existentes |

Registrar resultados reais PASS/FAIL/NOT_RUN, contexto, corte/revisão, identidades e modalidade. Não comprovar corrida com duas chamadas sequenciais nem atomicidade apenas com mocks. Homologação isolada usa observação, repetição, atraso e consulta, distinguindo teste automatizado de observação humana. Métricas integradas de Central/J02 permanecem no estágio correspondente, não PASS por ratificação documental.

<a id="fronteiras"></a>
## 14. Fronteiras, dependências e condições preservadas

- T0007 depende de T0002/C02, inventário T0004 e deste contrato ratificado; T0006 é superfície de compatibilidade entregue. **T0007 PLANNED / NOT_STARTED / NOT_AUTHORIZED** até autorização individual inequívoca posterior.
- T0007 implementará ingestão, fontes/bindings, cursores, núcleo causal e projeções; prova da resolução por fixture/adaptador interno de teste. Sem endpoint artificial de sucesso, nova interface, broker, SSE/WebSocket ou antecipação de intervenção pública. Adaptação lógica do frontend existente exige constar do escopo autorizado.
- T0008 consome identidades/tempos e introduz histórico/coverage_interval interno; T0009 introduz run, relógio lógico, fencing, scheduler, pausa/reset. Não implementar essas funções para provar T0007.
- T0010 introduz alertas completos; T0011 integra Central/polling e metas J02. T0012 implementa histórico/jornada e comandos públicos de conclusão, com integração C03/V06. Não antecipar nem marcar esses gates como aprovados.
- V05/V06 **NOT YET ACCEPTED**; ratificação não é homologação T0007. Testes novos **NOT_RUN**. C04/C05 e limites C01/C02/ADRs mantidos.
- Fontes operacionais reais exigem aprovação própria de perfis/canais/intervalos/métricas/bindings. Os quatro FX são exclusivamente fixtures/homologação isolada. Autenticação não comprova verdade física; conclusão não garante disponibilidade; regressão conhecida falha fechada; GET sem escrita não garante monotonicidade durável entre reinícios.
- Divergências históricas não relacionadas a C03 permanecem registradas em [KNOWN_ISSUES](KNOWN_ISSUES.md#limites-c03), sem reescrever relatórios/aceites ou inventar resultados.
