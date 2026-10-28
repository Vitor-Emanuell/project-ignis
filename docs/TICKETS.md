# Backlog — arquitetura aprovada condicionalmente

<a id="ratificacao-c03"></a>
## C03 — ratificação humana integral, 26/10/2026

Fonte humana: **“PROJECT IGNIS — Registro formal da ratificação C03”**. **C03 HUMAN_RATIFIED; D01–D12 RATIFIED**, incluindo refinamentos finais de identidade/episódios, quatro perfis exclusivamente de fixture, relógios e snapshots. Fonte normativa: [contrato C03](C03_TELEMETRY_CONTRACT.md#ratificacao-c03). Autorização exclusivamente documental, verificação e um commit local; **não autoriza implementar T0007**.

Estado vigente: T0001–T0006 **DONE / HUMAN_ACCEPTED**; T0006/J01 **PASS / HUMAN_ACCEPTED**; T0007 **PLANNED / NOT_STARTED / NOT_AUTHORIZED**; schema **5**; migration **0006 RESERVED / NOT_CREATED**, exclusiva de T0007. V05/V06 **NOT YET ACCEPTED**, casos C03 NOT_RUN. Ativação operacional exige aprovação explícita de perfis/canais/intervalos/métricas/bindings; FX-NONE-v1, FX-FIXED-v1, FX-MOBILE-v1 e FX-AGENT-v1 somente fixtures/homologação isolada.

Este registro posterior supera apenas as menções históricas a C03 contratualmente pendente, preservadas abaixo com suas datas, inclusive a tabela de condições de 23/10. Não encerra provas técnicas C02/C03, C04/C05 ou ADRs condicionais. [Critérios futuros](VERIFICATION_GUIDE.md#verificacao-c03), [estado real](REPO_CURRENT_STATE.md#registro-c03) e [ressalvas](KNOWN_ISSUES.md#limites-c03).

<a id="aceite-humano-t0006"></a>
## Encerramento humano de T0006 e Gate J01 — 26/10/2026

Fonte humana inequívoca nesta conversa: **“PROJECT IGNIS — Aceite humano e checkpoint T0006”**, após autorização individual de implementação (`PROJECT IGNIS — Autorização de implementação T0006`), revisão técnica e homologação funcional humana com **7/7 cenários aprovados funcionalmente**. **T0006: DONE / HUMAN_ACCEPTED; Gate J01: PASS / HUMAN_ACCEPTED.** [Relatório técnico e homologação](T0006_REPORT.md#aceite-humano-t0006); [estado real](REPO_CURRENT_STATE.md#aceite-humano-t0006).

Evidências verificadas na worktree isolada `t0006` (base `edc1629e17c6ebbe8d9e63c5efa2957d38c27e36`): migration `0005-regions-and-spatial.sql` (schema `4` → `5`) com 5 regiões GeoJSON municipais e backfill determinístico point-in-polygon; migration `0006` preservada e reservada para T0007; `npm run typecheck` PASS, `npm run build` PASS, `npm run test:t0006` PASS (`9/9` testes em 3 arquivos) e `npm test` PASS (`184/184` testes em 20 arquivos, preservando os 175 anteriores). Observação não bloqueante de UX no Cenário 1: o código HTTP `201` não é exibido diretamente na interface gráfica, que apresenta a confirmação textual, geração 1, revisão 1 e contagens `20/6/15`.

**Estado vigente: T0001–T0006 DONE / HUMAN_ACCEPTED (Gate J01 concluído); T0007–T0020 NOT_AUTHORIZED.** C01–C05 (incluindo C03 pendente antes de T0007) e ADRs condicionais permanecem conforme suas fontes. Os registros abaixo preservam o histórico das etapas anteriores.

<a id="aceite-humano-t0005"></a>
## Encerramento humano de T0005 — 26/10/2026

Fonte humana inequívoca nesta conversa: **“PROJECT IGNIS — Aceite humano final da T0005”**, com a declaração “concedo meu ACEITE HUMANO FINAL à homologação funcional da T0005”, após análise das evidências B2.1, B2.2 e B2.3. **T0005: DONE / HUMAN_ACCEPTED; homologação funcional aceita.** Os oito cenários receberam PASS, incluindo o cenário 7 com recuperação supervisionada após interrupção elétrica. [Parecer final e rastreabilidade](T0005_REPORT.md#aceite-humano-t0005); [estado real](REPO_CURRENT_STATE.md#aceite-humano-t0005).

O registro distingue os resultados funcionais supervisionados dos testes automatizados históricos de 25/10 (175/17, 16/2 direcionados, typecheck/build PASS), sem alegar reexecução destes ou de todos os casos GF-T5/V02 nesta rodada. Nenhum teste de aplicação, banco, migration, build ou serviço foi operado neste aceite exclusivamente documental. C01–C05, J01, V02 espacial, demais gates e ressalvas técnicas permanecem conforme suas fontes.

**Estado vigente: T0001–T0005 DONE / HUMAN_ACCEPTED; T0006–T0020 NOT_AUTHORIZED.** A autorização atual limita-se ao registro documental; não autoriza código, novas funcionalidades, alterações de banco, encerramento dos serviços, commit ou execução de outro ticket. Os registros de prontidão e de ausência de autorização abaixo descrevem suas respectivas etapas históricas.

<a id="implementacao-t0005"></a>
## Histórico — T0005: autorização e entrega técnica, 25/10/2026

Instrução humana expressa “IGNIS — T0005 | AUTORIZAÇÃO HUMANA DE IMPLEMENTAÇÃO”, posterior à ratificação documental, autoriza exclusivamente T0005 conforme T5-D01–D16/A01–A05/JF-T5/GF-T5/V02-T5. Baseline **main/ab4afd6fbeb0a0ee27124b5a6c8dc9c18d0348c8**, árvore/índice inicialmente limpos. Autorização: **IMPLEMENTATION_AUTHORIZED**; durante execução: **IN_PROGRESS**. Entrega técnica: **T0005_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION**, sem DONE/HUMAN_ACCEPTED e sem encerramento humano do gate. T0001–T0004 preservados; T0006–T0020 NOT_AUTHORIZED. Sem commit, staging, push, merge ou mudança de branch. Registros anteriores NOT_AUTHORIZED descrevem os estágios anteriores.

Evidência executada em Windows: typecheck/build PASS; suíte completa **175 testes/17 arquivos**, incluindo os117 anteriores e58 de T0005 em sete arquivos; `test:t0005` 42/5 PASS na rodada inicial. [Relatório A–N](T0005_REPORT.md) e [matriz de 26 PASS técnicos](T0005_REPORT.md#i-matriz-v02-t5), com três casos manuais observados por interação assistida, sem atribuir homologação ao responsável humano. A01–A05 demonstradas no alcance relatado, máximo 200/30 medido sem redução. T5-D01–D16 HUMAN_RATIFIED e GF-T5-01–12 HUMAN_APPROVED permanecem estados de contrato; verificação humana da implementação pendente. C01–C05/J01/ADRs e ressalvas anteriores preservados.

Atualização corretiva autorizada pelos prompts “Correção dos achados P2 e verificação direcionada” e “Retomada segura após interrupção por limite de uso”: os175 atuais incluem **58 de T0005/7 arquivos**, sendo42 da entrega inicial e16 corretivos novos; o comando test:t0005 42/5 acima registra a rodada inicial. [Fechamento P2 e intenção incerta/epoch](T0005_REPORT.md#p2-corrections), 16/2 direcionados PASS, typecheck/build e regressões atuais PASS. Parecer corretivo T0005_P2_CORRECTIONS_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION; estado do ticket e aprovação contratual preservados, sem HUMAN_ACCEPTED ou autorização dos posteriores.

<a id="contratos-t0005"></a>
## Histórico — ratificação contratual e funcional T0005, anterior à implementação

Fonte humana: instrução **“IGNIS — T0005 | Formalização documental dos contratos ratificados”**, recebida em 25/10/2026, America/Sao_Paulo. Aprova expressamente as recomendações do segundo parecer preparatório **T5-D01–D16**, os ajustes normativos obrigatórios **A01–A05** e o gate **GF-T5-01–12**, autorizando somente formalização documental nos sete arquivos indicados. Baseline main/c8dd5fc8d15647501af484b8789fe003992b7d94, árvore inicialmente limpa. Análises/pareceres anteriores não eram autorização de implementação.

| Registro | Estado na formalização documental / fonte responsável |
|---|---|
| T5-D01–D16 e A01–A05 | HUMAN_RATIFIED conforme [matriz e contratos](MVP_TECHNICAL_DESIGN.md#t0005-contrato); A01–A05 são condições normativas integrantes |
| JF-T5-01–03 / GF-T5-01–12 | Jornadas ratificadas / HUMAN_APPROVED no [design funcional](SYSTEM_DESIGN_FUNCTIONAL.md#t0005-funcional) |
| V02-T5-01–26 | Todos NOT_RUN na [matriz futura](VERIFICATION_GUIDE.md#v02-t5); nenhum teste executado pelo aceite documental |
| T0005 | **PLANNED / NOT_AUTHORIZED**, contratos ratificados; implementação NOT_AUTHORIZED |
| T0001–T0004 / T0006–T0020 | DONE / HUMAN_ACCEPTED / sem autorização de implementação |
| C01–C05 / J01 / ADRs | Gates/limitações preservados, J01 pendente; Accepted — Conditional |

F05 fica limitado a baseline inicial em demo ativo ready vazio, manifesto/proveniência, serviços de domínio e acionamento mínimo ratificado. A especialização de preparing, grupos de eventos completos, hashes e condições do máximo constam somente na fonte técnica vinculada; não copiar regras no backlog. Sem código, migration, teste executável, dependência, banco, build, staging ou commit nesta formalização. Encerrar aqui; implementação exige autorização humana individual posterior inequívoca. Estado real: [registro documental](REPO_CURRENT_STATE.md#contratos-t0005).

<a id="aceite-humano-t0004"></a>
## Encerramento humano de T0004 — 24/10/2026

Evidência humana inequívoca recebida nesta conversa: **T0004_HUMAN_ACCEPTED**, após o relatório de implementação e a homologação complementar V01-T4-19. **T0004: DONE / HUMAN_ACCEPTED.** As evidências técnicas anteriores permanecem no [relatório](T0004_REPORT.md), incluindo os 24 casos V01-T4 PASS; este registro não acrescenta testes ou validações independentes não declarados pelo responsável. [Estado real do aceite](REPO_CURRENT_STATE.md#aceite-humano-t0004).

O aceite encerra somente T0004. T0005–T0020 continuam PLANNED / NOT_AUTHORIZED; C01–C05, J01 e condições dos ADRs preservados. Formalização exclusivamente documental, sem código/configuração/dependências/contratos/ADRs, novos testes, staging ou commit. Os registros de prontidão abaixo descrevem a entrega técnica anterior a este aceite.

<a id="implementacao-t0004"></a>
## Histórico — autorização e entrega técnica de T0004 — 24/10/2026

Evidência humana expressa: `T0004_IMPLEMENTATION_HUMAN_AUTHORIZED`, recebida após o aceite contratual/funcional versionado em main, HEAD `820dad33b404627d94265652078d2558a654f9c6`, árvore limpa. Autoriza exclusivamente a implementação integral controlada de T0004 conforme prompt e contratos ratificados; estado de entrega: READY_FOR_HUMAN_REVIEW, implementação HUMAN_AUTHORIZED e sem aceite humano do ticket. Registros anteriores de T0004 NOT_AUTHORIZED são históricos. T0001–T0003 permanecem DONE / HUMAN_ACCEPTED; T0005–T0020 continuam PLANNED / NOT_AUTHORIZED. Sem commit, staging, alteração de ADRs, design visual ou aceite humano do ticket. Retomada controlada preservou a implementação; [relatório T0004](T0004_REPORT.md) consolida 117 testes/10 arquivos, 48 novos/2 e regressões T0003 17/2, verificações manuais e homologação complementar V01-T4-19: três subcasos residuais agora PASS, conforme evidências de interface/servidor no relatório. Resultados automatizados anteriores preservados, não reexecutados nessa homologação.

**T0001: `DONE / HUMAN_ACCEPTED`, encerrado em 23/10/2026. T0002: `DONE / HUMAN_ACCEPTED`, encerrado em 24/10/2026. T0003: `DONE / HUMAN_ACCEPTED`, encerrado em 24/10/2026. T0004: `DONE / HUMAN_ACCEPTED`, encerrado em 24/10/2026; T0005–T0020: `PLANNED / NOT_AUTHORIZED`.** Aprovar este arquivo não libera execução. Gate: [arquitetura](SYSTEM_ARCHITECTURE.md#aprovacao) e [AGENTS](../AGENTS.md).

Este arquivo define entregas e seus limites; requisitos, contratos e testes detalhados ficam nas fontes vinculadas. Não copia payloads nem fórmulas. Áreas futuras só existem quando registradas no [estado real](REPO_CURRENT_STATE.md).

<a id="aceite-contratual-t0004"></a>
## Histórico — aceite contratual e funcional T0004, anterior à implementação

Decisão expressa do responsável pelo Sistema IGNIS na instrução “IGNIS — T0004 | Formalização do aceite contratual R-T4-01–07 e do gate funcional complementar”: [R-T4-01–07 HUMAN_RATIFIED](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao) e [GF-T4-01–12 HUMAN_APPROVED](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0004), exatamente conforme as matrizes preparadas. Diretrizes T4-D05–T4-D08 aprovadas e detalhadas; sem renumeração dos D05–D07 históricos, valores novos ou reinterpretação de regras.

Ratificações expressas preservadas: operational inicial de novo fixo exige declaração explícita do operador e todas as precondições documentadas, sem inferência por endereço/coordenadas/instalação/base; occupantCapacity inclui condutor, com limites fictícios demonstrativos sem validade regulatória presumida. Catálogo, manutenção por categoria, Agent/JF-06, localização, estados e compatibilidade permanecem conforme suas fontes.

**T0004 PLANNED / NOT_AUTHORIZED.** T0001–T0003 DONE / HUMAN_ACCEPTED; T0005–T0020 PLANNED / NOT_AUTHORIZED. Os [24 V01-T4](VERIFICATION_GUIDE.md#v01-t4) permanecem NOT RUN, J01 pendente e ADRs Accepted — Conditional. GF01–GF08 de T0003/T03-C e C01–C05 preservados; aceite documental não comprova migração, hashes, constraints, rollback ou regressão.

Baseline desta formalização: main/236d2e27d17fbf27bc1368071b100b754b5f3dcd, seis documentos já modificados pela preparação, index sem alterações. Trabalho anterior preservado; somente estados/evidência de aceite e rastreabilidade atualizados. Sem código, migration, configuração, dependência, banco, teste de aplicação, build, visual, staging ou commit. Conferência documental, eventual commit de aprovação e futura implementação exigem suas autorizações correspondentes; nenhum desses atos está autorizado aqui.

**T0004_CONTRACT_AND_FUNCTIONAL_GATE_HUMAN_APPROVED.** Registro de [estado real](REPO_CURRENT_STATE.md#aceite-contratual-t0004). A preparação abaixo é histórica, anterior a este aceite; não redefine seu estado vigente.


<a id="preparacao-t0004"></a>
## Histórico — preparação documental T0004, anterior ao aceite contratual

Evidência humana: “IGNIS — T0004 | Fechamento Contratual D05–D08 e Gate Funcional Complementar”. Autoriza somente inspeção, detalhamento documental, complemento funcional, verificações futuras e rastreabilidade nos seis documentos indicados; não código, SQL executável, testes de aplicação, build ou commit. Baseline main, HEAD 236d2e27d17fbf27bc1368071b100b754b5f3dcd, árvore limpa.

Diretrizes aprovadas para detalhamento: T4-D05 cobertura mínima dos 14 perfis preservando radar v1; T4-D06 princípios T03-C respeitando capacidades; T4-D07 identidade própria Agent e proposta unknown; T4-D08 cadastro/instalação/base/observação separados. Prefixo T4 distingue essas diretrizes dos D05–D07 históricos do design funcional; nenhuma pendência histórica foi renumerada ou aprovada implicitamente.

Detalhes de schemas/mobilidades, capacidades/causas/agenda por perfil, Agent/DTOs, estados iniciais, localização institucional e evolução de persistência estão na [seção 12 técnica](MVP_TECHNICAL_DESIGN.md#t0004-contrato), com [R-T4-01–07 pendentes de ratificação humana](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao). Complemento de JF-02–JF-06 e [GF-T4-01–12](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0004): PENDING_HUMAN_APPROVAL. [24 V01-T4](VERIFICATION_GUIDE.md#v01-t4): todos NOT RUN. Ratificar contrato/aprovar gate não equivale a autorizar implementação.

**T0004 permanece PLANNED / NOT_AUTHORIZED.** T0001–T0003 DONE / HUMAN_ACCEPTED; GF01–GF08 HUMAN_APPROVED só T0003 e T03-C ratificada, sem alteração. J01 continua pendente, dependente do inventário completo e T0006/V01–V03. T0005–T0020 seguem seus gates e sem autorização; não criados tickets adicionais. C01 mantém limites da evidência Windows, C02 sem fechamento integral das oito integrações, C03/C04/C05 nos tickets correspondentes. ADRs Accepted — Conditional preservados.

Parecer desta preparação: **T0004_CONTRACT_READY_FOR_HUMAN_RATIFICATION**; próxima etapa é revisão/ratificação humana dos detalhes e gate complementar, antes de qualquer futura autorização individual. Risco de reconstrução de schema 2 e compatibilidade de recibos exige provas futuras, não enfraquecimento de integridade.


<a id="autorizacao-t0003"></a>
## Autorização individual e entrega de T0003 — 24/10/2026

Evidência humana posterior ao gate: “IGNIS — T0003 | Implementação da Primeira Jornada do Inventário Inteligente”, autorizando exclusivamente implementação, integração, testes e documentação de T0003. Baseline limpa em main, HEAD `443c0665db0d7293254869f78a53727c4902fe3b`, com o aceite funcional versionado pelo responsável. Não se inferiu autorização de tickets posteriores.

**T0003: DONE / HUMAN_ACCEPTED**, aceito pelo responsável em 24/10/2026 na instrução “IGNIS — T0003 | Formalização do aceite humano”, conforme [registro do aceite](REPO_CURRENT_STATE.md#aceite-humano-t0003). Primeira fatia implementada e verificada; [relatório A–J](T0003_REPORT.md) e [estado real](REPO_CURRENT_STATE.md#implementacao-t0003). Os 16 V01-T3 foram executados, sem alterar seus critérios; suíte completa 69/8, preservando 52 anteriores. T0004–T0020 continuam PLANNED / NOT_AUTHORIZED; J01 permanece pendente. Sem commit nesta execução. Registros anteriores de “T0003 não autorizado” descrevem a etapa documental anterior a esta instrução.

<a id="condicoes-do-aceite"></a>
## Condições da aprovação — 23/10/2026

Fonte do aceite e semântica: [ADRs](adr/README.md). A aprovação da arquitetura não autoriza execução. **Autorizações individuais recebidas: T0001 e T0002**, este último pela instrução humana “IGNIS — T0002 | Implementação da Fundação de Persistência e Integridade”, executada em 23–24/10/2026. T0002 foi formalmente aceito pelo responsável em 24/10/2026 na instrução “IGNIS — Encerramento formal de T0002”, após relatório e validação independente Windows. Este encerramento autoriza somente documentação; nenhuma autorização para T0003–T0020, System Design ou escrita Git. Mantidos T0001–T0020 e F01–F09. Distribuição local em T0020 é mínima obrigatória; hospedagem pública é adicional sujeita à viabilidade e autorização própria.

Em 23/10/2026, a preparação anterior de C02 autorizou somente documentação, versionada antes da implementação em `a07e25b`. [Contrato preparado](MVP_TECHNICAL_DESIGN.md#idempotencia), [casos esperados](VERIFICATION_GUIDE.md#v00-idempotencia) e [histórico da preparação](REPO_CURRENT_STATE.md#preparacao-contratual-t0002) preservados. A implementação e suas evidências estão no [relatório](T0002_REPORT.md); o [aceite humano posterior](REPO_CURRENT_STATE.md#aceite-humano-t0002) encerra somente T0002. T0001 continua aceito e versionado em `8d16cb1`.

| Condição / tipo | Gate, estado e responsabilidade por estágio | Evidência necessária |
|---|---|---|
| C01 — verificação técnica | T0001/T0002 aceitos; evidências técnicas reproduzidas no Windows pelo responsável | [Aceite T0002](REPO_CURRENT_STATE.md#aceite-humano-t0002): SQLite 3.53.4, WAL/FKs/FULL/timeout e suítes PASS. Instalação limpa do driver em ambiente inteiramente novo não reproduzida na validação humana; outros ambientes/V11 final NOT RUN; ADR preservado |
| C02 — correção contratual | Contrato preparado/versionado; fundação T0002 implementada e verificada; integração de eventos permanece T0007 | [Contrato normativo](MVP_TECHNICAL_DESIGN.md#idempotencia) preservado; 21 V00-I PASS no [relatório](T0002_REPORT.md); oito V05-I NOT RUN, condição integral não encerrada |
| C03 — correção contratual | Antes de autorizar/iniciar T0007: revisão documental específica de precedência; T0007 aplica pipeline e T0012 integra conclusão manual | Contrato temporal revisado e V05/V06, incluindo falha posterior legítima |
| C04 — correção contratual | Antes de autorizar/iniciar T0015: revisão documental específica de liberação de reservas; T0015 implementa | Guardas revisadas e V09 com estados terminais/administrativos e concorrência |
| C05 — limitação / verificação técnica | T0013/T0014 preservam e verificam P01/P02 | V07/V08 e relatório real, sem alegar validade estatística/externa |

As revisões contratuais anteriores a T0002/T0007/T0015 exigem escopo documental humano específico; não são tickets novos. C02 recebeu preparação e implementação especificamente autorizadas; C03/C04 continuam pendentes. Evidências técnicas não equivalem a aceite humano. Registro: [KNOWN_ISSUES](KNOWN_ISSUES.md#condicoes-do-aceite). System Design funcional mínimo preparado e aprovado é gate antes de T0003, sem bloquear T0001/T0002. A autorização documental posterior de System Design está registrada abaixo; não autoriza implementação.

<a id="design-funcional-inventario"></a>
## Histórico — aceite humano do System Design funcional da fatia T0003, 24/10/2026

Evidência: instrução do responsável “IGNIS — Formalização do aceite do System Design Funcional v1.1 — Ratificação T03-C e aprovação humana do gate GF01–GF08”, em **24/10/2026, horário de Brasília**. Autorização exclusivamente para registro documental. **GF01–GF08: HUMAN_APPROVED** para a primeira categoria fixed_speed_radar v1, D01–D04 e JF-01–JF-05 somente na parcela aplicável; contratos existentes de segurança, sessão, contexto e concorrência preservados. [Registro e matriz do aceite](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional).

**T03-C: RATIFICADA PELO RESPONSÁVEL**, exatamente como preparada: not_installed; agenda opcional e nenhuma solicitação automática; pedido inicial apenas explícito; projeção no domínio Maintenance e escritas conjuntas atômicas; ausente/desconhecido/não aplicável distintos, sem atalhos em Equipment ou intervenções T0012. [Contratos T03-A/B/C](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo) preservados. A faixa 1–200 km/h continua fictícia de demonstração, sem validade regulamentar.

Os textos de proposta na definição de T0003 e nas fontes técnica/guia descrevem a preparação anterior; o aceite posterior está registrado nesta seção, sem redefinir seus detalhes normativos. As 20 definições de tickets, dependências, critérios e estados foram preservados neste registro. JF-06, ampliações de T0004/posteriores e J01 continuam nos próprios gates; o aceite não declara J01 concluído.

**Parecer: T0003_FUNCTIONAL_GATE_HUMAN_APPROVED. T0003: PLANNED / NOT_AUTHORIZED.** T0001/T0002 continuam DONE / HUMAN_ACCEPTED; T0004–T0020 continuam PLANNED / NOT_AUTHORIZED. Os [16 V01-T3](VERIFICATION_GUIDE.md#v01-t3-radar) continuam NOT RUN. Preparo operational, migrations, APIs, formulários, configuração/proxy e testes permanecem futuros e exigem autorização individual posterior de T0003. Design visual não iniciado. Nenhum código, instalação, build, teste de aplicação, staging ou commit neste registro.

## Regras comuns aos tickets

Revisão v1.1: IDs T0001–T0020 preservados, sem subdivisão. Todos foram auditados; mudanças materiais em T0002, T0004, T0006–T0010, T0014, T0015, T0017/T0018 e planejamento final. Os demais mantêm escopo, com gates de design e testes por estágio esclarecidos. Campos **Testes** correspondem à verificação automatizada, não a testes já executados.

Cada ticket herda estas restrições: executar somente após autorização específica e dependências verificadas; proibir código fora das áreas permitidas, refatorações não relacionadas, features futuras, dependências não justificadas, merge/push/deploy e mudanças arquiteturais não aprovadas. Documentação diretamente afetada pode ser atualizada na sua fonte responsável. Gates que falharem bloqueiam os dependentes; não marcar conclusão por inspeção visual isolada.

Tickets com interface exigem somente o gate funcional da respectiva jornada; acabamento visual tem gate separado. A matriz normativa está em [gates de System Design](SYSTEM_ARCHITECTURE.md#gates-design). Nenhum dos níveis é executado nesta revisão; não inferir branding a partir dos contratos.

P0 = caminho para as três partes funcionarem de ponta a ponta; P1 = demais features selecionadas e conclusão da demonstração, também obrigatórias para o escopo completo. P1 não significa dispensável. Cada ticket tem verificação manual curta e focal, idealmente 5–10 minutos quando simples; isso não estima tempo de desenvolvimento.

## Marco A — Fundação

### T0001 — Fundação executável e diagnóstico mínimo

- **Objetivo / prioridade:** validar stack em processo mínimo de backend e entrega estática técnica; P0. **Dependências:** autorização humana individual e ADR-0001 Accepted — Conditional; C01 será verificada neste ticket e em T0002.
- **Áreas permitidas:** manifests/lockfile futuros, `apps/server/` bootstrap/health, `apps/web/` entrada técnica mínima, configuração de build/testes e documentação de execução. **Proibidas adicionais:** domínio, banco preenchido, mapa, jogos e escolhas visuais.
- **Requisitos:** organização proposta na arquitetura; versões compatíveis fixadas; health/live e teste HTTP. Não inicializar Git sem autorização correspondente.
- **Não objetivos:** CRUD, autenticação completa, frameworks adicionais e deploy.
- **Aceitação:** execução técnica e build reproduzíveis a partir de ambiente limpo; resposta live e arquivos estáticos acessíveis; erro de configuração legível; comandos reais documentados, sem segredos.
- **Testes:** contrato de saúde e smoke de inicialização; registrar Windows/Node/versões. **Manual:** iniciar/parar e abrir resposta no navegador (V00).
- **Entregáveis:** fundação mínima, lockfile autorizado, teste smoke e instruções verificadas. **Estado:** DONE / HUMAN_ACCEPTED — encerrado em 23/10/2026 pelo responsável pelo projeto, na instrução humana “IGNIS — Encerramento formal do T0001”, após revisão do relatório e validação independente no Windows. [Registro do aceite e evidências humanas](REPO_CURRENT_STATE.md#aceite-humano-t0001); [relatório de implementação preservado](T0001_REPORT.md). O gate V00 está verificado somente no subconjunto T0001; persistência e demais condições continuam pendentes. O aceite não autoriza T0002 nem qualquer dependente.

### T0002 — Persistência, contexto e fronteira de escrita

- **Objetivo / prioridade:** fundar isolamento e integridade antes de dados operacionais; P0. **Dependências:** T0001 DONE / HUMAN_ACCEPTED e versionado; ADR-0002 Accepted — Conditional; C02 detalhada e revisada na preparação versionada em `a07e25b`; autorização humana específica recebida para a implementação de T0002. C01 com evidências técnicas reproduzidas no Windows e aceite humano de T0002, respeitadas as limitações registradas.
- **Áreas permitidas:** `apps/server/` infraestrutura SQLite/contexto/sessão, migrations iniciais correspondentes, `packages/contracts/`, testes de integração. **Proibidas adicionais:** funcionalidades de inventário, UI e cenário.
- **Requisitos:** [I01–I04 e contratos](MVP_TECHNICAL_DESIGN.md#contratos), [C02: chave, hash e atomicidade](MVP_TECHNICAL_DESIGN.md#idempotencia), Dataset/Epoch/recibos mínimos, conforme [fundação incremental](SYSTEM_ARCHITECTURE.md#fundacao-minima), e [segurança](SYSTEM_ARCHITECTURE.md#seguranca-e-limites-de-confianca); readiness; verificação de FKs e WAL. Demonstrar recibos por ação técnica exclusiva da suíte, sem API/CRUD de feature futura.
- **Não objetivos:** conta corporativa, banco externo ou migrations de features ainda não executadas.
- **Aceitação:** SQLite abre/reabre em caminho configurado; esquema versionado; contexto e capability do operador local obrigatórios; FK entre datasets falha; idempotência/conflict e rollback comprovados; exposição pública permanece somente leitura, sem provisionamento de visitantes.
- **Testes:** banco vazio, reabertura, falha transacional e capability/CSRF/contexto; [V00-I](VERIFICATION_GUIDE.md#v00-idempotencia) inclui canonicalização, replay, concorrência em conexões reais, rollback e recibo após reinício. Integração de evento/cursor/seq permanece [V05-I](VERIFICATION_GUIDE.md#v05-idempotencia) em T0007, reset real em T0009 e reservas em T0015 após C04. V11 completo somente em T0020. **Manual:** escrita autorizada e não autorizada; reinício preserva registro técnico.
- **Entregáveis:** infraestrutura persistente, esquema base e evidências de compatibilidade do driver. **Estado:** DONE / HUMAN_ACCEPTED — encerrado em 24/10/2026 pelo responsável, na instrução “IGNIS — Encerramento formal de T0002”, considerando o [relatório A–I](T0002_REPORT.md) e a [validação independente Windows](REPO_CURRENT_STATE.md#aceite-humano-t0002). C02: 21 V00-I aprovados; oito grupos futuros pendentes. Instalação limpa do driver em ambiente inteiramente novo não reproduzida nessa validação. Nenhum teste adicional ou commit neste registro; T0003 e todos os posteriores continuam sem autorização.

## Marco B — Inventário e primeira jornada

### T0003 — Equipamento mínimo com cadastro e consulta persistentes

- **Objetivo / prioridade:** primeira fatia web → domínio → banco → consulta; P0. **Dependências:** T0002 e System Design funcional mínimo preparado/aprovado antes de T0003.
- **Áreas permitidas:** Inventory/Operations inicial, suas migrations, contratos de equipamento, UI de cadastro/lista/detalhe e testes; mínimo contratual T03-A/B/C: catálogo/referência única, comando local explícito de preparo operational, configuração pública/proxy e registro inicial opcional de Maintenance na transação cadastral. **Proibidas adicionais:** agentes, simulador, mapa, atributos de outras categorias, CRUD administrativo, intervenções/edições de manutenção T0012 e missões.
- **Requisitos:** R01/R02/R04 por referência ao [brief](PROJECT_BRIEF.md); seção [dados](MVP_TECHNICAL_DESIGN.md#dados) e [adição contratual mínima T03-A/B/C](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo): radar de velocidade fixo v1, estado/localização, referências e preparo operacional; política demonstrativa de agenda/pedido inicial proposta à ratificação humana no gate.
- **Não objetivos:** catálogo completo, geração em massa e edição de telemetria.
- **Aceitação:** um equipamento válido pode ser criado/consultado após reinício; série duplicada/atributos básicos inválidos não deixam recurso parcial; estado e necessidade independentes; edição com versão obsoleta falha.
- **Testes:** integração de unicidade/rollback e E2E focal V01, incluindo os [16 V01-T3](VERIFICATION_GUIDE.md#v01-t3-radar) após autorização: perfil, preparo/grant/contexto, criação/edição, pedido inicial condicional, replay/rollback e durabilidade. Todos os novos casos NOT RUN nesta preparação documental. **Manual:** cadastrar, consultar, reiniciar e provocar duplicação.
- **Entregáveis:** fatia de equipamento funcional com persistência e evidências. **Estado:** DONE / HUMAN_ACCEPTED — encerrado pelo responsável em 24/10/2026 na instrução “IGNIS — T0003 | Formalização do aceite humano”, após a implementação individualmente autorizada [acima](#autorizacao-t0003); [relatório técnico e aceite](T0003_REPORT.md#aceite-humano-t0003). Sem commit; T0004–T0020 não autorizados.

### T0004 — Catálogo completo, agentes e localização heterogênea

- **Objetivo / prioridade:** completar a diversidade do inventário; P0. **Dependências:** T0003 e interação aprovada.
- **Áreas permitidas:** Inventory, catálogo versionado, Agent/ResourceLocation, contratos/UI de edição e testes. **Proibidas adicionais:** mapa, telemetria e geração aleatória.
- **Requisitos:** R01–R04 e validações da seção [dados](MVP_TECHNICAL_DESIGN.md#dados); atributos mínimos dos exemplos de categoria e distinção fixo/móvel.
- **Não objetivos:** schemas arbitrários de usuário, cadastro de pessoas reais e geocodificação externa.
- **Aceitação:** catálogo representa todos os exemplos do brief; agente e equipamento têm identidades próprias; coordenadas parciais falham; versão de categoria preservada; cadastro/base/posição não se confundem.
- **Testes:** matriz por categoria e negativas de atributos/CEP/UF/coordenadas (V01 e parte geográfica de V02; determinismo só em T0005). [24 V01-T4](VERIFICATION_GUIDE.md#v01-t4) preparados, todos NOT RUN. **Manual:** criar fixo, móvel e agente, editar atributos e consultar vínculo organizacional; acompanhamento entre abas sem bloqueio automático.
- **Entregáveis:** inventário heterogêneo implementado conforme R-T4-01–07/GF-T4-01–12 aprovados; [relatório de implementação e matriz individual](T0004_REPORT.md). Migração 0003, 14 perfis, Agent, API e frontend verificados; V01-T4-19 teve os três subcasos complementares executados com PASS observado, encerrando a pendência de evidência; matriz atual com 24 casos PASS. **Estado:** DONE / HUMAN_ACCEPTED — [aceite expresso T0004_HUMAN_ACCEPTED](#aceite-humano-t0004), em 24/10/2026; sem commit. T0005–T0020 não autorizados.

### T0005 — Gerador de cadastros válidos

- **Objetivo / prioridade:** entregar F05 com dados coerentes para demonstração; P0. **Dependências:** T0004 e interação aprovada.
- **Áreas permitidas:** Demo Data, operação de geração, manifesto e acionamento mínimo aprovado, testes. **Proibidas adicionais:** escrever tabelas de domínio por atalho, histórico temporal e cenário online.
- **Requisitos:** [contratos F05 ratificados](MVP_TECHNICAL_DESIGN.md#t0005-contrato), T5-D01–D16/A01–A05 e especialização delimitada de [seed/simulação](MVP_TECHNICAL_DESIGN.md#simulacao); apenas baseline por Inventory/Agent/Maintenance. [JF-T5-01–03/GF-T5-01–12](SYSTEM_DESIGN_FUNCTIONAL.md#t0005-funcional) aprovados; implementação individualmente autorizada e posteriormente aceita conforme [registro humano](#aceite-humano-t0005).
- **Não objetivos:** eventos de 60 dias, ticks e geração fora de contexto demo.
- **Aceitação:** seed/versão reproduzem registros normalizados; séries/matrículas únicas; todas as categorias selecionadas válidas; limite e replay respeitados; nenhum dado operacional externo é alterado.
- **Testes:** [V02-T5-01–26](VERIFICATION_GUIDE.md#v02-t5), 26 PASS técnicos históricos; especializam V02 cadastral/determinismo e A01–A05, com V02 espacial completo reservado a T0006. **Manual:** reprodução isolada documentada no relatório e oito cenários B2.1–B2.3 PASS; sem reset de produto. [Resultados e modalidades](T0005_REPORT.md#aceite-humano-t0005), sem reexecução automatizada neste aceite.
- **Entregáveis:** gerador F05 baseline, manifesto, migration 0004, API/interface mínima e provas de validade/integridade implementados sob [autorização individual](#implementacao-t0005). **Estado: DONE / HUMAN_ACCEPTED**, homologação funcional aceita em 26/10/2026 pela [declaração humana final](#aceite-humano-t0005). Typecheck/build e 175 testes/17 arquivos são evidências históricas de 25/10; 159 era a contagem da entrega inicial anterior às correções. Contratos HUMAN_RATIFIED/GF-T5 HUMAN_APPROVED preservados; T0006–T0020 NOT_AUTHORIZED.

### T0006 — Mapa e snapshot inicial do inventário — gate J01

- **Objetivo / prioridade:** visualizar cadastro no mesmo conjunto de indicadores; P0. **Dependências:** T0004 e interação de mapa aprovada; T0005 é apoio opcional para volume, fixture manual basta ao gate J01.
- **Áreas permitidas:** leitura Operations/snapshot, adaptador Leaflet, UI mapa/detalhes, testes. **Proibidas adicionais:** alerta, predição, aparência não aprovada e telemetria dinâmica.
- **Requisitos:** [snapshot/indicadores](MVP_TECHNICAL_DESIGN.md#estados), R05 e J01.
- **Não objetivos:** risco futuro e otimização geoespacial avançada.
- **Aceitação:** recurso cadastrado aparece após consulta; mapa/lista/indicadores usam mesmos filtros e revisão; recursos sem ponto são identificados; atribuição/fallback do mapa respeitados.
- **Testes:** snapshot transacional, bbox e E2E J01 (V03). **Manual:** cadastrar fixo/móvel e filtrar por órgão/região sem tiles.
- **Entregáveis:** primeira jornada íntegra e gate J01 registrado. **Estado: DONE / HUMAN_ACCEPTED** — homologação funcional humana (`7/7` cenários PASS) e gate J01 aceitos pelo responsável em 26/10/2026 na instrução “PROJECT IGNIS — Aceite humano e checkpoint T0006”, conforme [registro do aceite](#aceite-humano-t0006) e [relatório T0006](T0006_REPORT.md). Migration `0005` implementada (schema `5`); migration `0006` reservada para T0007. Suíte `test:t0006` `9/3` PASS e suíte completa `184/20` PASS. T0007–T0020 não autorizados.

## Marco C — Telemetria e operação

### T0007 — Pipeline de telemetria idempotente

- **Objetivo / prioridade:** transformar observações em estado confiável; P0. **Dependências:** T0004 (que já depende de T0002) e [C03 HUMAN_RATIFIED](C03_TELEMETRY_CONTRACT.md#decisoes); autorização individual de implementação ainda não concedida.
- **Áreas permitidas:** Telemetry, Operations, causas de Maintenance, bindings/cursores e contratos, testes. **Proibidas adicionais:** simulador, interface nova e transportes push.
- **Requisitos:** [eventos/pipeline](MVP_TECHNICAL_DESIGN.md#telemetria), [especialização C03 D01–D12](C03_TELEMETRY_CONTRACT.md) e I02/I03/I05. Migration 0006 reservada, não criada; somente evolução necessária ao núcleo autorizado futuramente. Conclusão pública de manutenção permanece T0012.
- **Não objetivos:** adaptar hardware ou construir broker.
- **Aceitação:** replay não duplica efeito; hash divergente conflita; atraso não retrocede projeção; fonte/canal inválido falha; estado administrativo é preservado; falha entre writes reverte tudo.
- **Testes:** contratos, integração transacional e sequências concorrentes (V05; V04 de crash/reset fica para T0009). **Manual:** submeter observação, repetição e atraso, conferir histórico/versão.
- **Entregáveis futuros:** ingestão e projeção observacional testadas. **Estado: PLANNED / NOT_STARTED / NOT_AUTHORIZED.** Ratificação C03 não é aceite V05/V06 nem homologação T0007.

### T0008 — Histórico demonstrativo reproduzível

- **Objetivo / prioridade:** preparar dados temporais úteis às duas análises; P0. **Dependências:** T0005/T0007 e ADR-0003 aceito.
- **Áreas permitidas:** geração histórica em Demo Data/Simulation, definições versionadas e fixtures, testes. **Proibidas adicionais:** scores, jogo e controles de tempo online.
- **Requisitos:** manifesto e cobertura da seção [simulação](MVP_TECHNICAL_DESIGN.md#simulacao); casos sintéticos independentes do score da seção 9.
- **Não objetivos:** gerar heartbeat por minuto para todos os recursos ou ajustar peso analítico ao resultado futuro.
- **Aceitação:** histórico de 60 dias limitado, com falhas/intervenções/lacunas coerentes; replay sem duplicar; estado final coincide com aplicação do pipeline; proveniência e cobertura explícitas.
- **Testes:** duas gerações equivalentes, baseline esperado e ausência de futuro (partes históricas V04/V07; consulta visual de histórico em T0012). **Manual:** consultar manifesto e amostras de um recurso estável, degradado e sem dados.
- **Entregáveis:** cenários históricos versionados e fixtures verificáveis. **Estado:** PLANNED.

### T0009 — Execução, pausa, retomada e reset seguro do cenário

- **Objetivo / prioridade:** entregar F03 sem interferência entre execuções; P0. **Dependências:** T0005/T0007; interação aprovada para controles. T0008 não bloqueia cenário online, que pode iniciar com baseline pequeno.
- **Áreas permitidas:** Simulation/scheduler, geração staging/ponteiro ativo, controles mínimos aprovados, testes de falha. **Proibidas adicionais:** SQL direto de projeções e tour.
- **Requisitos:** ciclo de run, tick atômico, fencing e reset da seção [simulação](MVP_TECHNICAL_DESIGN.md#simulacao).
- **Não objetivos:** tempo acelerado ilimitado e compensação automática do tempo desligado.
- **Aceitação:** pause conserva dataNow; resume parte do tick confirmado; crash não duplica evento; reset concorrente tem um vencedor; callbacks antigos são recusados; falha no staging preserva geração anterior.
- **Testes:** relógio falso, crash antes/depois de commit e contexto antigo (V04/V05). **Manual:** iniciar, pausar, reiniciar processo, retomar e resetar.
- **Entregáveis:** simulador controlável e evidências de recuperação. **Estado:** PLANNED.

### T0010 — Alertas com ciclo de vida e causas

- **Objetivo / prioridade:** detectar falha, falta de comunicação e manutenção próxima/crítica; P0. **Dependências:** T0007 e interação aprovada para reconhecimento; testar tempo com relógio injetável, integrar ao scheduler T0009 em T0011.
- **Áreas permitidas:** Alerts, orquestração transacional/temporal, contratos e lista de alertas, testes. **Proibidas adicionais:** previsão e transportes novos.
- **Requisitos:** regras/ciclos da seção [estados](MVP_TECHNICAL_DESIGN.md#estados); não duplicar necessidade por causa.
- **Não objetivos:** regras configuráveis arbitrárias e notificação externa.
- **Aceitação:** condição repetida conserva um ciclo; reconhecer não resolve causa; resolução/recorrência preservam histórico; cenário pausado não expira pelo relógio de parede; manutenção próxima aparece por agenda.
- **Testes:** limites temporais, recorrência, rollback com estado e alertas (V06). **Manual:** falha, reconhecimento, resolução e nova falha; ausência de heartbeat.
- **Entregáveis:** regras iniciais e ciclo auditável. **Estado:** PLANNED.

### T0011 — Central continuamente atualizada — gate J02

- **Objetivo / prioridade:** completar F02 integrado a F03; P0. **Dependências:** T0006/T0009/T0010; interação aprovada.
- **Áreas permitidas:** snapshot de Operations, polling/recuperação no frontend, filtros e indicadores, testes. **Proibidas adicionais:** SSE/WebSocket, predição e novos serviços.
- **Requisitos:** [indicadores](MVP_TECHNICAL_DESIGN.md#estados), J02 e metas da arquitetura.
- **Não objetivos:** dashboard visual sem especificação e disponibilidade calculada pelo cliente.
- **Aceitação:** falha simulada chega a estado/alerta/mapa em meta medida; fórmula e numerador/denominador visíveis; stale não vira furto; resposta atrasada não retrocede revisão; perda de rede indica dado antigo.
- **Testes:** E2E J02, filtros combinados e carga de referência (V03/V05/V06). **Manual:** simular falha, alterar filtros, desconectar/reconectar navegador.
- **Entregáveis:** gate J02 e medições no ambiente documentado. **Estado:** PLANNED.

## Marco D — Histórico e inteligência

### T0012 — Histórico consultável e intervenção manual

- **Objetivo / prioridade:** rastrear fatos e concluir causas pelo domínio de manutenção; P0. **Dependências:** T0010; interação aprovada.
- **Áreas permitidas:** histórico Operations/Maintenance, comandos start/complete, consulta de recurso e testes. **Proibidas adicionais:** missões, score e mudança indevida de prioridade.
- **Requisitos:** seções [estados](MVP_TECHNICAL_DESIGN.md#estados)/[operações](MVP_TECHNICAL_DESIGN.md#operacoes); encadeamento evento → causa → intervenção.
- **Não objetivos:** sistema de ordens de serviço corporativo.
- **Aceitação:** paginação temporal estável; intervenção resolve somente causa alvo; replay conserva uma conclusão; causa secundária impede operacional indevido; histórico preserva origem/tempo lógico.
- **Testes:** integração de duas causas, versões e corte temporal (V06/V07). **Manual:** abrir histórico, concluir necessidade e verificar estado remanescente.
- **Entregáveis:** histórico/fluxo de manutenção reutilizável pelo motor de missões. **Estado:** PLANNED.

### T0013 — Prioridade preventiva explicável P01

- **Objetivo / prioridade:** entregar análise de manutenção F04; P0. **Dependências:** T0008/T0012, ADR-0003 aceito e interação aprovada.
- **Áreas permitidas:** Prediction P01/agregação, persistência de fatores e apresentação de explicações, testes. **Proibidas adicionais:** P02, ML/LLM e alteração automática de estado/prioridade.
- **Requisitos:** método/cobertura/agendamento da seção [predição](MVP_TECHNICAL_DESIGN.md#predicao).
- **Não objetivos:** probabilidade calibrada e acurácia inventada.
- **Aceitação:** exemplo aritmético e insuficiência corretos; resultados guardam corte/revisão/parâmetros; conhecido após o corte não vaza; chamada equivalente reutiliza resultado; alteração durante cálculo marca stale.
- **Testes:** unitários com referência independente, corte temporal e baseline (V07/V08). **Manual:** comparar estável, recorrente e recém-cadastrado, consultar fatores.
- **Entregáveis:** P01 e relatório demonstrativo com limitações/resultados medidos. **Estado:** PLANNED.

### T0014 — Risco regional explicável P02 — gate J04

- **Objetivo / prioridade:** entregar F09 com horizonte explícito; P0. **Dependências:** T0013/T0006 e interação regional aprovada; T0011 não bloqueia cálculo nem camada regional.
- **Áreas permitidas:** Prediction P02, consulta regional, representação sobre mapa existente, testes. **Proibidas adicionais:** inferência criminal/populacional, modelo estatístico não aprovado.
- **Requisitos:** P02 e J04 em [predição/jornadas](MVP_TECHNICAL_DESIGN.md#predicao).
- **Não objetivos:** interpolação em região vazia e promessa de risco probabilístico.
- **Aceitação:** P01/P02 usam mesmo corte; região sem amostra tem score null; pesos/contagens/cobertura consultáveis; validação temporal compara baseline sem usar futuro; reset impede publicação antiga.
- **Testes:** agregação ponderada, fronteira geográfica, insuficiência e E2E J04 (V08). **Manual:** inspecionar regiões estável/degradada/insuficiente e seus fatores.
- **Entregáveis:** mapa de risco operacional e gate J04. **Estado:** PLANNED.

## Marco E — Manutenção gamificada

### T0015 — Motor comum de missões e tentativas

- **Objetivo / prioridade:** criar sessão segura e efeito único reutilizável pelas três mecânicas; P1. **Dependências:** T0012/T0009, ADR-0003 Accepted — Conditional e especificação C04 revisada antes da autorização/início.
- **Áreas permitidas:** Game Missions, integração Maintenance/Operations, contratos de adaptadores e testes. **Proibidas adicionais:** puzzles visuais e validação de sucesso pelo cliente. O adaptador de teste só pode existir na suíte, nunca como endpoint de sucesso em produção.
- **Requisitos:** [missões](MVP_TECHNICAL_DESIGN.md#missoes), I07 e integração transacional.
- **Não objetivos:** implementar jogos finais ou anti-cheat competitivo.
- **Aceitação:** sessão/compatibilidade/TTL/tentativas e cancelamento corretos; simulador de adaptador apenas em testes; repetição concorrente gera uma intervenção; outra causa e epoch antigo impedem reparo indevido.
- **Testes:** integração de expiração/replay/reset/duas causas com adaptador de teste (V09). **Manual:** chamada técnica de iniciar/cancelar e consulta do estado, sem alegar jogo entregue.
- **Entregáveis:** motor desacoplado e suíte de integridade. **Estado:** PLANNED.

### T0016 — Reconectar Circuitos integrado — gate J03

- **Objetivo / prioridade:** entregar F06 com primeiro jogo completo; P1. **Dependências:** T0015 e interação/mecânica aprovadas em System Design.
- **Áreas permitidas:** adaptador backend da mecânica, frontend do jogo, catálogo compatível e E2E. **Proibidas adicionais:** SQL no jogo e alterações diretas de estado.
- **Requisitos:** contrato comum de missões e J03; evidência verificável no servidor.
- **Não objetivos:** efeitos audiovisuais não especificados e demais jogos.
- **Aceitação:** solução válida conclui intervenção simulada; solução inválida/adulterada não repara; replay não duplica; situação/alertas refletem causas restantes.
- **Testes:** validador independente do frontend e E2E de solução válida/inválida (V09). **Manual:** iniciar jogo compatível, errar, concluir e consultar intervenção.
- **Entregáveis:** F06 completo e gate J03. **Estado:** PLANNED.

### T0017 — Restaurar o Sinal no motor comum

- **Objetivo / prioridade:** entregar primeira mecânica de F08; P1. **Dependências:** T0015 e especificação própria aprovada.
- **Áreas permitidas:** adaptador/validador dessa mecânica, frontend e catálogo/testes. **Proibidas adicionais:** duplicar motor ou fabricar heartbeat de conclusão.
- **Requisitos:** [compatibilidade e resultado](MVP_TECHNICAL_DESIGN.md#missoes).
- **Não objetivos:** reescrever o fluxo de manutenção.
- **Aceitação:** mesma sessão/recibo/TTL do motor; categoria incompatível falha; conclusão não marca comunicação fresca sem observação válida; resultado identificado como simulado.
- **Testes:** solução válida/inválida, replay e comunicação ainda stale (V09). **Manual:** completar e observar novo heartbeat pelo simulador.
- **Entregáveis:** Restaurar o Sinal integrado com evidências. **Estado:** PLANNED.

### T0018 — Calibrar Sensores no motor comum

- **Objetivo / prioridade:** completar F08; P1. **Dependências:** T0015 e especificação própria aprovada; os três adaptadores são independentes.
- **Áreas permitidas:** adaptador/validador da mecânica, frontend e catálogo/testes. **Proibidas adicionais:** alterar métricas históricas ou duplicar manutenção.
- **Requisitos:** [missões](MVP_TECHNICAL_DESIGN.md#missoes), categoria com sensor compatível.
- **Não objetivos:** calibrar dispositivo físico ou inferir sucesso por pontuação do cliente.
- **Aceitação:** validação no servidor usa evidência da mecânica; métricas antigas preservadas; intervenção simulada única; solução inválida não resolve causa.
- **Testes:** limites de validação, adulteração e E2E (V09). **Manual:** falhar/concluir calibração e consultar histórico.
- **Entregáveis:** Calibrar Sensores integrado e cobertura das três mecânicas. **Estado:** PLANNED.

## Marco F — Experiência e distribuição

### T0019 — Tour PROMETHEUS idempotente — gate J05

- **Objetivo / prioridade:** entregar F07 e demonstrar as nove features com integridade; P1. **Dependências:** T0011/T0014/T0016/T0017/T0018; navegação/roteiro de demonstração aprovados.
- **Áreas permitidas:** Guided Experience, integração com Simulation e navegação aprovada, testes. **Proibidas adicionais:** backdoors de estado, narração/sons e operações em outro dataset.
- **Requisitos:** J05 e ciclo de tour na seção [jornadas](MVP_TECHNICAL_DESIGN.md#jornadas).
- **Não objetivos:** roteiro audiovisual definitivo ou desfazer fatos confirmados em silêncio.
- **Aceitação:** iniciar contexto próprio, avançar/retomar sem redisparar comando, observar revisão esperada e encerrar pausando run; reset invalida sessões antigas e preserva sessão de outro avaliador.
- **Testes:** E2E J05, duas sessões e perda de rede (V10/V11). **Manual:** seguir tour, recarregar no meio e encerrar.
- **Entregáveis:** tour funcional e gate J05. **Estado:** PLANNED.

### T0020 — Distribuição local e estabilização final

- **Objetivo / prioridade:** permitir avaliação reproduzível com recuperação documentada; P0 para entrega. **Dependências:** T0019, gates J01–J05 e autorização de build/configuração; deploy continua separado.
- **Áreas permitidas:** empacotamento/build local, configuração de distribuição, documentação operacional, testes de integração/E2E e correções estritamente necessárias aos gates. **Proibidas adicionais:** features novas, merge/push e deploy sem autorização específica.
- **Requisitos:** [distribuição](SYSTEM_ARCHITECTURE.md#execucao-local-e-distribuicao-propostas) e V00–V11; substituir comandos propostos por comandos realmente testados.
- **Não objetivos:** contratar hospedagem, migrar stack ou garantir serviço gratuito.
- **Aceitação:** avaliação em diretório/ambiente limpo, um processo na distribuição, persistência/reinício/backup restaurado, fallback cartográfico e segredos ausentes do bundle/logs; documentação corresponde ao build; todas as features demonstráveis.
- **Testes:** suíte pertinente final, execução limpa, restauração e segurança (V11). **Manual:** executar checklist completo e registrar tempos/ambiente/falhas.
- **Entregáveis:** distribuição local verificável, guia real e relatório dos gates/limitações. **Estado:** PLANNED.

<a id="planejamento-v11"></a>
## Dependências, estabilização e contingência v1.1

Auditoria dos 20 tickets: dependências obrigatórias abaixo; apoios opcionais não bloqueiam o gate. Não há dependência circular. Aceite de ADR/gate humano e gate de design aplicável são pré-condições adicionais, não tickets executados.

| Ticket | Dependências técnicas obrigatórias | Resultado verificável / limite do estágio |
|---|---|---|
| T0001 | Nenhuma | Processo/health/build técnico, sem domínio |
| T0002 | T0001 | Persistência e guardas locais, sem provisionamento público |
| T0003 | T0002 | Cadastro mínimo persistente; V01 somente categoria inicial |
| T0004 | T0003 | Catálogo/agentes/geografia; matriz de categorias, sem gerador |
| T0005 | T0004 | Baseline determinístico; sem histórico de 60 dias |
| T0006 | T0004 | Cadastro no mapa/snapshot; J01; volume por T0005 opcional |
| T0007 | T0004 | Pipeline/cursor/rollback; sem teste de reset ainda inexistente |
| T0008 | T0005, T0007 | Histórico com corte/cobertura; consulta técnica antes de T0012 |
| T0009 | T0005, T0007 | Cenário online, pausa e reset sem esperar T0008 |
| T0010 | T0007 | Alertas testados por relógio injetável; scheduler integrado em T0011 |
| T0011 | T0006, T0009, T0010 | Central viva; J02; carga medida e reconnect |
| T0012 | T0010 | Histórico/intervenção manual reutilizável |
| T0013 | T0008, T0012 | P01 com fatores e relatório, sem reivindicar validade externa |
| T0014 | T0013, T0006 | P02 no mapa; J04; não depende do acabamento da Central |
| T0015 | T0012, T0009 | Motor validado apenas com adaptador de teste na suíte |
| T0016 | T0015 | Reconectar Circuitos; J03 |
| T0017 | T0015 | Restaurar o Sinal, sem depender de T0016 |
| T0018 | T0015 | Calibrar Sensores, sem depender de T0016/T0017 |
| T0019 | T0011, T0014, T0016, T0017, T0018 | Tour com todas as features; J05 |
| T0020 | T0019 e gates J01–J05 | Distribuição final, restauração e evidência completa |

Não existe caminho crítico de duração calculável sem estimativas/ disponibilidade reais. O encadeamento técnico obrigatório até inventário é T0001→T0002→T0003→T0004. Depois há ramos: operação (T0005/T0007→T0009, T0007→T0010, T0004→T0006, reunidos em T0011); inteligência (T0005/T0007→T0008 e T0010→T0012, reunidos em T0013→T0014); jogos (T0012/T0009→T0015→T0016/T0017/T0018). Todos convergem em T0019→T0020. Execução sugerida para obter valor cedo: T0001–T0007, T0009, T0010, T0011, T0008, T0012–T0020, respeitando gates. Isso não autoriza agentes paralelos nem execução de tickets.

### Calendário condicional e pontos de parada

| Janela em Brasília | Marco / mínimo verificável e dependências | Risco / simplificação admissível | Condição para avançar |
|---|---|---|---|
| 23/10 | Aceite arquitetural condicional registrado; Git já inicializado com baseline bc60368; autorizações individuais ainda pendentes | Resolver gates contratuais nos prazos; preparar design funcional mínimo antes de T0003, sem bloquear T0001/T0002 | Autorização específica por ticket e gates pertinentes; sem isso não iniciar |
| 24/10 — primeira parada | A: T0001/T0002 executáveis, persistência e guardas | Compatibilidade; não adicionar tabela/infra de feature futura | V00 aplicável passa; se falhar, congelar domínio |
| 24/10 — segunda parada | B: T0003–T0006, inventário utilizável, F05 e J01 | Catálogo/interface; cenário com 20 equipamentos/6 agentes/3 regiões, preservando categorias cadastráveis | V01–V03 aplicáveis passam |
| 25/10 | C: T0007/T0009/T0010/T0011, simulação funcional e Central integrada | Reset/corridas; um cenário online fixo, poucos controles | J02 passa, incluindo reset; não acumular expansão com falha de integridade |
| 26/10 — primeira parada | D: T0008/T0012–T0014, histórico e duas análises demonstráveis | Cobertura/leakage; 60 dias para amostra menor, cálculo manual e periodicidade reduzida explicitamente configurada | J04 passa na implementação; resultados sintéticos identificados; avaliação sem ganho reportada |
| 26/10 — segunda parada | E: T0015–T0018, três jogos integrados | Validadores/prazo; uma dificuldade e desafios curtos por mecânica | J03 e V09 passam para os três jogos |
| 27/10 até 12h — ponto de replanejamento | F: T0019, tour funcional | Integrações tardias; roteiro curto com um disparo por etapa | J05 passa; se incompleto, comunicar risco de entrega e replanejar com humano |
| 27/10 após 12h até antes de 23h59 | T0020, congelar expansões, verificar distribuição/recuperação | Sem margem; correções necessárias aos gates, apresentação neutra aprovada, distribuição local prioritária | V11 e gates finais; feature ausente impede declarar escopo completo |

As datas são **limites de decisão propostos**, não estimativas de esforço ou garantia. Sem dados de produtividade, não se demonstra que os 20 tickets cabem na janela. Atraso em um checkpoint exige comunicar o risco e rever a janela, sem aprovar automaticamente omissão de feature. Build técnico e smoke permanecem desde T0001; T0020 consolida distribuição, não descobre pela primeira vez se ela executa.

Configurações ajustáveis, variedades de cenário/puzzles e profundidade do tour podem ser reduzidas. Frequência analítica pode cair de periódica para sob demanda explícita na contingência, preservando corte/freshness e reexecução após mudança, com registro da configuração na evidência. Não simplificar transações, contexto/epoch, validação server-side, recibos de efeitos ou critérios de insuficiência. Todas as nove features permanecem exigidas.


