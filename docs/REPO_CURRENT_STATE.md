# Estado real do repositório

Atualização: **26/10/2026, America/Sao_Paulo**. Diretório: `C:\Users\Pichau\Desktop\project-ignis`.

<a id="registro-c03"></a>
## Estado vigente — C03 HUMAN_RATIFIED, implementação não iniciada

Fonte humana: **“PROJECT IGNIS — Registro formal da ratificação C03”**. [Contrato normativo C03](C03_TELEMETRY_CONTRACT.md) consolida D01–D12 **RATIFIED**, com os refinamentos finais e ressalvas; [governança](TICKETS.md#ratificacao-c03). Checkpoint anterior confirmado: **main/de14734d415f72c4dff8423be586b80cf1e9ba07**, índice/working tree inicialmente limpos. Inspeção estática: schema **5**, migrations 0001–0005, sem implementação parcial de ingestão/episódios/cursores C03 ou migration 0006.

**T0001–T0006 DONE / HUMAN_ACCEPTED; T0006/J01 PASS / HUMAN_ACCEPTED; T0007 PLANNED / NOT_STARTED / NOT_AUTHORIZED; migration 0006 RESERVED / NOT_CREATED; V05/V06 NOT YET ACCEPTED.** A autorização cobre somente documentação, verificações documentais e um commit local; não implementação, push, serviços ou banco. Os 184/184 testes/20 arquivos e typecheck/build PASS de T0006 são históricos, não reexecutados: alteração exclusivamente documental não exige suíte de aplicação. Nenhum teste/build/migration executado neste registro.

Perfis FX aprovados somente para fixtures/homologação isolada; ativação operacional real continua sujeita a aprovação explícita. [Limites de relógio, veracidade física e pendências documentais](KNOWN_ISSUES.md#limites-c03). Os registros datados abaixo são preservados; suas menções a C03 contratualmente pendente foram superadas por esta ratificação, sem converter testes/gates futuros em PASS.

<a id="aceite-humano-t0006"></a>
## Estado vigente — T0006 DONE / HUMAN_ACCEPTED (Gate J01 concluído)

O responsável concedeu expressamente o aceite humano final à homologação funcional da T0006 na instrução **“PROJECT IGNIS — Aceite humano e checkpoint T0006”**, após aprovação de **7/7 cenários funcionais** em ambiente isolado de homologação. **T0001–T0006 DONE / HUMAN_ACCEPTED; Gate J01 PASS / HUMAN_ACCEPTED; T0007–T0020 NOT_AUTHORIZED.** [Fonte de governança](TICKETS.md#aceite-humano-t0006); [relatório técnico e homologação](T0006_REPORT.md#aceite-humano-t0006).

Sete cenários funcionais PASS: (1) geração do baseline `synthetic_baseline` na geração 1, revisão 1, com 20 equipamentos, 6 agentes, 15 pedidos e 6 recursos sem coordenadas (com observação não bloqueante de UX de que o código HTTP 201 não é exibido diretamente na interface); (2) mapa operacional com 5 regiões GeoJSON, 20 marcadores e resumo regional; (3) indicadores `R06` (`85.71%` em `12/14`) e denominador zero; (4) recursos sem coordenadas e filtro espacial `bbox`; (5) filtros combinados `R05`; (6) inspeção cadastral de equipamentos e agentes; (7) fallback vetorial local com marcadores e polígonos preservados, reenquadramento funcional, scroll estável e zoom pelos botões.

Verificações automatizadas executadas na worktree `t0006` (base `edc1629e17c6ebbe8d9e63c5efa2957d38c27e36`): `npm run typecheck` PASS; `npm run build` PASS; `npm run test:t0006` PASS (**9/9 testes em 3 arquivos**); `npm test` PASS (**184/184 testes em 20 arquivos**, preservando os 175 anteriores). Migration `0005-regions-and-spatial.sql` (schema `4` → `5`) incluída; migration `0006` preservada e reservada para T0007; `git diff --check` sem erros. Nenhum arquivo de `.tmp`, banco SQLite, segredo, log ou bundle compilado foi incluído no controle de versão. C01–C05 (incluindo C03 pendente antes de T0007) e ADRs condicionais permanecem conforme suas fontes.

<a id="aceite-humano-t0005"></a>
## Estado vigente — T0005 DONE / HUMAN_ACCEPTED

O responsável concedeu expressamente o aceite humano final à homologação funcional de T0005 na instrução **“PROJECT IGNIS — Aceite humano final da T0005”**, após analisar B2.1, B2.2 e B2.3. **T0001–T0005 DONE / HUMAN_ACCEPTED; T0006–T0020 NOT_AUTHORIZED.** [Fonte de governança](TICKETS.md#aceite-humano-t0005); [parecer final e evidências](T0005_REPORT.md#aceite-humano-t0005).

Oito cenários funcionais PASS: 1–5 em B2.1; 6–7 em B2.2, incluindo recuperação supervisionada após queda de energia no 7; 8 em B2.3, com confirmações humanas explícitas de manifesto, amostras e reabertura. A rodada isolada `.tmp/t0005-human-qa/20261025-a-6d48c2f0-95b7-4a31-b8c9-062f60c73d22` conserva epoch 4 retired/revisão 1 e epoch 5 ready/ativo/revisão 1, cada qual com baseline 20/6/15, um manifesto e um recibo. A B2.3 confirmou integridade SQLite/FKs, hashes e ausência de alteração em 14 tabelas de domínio/contexto; 66 GETs 200, zero POST/controle. Estes são resultados existentes, não novas consultas de banco neste registro.

Os 175 testes/17 arquivos, 16/2 direcionados e typecheck/build PASS pertencem às verificações técnicas de 25/10 e não foram repetidos na homologação B2.3 ou neste aceite documental. O roteiro de oito cenários foi satisfeito; não se afirma reexecução integral dos casos GF-T5/V02, leitor de tela, outros sistemas ou instalação nativa limpa. C01–C05, J01, V02 espacial/T0006, ADRs condicionais e ressalvas históricas permanecem.

Neste registro, somente seis Markdown de acompanhamento foram alterados. As 62 âncoras históricas conferiram e os 80 arquivos de evidência atuais foram preservados. Código/testes/harness/índice/HEAD e trabalho preexistente mantidos; sem build, migration, banco, commit ou encerramento de serviços. Supervisor/backend/portal da rodada não foram operados. Os registros abaixo preservam suas datas e estados anteriores ao aceite.

<a id="implementacao-t0005"></a>
## Histórico — entrega técnica T0005, anterior ao aceite humano

Autorização individual expressa de 25/10/2026: “IGNIS — T0005 | AUTORIZAÇÃO HUMANA DE IMPLEMENTAÇÃO”. Baseline **main/ab4afd6fbeb0a0ee27124b5a6c8dc9c18d0348c8**, inicialmente limpa, HEAD/branch preservados. [Governança responsável](TICKETS.md#implementacao-t0005), [relatório A–N](T0005_REPORT.md). Entrega técnica **T0005_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION**, implementação autorizada; sem DONE/HUMAN_ACCEPTED ou homologação humana presumida. T0001–T0004 aceitos; T0006–T0020 NOT_AUTHORIZED.

Implementados: motor SHA-256/contador/rejeição/UUIDs contextuais, preset 20/6/14 categorias, composição interna de Inventory/Agent/Maintenance numa transação, uma revisão/eventos ordinalizados/recibo pai, manifesto inicial imutável/proveniência e API contextual GET/POST demo-data. Migration 0004 evolui para schema 4 com fechamento por constraints/FKs/triggers; migrations 0001–0003 intactas, upgrade/backup schema 3 populado e SQL direto adversarial verificados. UI mínima cobre JF-T5-01–03, intenção em memória, retry explícito, isolamento e reconsulta. Sem dependências novas, reset, mapa, observações, ticks ou histórico.

Resultados atuais após [correções P2 e retomada](T0005_REPORT.md#p2-corrections): `npm run typecheck` PASS; `npm test` com build frontend/backend PASS e **175 testes/17 arquivos**, preservando 117 anteriores e incluindo 58 de T0005; **16/2 testes corretivos direcionados PASS**. O comando específico test:t0005 tinha 42/5 PASS na entrega inicial; os 58 atuais passaram na suíte completa. [V02-T5-01–26](VERIFICATION_GUIDE.md#v02-t5) preservados, com evidência adicional para manifesto/eventos e descarte de revisão default/intenção incerta. Máximo 200/30 novamente PASS. SQLite 3.53.4, foreign_keys=1, WAL, synchronous FULL, busy_timeout=1000.

P2-01 acrescenta rechecagem dos eventos persistidos e de suas associações contra P/hash imutáveis, inclusive após edição cadastral legítima. P2-02 protege revisão aberta com defaults, preserva revisão antiga bloqueada ao recusar e exige descarte explícito. Cenário prioritário de intenção incerta no epoch6→7 concluído no novo banco exclusivamente descartável `.tmp/t0005-p2-review-20261025/discardable.sqlite`: recusa/aceite observados, nenhuma criação ou remapeamento no7. Estado do ticket continua T0005_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION; parecer corretivo T0005_P2_CORRECTIONS_IMPLEMENTED_AWAITING_HUMAN_VERIFICATION. Sem mudança de contratos, migrations, dependências ou aceite humano.

Uso exclusivo de fixtures descartáveis. Navegador em 127.0.0.1:5173 com proxy de falhas de QA e backend em 3000; dados somente em `.tmp/t0005-review-20261025/qa.sqlite`, com identidade e epochs documentados no relatório. Servidores/abas criados nesta execução encerrados. Correções de consulta repetida, cópia reativa da intenção e foco de cancelamento foram verificadas; nenhuma mudança contratual. C01 (instalação limpa nova não reproduzida), oito grupos futuros C02, C03/C04/C05, J01, ADRs condicionais e MANUAL_INCONCLUSIVE histórico T0003 preservados. Sem staging/commit.

<a id="contratos-t0005"></a>
## Histórico — contratos T0005 ratificados, anterior à autorização de implementação

Instrução humana “IGNIS — T0005 | Formalização documental dos contratos ratificados”: T5-D01–D16 e A01–A05 HUMAN_RATIFIED; JF-T5-01–03 ratificadas/GF-T5-01–12 HUMAN_APPROVED. [Evidência e estados no backlog](TICKETS.md#contratos-t0005), [fonte técnica](MVP_TECHNICAL_DESIGN.md#t0005-contrato), [fonte funcional](SYSTEM_DESIGN_FUNCTIONAL.md#t0005-funcional), [26 verificações NOT_RUN](VERIFICATION_GUIDE.md#v02-t5).

Baseline desta formalização: **main/c8dd5fc8d15647501af484b8789fe003992b7d94**, árvore/índice limpos; commit da implementação T0004 realizado anteriormente pelo responsável, distinto das baselines históricas dos relatórios. **T0001–T0004 DONE / HUMAN_ACCEPTED; T0005 PLANNED / NOT_AUTHORIZED; T0006–T0020 não autorizados.** Nenhum gerador, endpoint demo-data, manifesto, migration, teste ou UI de T0005 implementado nesta execução.

A inspeção confirmou schema 3, chaves contextuais de recursos/eventos/pedidos e chaves globais próprias de ator/dataset/sessão/catálogo. Eventos atuais exigem ordinal=1, event() incrementa por cadastro e o helper rejeita transação aninhada. A evolução necessária foi apenas especificada: uma revisão por lote, ordinais com fechamento persistente e recibo pai, IDs contextuais repetíveis sem salt, projeção/hash inicial imutável e relógios sintéticos/reais separados. Máximo 200/30 exige medição futura; inviabilidade bloqueia aceite ou revisão humana, sem redução silenciosa.

Somente os sete documentos autorizados atualizados. Implementação/configurações/dependências/migrations/testes/ADRs/relatórios T0001–T0004 preservados. Não foram executados testes, build, migração, instalação, geração/limpeza de banco, staging ou commit. Resultados anteriores permanecem evidências históricas, não repetidas. C01–C05, J01 e MANUAL_INCONCLUSIVE histórico de T0003 mantidos.

Verificação documental do fechamento: 19 Markdown e 395 referências locais válidas, 16 T5-D e cinco A HUMAN_RATIFIED, 12 GF-T5 HUMAN_APPROVED, 26 V02-T5 NOT_RUN e 20 tickets preservados. Linhas anteriores das matrizes de verificação intactas. SHA-256: 72/79 arquivos preexistentes idênticos; apenas os sete documentos permitidos alterados, nenhum novo/removido. git diff --check sem erros, índice vazio e HEAD c8dd5fc mantido; somente avisos LF/CRLF do Git. Parecer: **T0005_DOCUMENTARY_CONTRACTS_RATIFIED_IMPLEMENTATION_NOT_AUTHORIZED**.

<a id="aceite-humano-t0004"></a>
## Aceite preservado — T0004 DONE / HUMAN_ACCEPTED

Em **24/10/2026**, o responsável pelo projeto registrou expressamente **T0004_HUMAN_ACCEPTED** nesta conversa, após a entrega técnica e os três PASS complementares de V01-T4-19. T0004 encerrado como **DONE / HUMAN_ACCEPTED**; T0001–T0003 permanecem aceitos. [Registro responsável no backlog](TICKETS.md#aceite-humano-t0004) e [relatório/evidências](T0004_REPORT.md#aceite-humano-t0004).

O aceite não acrescenta novas execuções de teste, não afirma validação independente adicional não descrita pelo humano e não elimina limitações já registradas. C01–C05, J01, MANUAL_INCONCLUSIVE histórico de T0003 e ADRs Accepted — Conditional preservados. T0005–T0020 continuam PLANNED / NOT_AUTHORIZED.

Formalização somente em README e documentos de governança/relatório, preservando integralmente implementação, testes, configurações, dependências e contratos. main/HEAD 820dad33b404627d94265652078d2558a654f9c6 mantidos, alterações anteriores preservadas; nenhum staging ou commit. Resultados automatizados abaixo são anteriores, não reexecutados no registro deste aceite.

<a id="implementacao-t0004"></a>
## Histórico — entrega técnica T0004 anterior ao aceite humano

Autorização expressa **T0004_IMPLEMENTATION_HUMAN_AUTHORIZED**, após o aceite contratual/funcional versionado em **main/820dad33b404627d94265652078d2558a654f9c6**, inicialmente limpo. Entrega em 24/10/2026: **READY_FOR_HUMAN_REVIEW**, parecer atualizado T0004_ALL_VERIFICATIONS_READY_FOR_HUMAN_ACCEPTANCE após homologação complementar V01-T4-19 autorizada individualmente. T0001–T0003 continuam DONE / HUMAN_ACCEPTED; T0005–T0020 PLANNED / NOT_AUTHORIZED; sem commit ou aceite humano de T0004.

A retomada controlada encontrou 12 arquivos rastreados modificados, nove novos arquivos e nenhum relatório T0004. Código/migração/jornadas/testes já estavam implementados. Foram preservados e verificados; a continuação concluiu a documentação e repetiu os comandos finais, sem reiniciar o ticket. [Relatório A–N](T0004_REPORT.md) distingue implementação, evidências anteriores recuperadas e verificações repetidas.

Concluídos: schema 3 por migration 0003, catálogo de 14 perfis/políticas imutáveis, Equipment heterogêneo, Agent institucional, rotas contextuais e frontend Vue. Cadastros respeitam situação inicial explícita, localização/papéis e manutenção por perfil. FKs ON e referências diferidas exigem especialização/cadastro/estado completos no commit. Migração populada preserva dados/IDs/eventos/versões/recibos/grants/sessões; backup consistente e três replays golden de T0003 foram comprovados. 0001/0002, C02/auth e contratos ratificados intactos; nenhuma dependência adicionada.

Resultados observados novamente: typecheck/build PASS; suíte completa **117 testes/10 arquivos**, incluindo 69 anteriores; T0003 **17/2**, T0004 **48/2**. SQLite 3.53.4, WAL, foreign_keys=1, synchronous FULL, busy_timeout=1000; foreign_key_check vazio. Incluem corrida em processos/conexões independentes, snapshot concorrente, rollback de writes/DDL e interrupção real antes/depois do commit/durante migração.

Navegador in-app no banco isolado .tmp/t0004-review/ignis.sqlite: câmera, Agent/edição/duplicidade, móvel/pedido explícito, troca cancelada/confirmada de categoria, rascunho após expiração, teclado/largura reduzida e retry explícito pós-commit/resposta perdida/reinício observados. Evidências recuperáveis e roteiro no relatório. V01-T4-24 recebeu PASS manual específico: versões 3→4, conflito da aba obsoleta após CSRF válido e versão 5 só após revisão. **MANUAL_INCONCLUSIVE histórico de T0003 permanece intacto.**

A [homologação complementar V01-T4-19](T0004_REPORT.md#homologacao-v01-t4-19) executou os três subcasos antes MANUAL_NOT_RUN: mudança controlada de epoch com rascunho e descarte cancelado/aceito; fechamento com intenção incerta e consulta após reabrir, sem duplicação ou recuperação de chave inventada; PATCH confirmado e GET isolado 503, com confirmação preservada e versão 2 consultada após restaurar GET. Todos PASS por interface e servidor; matriz atual com 24 casos PASS. Usado somente banco novo descartável .tmp/t0004-v19-20261024/discardable.sqlite (dataset operacional público, epoch 1→2); implementação/configurações/testes preservados. **Typecheck/build e suítes acima são resultados da retomada anterior, não reexecutados nesta homologação.** Sem outro SO, instalação limpa nova do driver, benchmark, auditoria completa de leitor de tela ou deploy.

Nenhum dado operacional anterior foi limpo/migrado nesta execução; apenas fixtures temporárias e bancos novos identificados foram usados. Processos de revisão e homologação encerrados; bancos/logs/PNGs/builds ignorados. Sem implementação T0005–T0020, mapa, telemetria ou design visual. J01, condições C01–C05 e ADRs Accepted — Conditional preservados.

Conferências documentais/Git finais: lista de modificados e novos, diff --check/status/stat, referências/âncoras, 20 tickets, integridade de fontes protegidas e SHA-256 comparado com o snapshot da retomada. Resultados e contagens finais no relatório de encerramento; nenhum staging, commit, merge, push ou deploy.


<a id="aceite-contratual-t0004"></a>
## Histórico — contrato/gate complementar aprovados antes da implementação T0004

**24/10/2026, America/Sao_Paulo.** Responsável pelo Sistema IGNIS ratificou exatamente R-T4-01–07 e aprovou os 12 critérios GF-T4-01–12 na instrução “IGNIS — T0004 | Formalização do aceite contratual R-T4-01–07 e do gate funcional complementar”. Autorização exclusivamente para registrar a decisão humana nos seis documentos; nenhuma autorização de implementação ou escrita Git.

| Registro | Estado vigente / fonte |
|---|---|
| R-T4-01–07 | HUMAN_RATIFIED, individualmente na [matriz técnica](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao), com temas, alcance, referências e limites |
| GF-T4-01–12 | HUMAN_APPROVED, preservando os 12 critérios do [gate complementar](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional-t0004) |
| T4-D05–T4-D08 | Diretrizes aprovadas e detalhadas; detalhes adicionais ratificados sem nova regra/valor |
| T0001–T0003 / T03-C / GF01–GF08 | DONE / HUMAN_ACCEPTED; política T03-C e aprovação funcional da fatia T0003 intactas |
| T0004–T0020 | PLANNED / NOT_AUTHORIZED; sem início de implementação |
| V01-T4-01–24 / J01 | Todos NOT RUN / J01 pendente; aceite documental não executa testes |
| ADRs / C01–C05 | Accepted — Conditional; estados/evidências/limitações anteriores preservados |

Interpretações expressamente aceitas: operational inicial de novo fixo somente por declaração explícita e cumprimento das precondições documentadas, jamais inferido de endereço/coordenadas/instalação/base; occupantCapacity é total de ocupantes incluindo condutor, com limites fictícios de demonstração sem validade regulatória. Manifesto de 14 perfis, políticas de manutenção, Agent/JF-06, localizações e estados preservados conforme documentados. Radar v1 não foi reescrito.

### Baseline e distinção entre execuções

Confirmados main e HEAD 236d2e27d17fbf27bc1368071b100b754b5f3dcd; somente seis documentos preexistentes modificados e nenhum staged. Diff inicial da preparação: 395 inserções/3 remoções, seis arquivos; não havia alterações inesperadas. Snapshot SHA-256 inicial de 69 arquivos permite conferir os 63 fora do escopo. As alterações anteriores foram preservadas: esta formalização acrescenta evidência do aceite, estados individuais e referências vigentes; não reabre schemas, critérios ou casos. A seção de preparação abaixo é histórica e suas pendências de ratificação foram sucedidas por este aceite.

### Obrigações técnicas preservadas

Backup consistente, evolução posterior à 0002, validação transacional de constraints/FKs/especializações, preservação de dados/IDs/versões/eventos/recibos, hashes antigos, banco vazio/upgrade, rollback e regressão dos 69 comportamentos aceitos permanecem futuros. As 24 linhas V01-T4 e critérios esperados não foram alterados. MANUAL_INCONCLUSIVE entre abas e V01-T3-13 PASS histórico permanecem separados; não houve defeito inferido. C01 conserva a instalação limpa em ambiente inteiramente novo não reproduzida, C02 oito grupos sem fechamento integral e C03–C05 seus gates.

Somente verificações documentais e Git nesta execução: links/âncoras, matrizes, 20 tickets, preservação dos contratos aceitos, SHA-256 dos demais arquivos, diff --check/status/stat e ausência de staged/commit. Nenhum código/teste/migration/configuração/dependência/ADR foi modificado; nenhum banco, build, teste de aplicação ou visual foi executado/criado. Resultados documentais finais são apresentados no relatório desta formalização.

Conferência documental observada: 18 Markdown/306 links locais válidos; 7/7 R-T4 HUMAN_RATIFIED e 12/12 GF-T4 HUMAN_APPROVED com critérios originais intactos; 24/24 linhas V01-T4 idênticas à preparação e NOT RUN; 14 perfis/14 políticas sem alteração; 20 tickets, aceites T0001–T0003, GF01–GF08 e T03-A/B/C preservados. SHA-256 confirmou 63/63 arquivos fora do escopo inalterados, sem arquivo novo/removido. git diff --check exit 0, somente aviso LF/CRLF em SYSTEM_DESIGN_FUNCTIONAL; main/HEAD mantidos e nenhum staged. O diff final contra HEAD inclui a preparação anterior e este registro de aprovação, discriminados nesta seção.

**T0004_CONTRACT_AND_FUNCTIONAL_GATE_HUMAN_APPROVED.** Próxima etapa: conferência documental e eventual commit específico sob autorização própria; posteriormente, eventual autorização individual para implementar T0004. Nenhuma dessas ações foi autorizada nesta formalização.


<a id="preparacao-t0004"></a>
## Histórico — preparação contratual de T0004, anterior à ratificação humana

Em **24/10/2026**, instrução humana “IGNIS — T0004 | Fechamento Contratual D05–D08 e Gate Funcional Complementar” aprovou diretrizes para detalhamento documental, sem aprovar automaticamente escolhas adicionais nem autorizar implementação. D05–D08 desta instrução são referidas como T4-D05–T4-D08 para preservar os D05–D07 históricos. **T0001/T0002/T0003 DONE / HUMAN_ACCEPTED; T0004–T0020 PLANNED / NOT_AUTHORIZED.**

### Baseline e inspeção

Observados main, HEAD **236d2e27d17fbf27bc1368071b100b754b5f3dcd**, log “236d2e2 feat: implement T0003 fixed radar inventory”, git status --short --branch = “## main”, sem alterações. T0003 e seu aceite estão versionados nessa baseline; relatos abaixo de trabalho ainda local/sem commit são históricos. Snapshot SHA-256 inicial dos 69 arquivos rastreados/não ignorados permite comparar os 63 fora dos seis documentos autorizados, sem alterar index/HEAD.

Lidos AGENTS, README/mapa, brief, tickets, contratos técnicos/funcionais, arquitetura, guia, pendências, relatório T0003, ADRs 0001–0003 e playbook. Inspeção somente leitura da migration 0002, inventory/prepare/maintenance/routes/service/contract, persistência, auth/CSRF, helper C02 e frontend. Limites observados: catálogo e projeção globais de radar, CHECKs de uma categoria/tipo/estado/causa/ação e UI de primeira categoria exigirão evolução explícita; não há Agent implementado.

### Entrega documental desta execução

Atualizados exclusivamente MVP_TECHNICAL_DESIGN, SYSTEM_DESIGN_FUNCTIONAL, VERIFICATION_GUIDE, TICKETS, REPO_CURRENT_STATE e KNOWN_ISSUES. [Seção técnica 12](MVP_TECHNICAL_DESIGN.md#t0004-contrato): manifesto de 14 perfis, política inicial por categoria, DTOs Agent e erros existentes preservados, localização heterogênea, estados iniciais propostos, plano sem SQL de migração posterior à 0002 e compatibilidade de bytes/recibos. Todos os detalhes novos estão PROPOSTA — PENDENTE DE RATIFICAÇÃO HUMANA, rastreados em [R-T4-01–07](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao).

[Complemento funcional](SYSTEM_DESIGN_FUNCTIONAL.md#t0004-funcional): seleção/troca explícita de categoria no rascunho, campos condicionais, lista/detalhe heterogêneos, JF-06 e recuperação/acessibilidade. **GF-T4-01–12 PENDING_HUMAN_APPROVAL**, sem ampliar GF01–GF08 HUMAN_APPROVED da fatia T0003. [V01-T4-01–24](VERIFICATION_GUIDE.md#v01-t4) preparados, todos **NOT RUN**. Não há nova rota executável, tabela, migration, dependência ou configuração criada.

### Verificações e limitações

Somente verificações documentais/Git: referências e âncoras locais, estrutura/consistência das matrizes, 20 definições de tickets, estados aceitos/não autorizados, novos casos NOT RUN, lista estrita de seis documentos, SHA-256 dos demais arquivos, index/HEAD, git diff --check, git status --short e git diff --stat. Resultados finais observados são apresentados no relatório desta execução; não são testes de aplicação.

Resultados observados: 18 Markdown/297 links locais sem erro; 14 perfis e 14 políticas correspondentes; 24 casos sequenciais com nove colunas e status NOT RUN; 12 critérios complementares/7 grupos de ratificação pendentes; 20 tickets únicos e três aceites preservados. Comparação com HEAD confirmou oito linhas GF01–GF08, 37 linhas V00-I/V01-T3 e todo o adendo normativo T03-A/B/C intactos. SHA-256 confirmou 63/63 arquivos fora dos seis autorizados inalterados, sem arquivo novo/removido. git diff --check exit 0; único aviso LF/CRLF em SYSTEM_DESIGN_FUNCTIONAL, sem erro de whitespace; index sem alterações staged e HEAD mantido em 236d2e2.

Não executados testes de aplicação, typecheck, build, migrations, backup ou abertura de banco. Os 69 testes/21 V00-I/16 V01-T3 PASS são evidências históricas aceitas de T0001–T0003, não nova reprodução. MANUAL_INCONCLUSIVE de concorrência entre abas e V01-T3-13 PASS permanecem separados; acompanhamento futuro não é bloqueio automático sem risco comprovado na integridade/interação.

J01 continua pendente; T0005–T0020 e design visual não autorizados. C01 conserva evidências Windows e instalação limpa em ambiente inteiramente novo não reproduzida; C02 mantém oito grupos sem encerramento integral; C03/C04/C05 e ADRs Accepted — Conditional preservados. Riscos: ratificação de mobilidades/atributos/causas/estados, reconstrução transacional de dependências SQLite com FKs ativas e replay de comandos anteriores; [registro](KNOWN_ISSUES.md#preparacao-t0004).

**Parecer: T0004_CONTRACT_READY_FOR_HUMAN_RATIFICATION.** Próxima etapa é ratificação humana do contrato e aprovação funcional complementar; implementação permanece não autorizada. Nenhum staging, commit, merge, push ou deploy realizado.


<a id="aceite-humano-t0003"></a>
## Histórico — aceite humano T0003 DONE / HUMAN_ACCEPTED, baseline então local

Decisão em **24/10/2026, horário de Brasília**, pelo responsável pelo Sistema IGNIS, na instrução “IGNIS — T0003 | Formalização do aceite humano”. Autorização exclusivamente documental. **T0001/T0002/T0003: DONE / HUMAN_ACCEPTED. T0004–T0020: PLANNED / NOT_AUTHORIZED.** T0003 está aceito, com implementação ainda local e sem commit. Branch main, HEAD `443c0665db0d7293254869f78a53727c4902fe3b`; as 15 alterações rastreadas e 15 entradas não rastreadas já existentes foram preservadas.

O responsável reproduziu no Windows, Node.js 24.22.1/npm 11.19.1: typecheck PASS, test:t0003 17/17 PASS, suíte completa 69/69 PASS, build PASS, regressões T0001/T0002 52/52 PASS e git diff --check sem erros, apenas avisos LF/CRLF. Também confirmou no Opera GX e Microsoft Edge: abertura, acesso correto/incorreto, encerramento/novo acesso, cadastro/lista/consulta/edição, persistência entre navegadores e após reinício, e rejeição de série duplicada. [Evidências humanas e alcance](T0003_REPORT.md#aceite-humano-t0003); os testes de aplicação não foram repetidos pelo agente neste registro.

**Concorrência manual entre abas: MANUAL_INCONCLUSIVE.** A primeira tentativa foi recusada por CSRF_FORBIDDEN antes da guarda de versão; a segunda atualizou o estado por autenticação e confirmou alterações sequenciais. Não foi reproduzida uma atualização efetivamente obsoleta nem observada sobrescrita indevida. Isso não é PASS manual nem defeito de integridade confirmado. V01-T3-13 automatizado continua PASS; observação residual registrada em [KNOWN_ISSUES](KNOWN_ISSUES.md#concorrencia-manual-t0003), sem novo ticket ou autorização de correção.

GF01–GF08 HUMAN_APPROVED, fixed_speed_radar v1 e T03-C ratificada preservados; 1–200 km/h continua parâmetro fictício sem validade regulamentar. J01 permanece pendente; design visual definitivo e funcionalidades posteriores não aceitos por este ato. C01 mantém a limitação de instalação limpa do driver em ambiente inteiramente novo não reproduzida; C02 mantém oito grupos V05-I sem fechamento integral, com parcela cadastral comprovada e integrações restantes pendentes. C03/T0007–T0012, C04/T0015 e C05/T0013–T0014 permanecem nos próprios gates; ADRs Accepted — Conditional intactos.

Somente os cinco documentos autorizados receberam o aceite; SHA-256 confirmou os 64 demais arquivos intactos, sem criar/remover arquivos. Os 20 tickets, critérios/dependências e linhas de verificação esperada foram preservados. Conferidos 18 Markdown/263 links locais válidos; git diff --check exit 0, sem erros, apenas avisos LF/CRLF. Status mantém as 15 alterações rastreadas e 15 entradas não rastreadas da implementação, com index/HEAD preservados. README, código, testes, configurações, migrations, dependências e fontes normativas não foram alterados nesta formalização. Os registros abaixo descrevem etapas anteriores; seus estados então não autorizados/aguardando revisão foram sucedidos pelo aceite acima somente para T0003. Nenhum staging, commit ou início de outro ticket nesta execução.

<a id="implementacao-t0003"></a>
## Histórico — entrega técnica de T0003, anterior ao aceite humano

**T0001/T0002: DONE / HUMAN_ACCEPTED. T0003: READY_FOR_HUMAN_REVIEW. T0004–T0020: PLANNED / NOT_AUTHORIZED.** Autorização humana individual: “IGNIS — T0003 | Implementação da Primeira Jornada do Inventário Inteligente”, recebida após o aceite GF01–GF08/T03-C versionado em `443c0665db0d7293254869f78a53727c4902fe3b`. Branch main, working tree inicialmente limpa. Não houve aceite humano de T0003, commit ou autorização de outro ticket.

Implementados somente os [contratos T03-A/B/C](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo): migration 0002 com categoria fixed_speed_radar v1 e identidade/versão/contexto; preparo operacional explícito/repetível separado de demo; inventário HTTP contextual; solicitação inicial opcional no domínio Maintenance, projeção/atomicidade; jornada Vue mínima JF-01–JF-05. [Relatório A–J](T0003_REPORT.md), [execução local](../README.md#executar-a-fundacao-t0001) e [autorização/estado do ticket](TICKETS.md#autorizacao-t0003). A migration 0001, autenticação/C02 normativos, design funcional e ADRs foram preservados. Nenhuma dependência adicionada; lockfile intacto.

Verificações observadas: typecheck PASS; build Vue/backend PASS; suíte completa **69 testes em 8 arquivos**, preservando os 52 anteriores; **16 V01-T3 PASS**, com teste adicional de limite por sessão (17 testes T0003/2 arquivos). SQLite 3.53.4/FKs/WAL/FULL/busy_timeout 1000. Migração de versão 1, repetição do preparo, rollback de cada write/commit, criação/edição concorrentes em processos reais, replay/contexto/CSRF e distribuição/reinícios comprovados. Jornada também exercitada no navegador com SQLite isolado: acesso, vazio, cadastro/detalhe/edição, duplicidade, conflito/revisão, perda de sessão, manutenção inicial e retry após indisponibilidade. Teclado e largura reduzida verificados; imagens locais referenciadas no relatório. Critérios do guia não foram relaxados.

Sem instalação limpa nesta execução, teste em outro SO, benchmark de carga, auditoria completa de acessibilidade/leitor de tela, design visual definitivo ou deploy. Nenhuma conclusão de J01: catálogo/agentes T0004 e mapa T0006 continuam futuros. C01 mantém suas limitações; C02 mantém oito grupos V05-I pendentes; C03/C04/C05 permanecem nos estágios correspondentes, sem alterar ADRs Accepted — Conditional.

Os documentos de design protegidos e os registros históricos abaixo descrevem as etapas anteriores; as afirmações de implementação então inexistente/não autorizada não substituem este estado vigente. Próxima etapa: revisão humana exclusiva de T0003; nenhum aceite ou autorização posterior presumido.

<a id="aceite-system-design-funcional-v11"></a>
## Histórico — aceite humano do System Design funcional v1.1, anterior à implementação

Decisão em **24/10/2026, horário de Brasília (America/Sao_Paulo)**, pelo responsável pelo Sistema IGNIS. Evidência: instrução “IGNIS — Formalização do aceite do System Design Funcional v1.1 — Ratificação T03-C e aprovação humana do gate GF01–GF08”. Esta execução autoriza exclusivamente seu registro nos quatro documentos indicados, sem implementação ou commit.

**T0001/T0002: DONE / HUMAN_ACCEPTED, concluídos, aceitos e versionados. GF01–GF08 da fatia T0003: HUMAN_APPROVED. T03-C: RATIFICADA PELO RESPONSÁVEL. T0003–T0020: PLANNED / NOT_AUTHORIZED.** [Matriz e alcance do aceite](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional); [backlog preservado](TICKETS.md#design-funcional-inventario).

O aceite abrange D01–D04 e JF-01–JF-05 somente na parcela aplicável à primeira categoria fixed_speed_radar v1, preservando os contratos existentes de segurança, sessão, contexto e concorrência. [T03-A/B/C](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo) continuam contratos preparados, agora com aceite funcional desta fatia; nenhum detalhe normativo foi redefinido. T03-C mantém not_installed, agenda opcional, pedido apenas explícito, atomicidade e projeção de Maintenance; ausência/desconhecido/não aplicável distintos, sem campo livre de Equipment ou intervenção T0012. 1–200 km/h permanece parâmetro exclusivamente fictício de demonstração, sem validade regulamentar.

**T0003 ainda não implementado.** Preparo operational, migrations, APIs, formulários, configuração/proxy e provas de integração permanecem pendentes, exigindo instrução humana específica posterior. Os [16 V01-T3](VERIFICATION_GUIDE.md#v01-t3-radar) continuam NOT RUN. JF-06 e ampliações de T0004/posteriores mantêm seus gates; J01 não concluído. Design visual não iniciado. Os textos de proposta preservados nas fontes técnica/guia/ticket registram a etapa anterior, sucedida por este aceite documental.

C01 mantém evidências Windows e a limitação de instalação limpa do driver em ambiente inteiramente novo não reproduzida na validação humana. C02 mantém 21 V00-I aprovados e oito grupos futuros pendentes; C03/T0007–T0012, C04/T0015 e C05/T0013–T0014 permanecem abertos nos respectivos estágios. ADRs Accepted — Conditional preservados. [Pendências](KNOWN_ISSUES.md#condicoes-do-aceite).

Baseline desta formalização: branch main, HEAD `f910bb0037522b94679d500807f5960b557df35a`; 54 arquivos rastreados/não ignorados. No início, cinco Markdown rastreados já modificados e SYSTEM_DESIGN_FUNCTIONAL não rastreado, referentes ao design e fechamento T03-A/B/C. O documento funcional ainda não foi versionado; nenhum commit intermediário presumido. Todas essas alterações anteriores foram preservadas. Somente SYSTEM_DESIGN_FUNCTIONAL, TICKETS, REPO_CURRENT_STATE e KNOWN_ISSUES recebem o registro atual.

Verificações desta formalização: 17 Markdown, 233 links locais válidos e cercas balanceadas; oito critérios HUMAN_APPROVED no alcance definido; 20 definições de tickets e JF-06 textualmente preservados; 16 V01-T3 ainda NOT RUN. SHA-256 confirma os 50 arquivos fora do escopo intactos, incluindo código, configurações, dependências, ADRs e as alterações anteriores do design técnico/guia; nenhum arquivo criado/removido nesta execução. Condições C01–C05, HEAD e index preservados. git diff --check sem erros (exit 0); status mantém cinco Markdown rastreados modificados e SYSTEM_DESIGN_FUNCTIONAL não rastreado, excluído do diff --stat. Nenhum teste de aplicação, build, migration, provisionamento, instalação, mudança de código/configuração/dependências/ADRs, staging ou commit realizado. Próxima etapa: revisão documental e commit específico sob autorização correspondente, antes de considerar autorização individual de T0003.

**Parecer: T0003_FUNCTIONAL_GATE_HUMAN_APPROVED.**

<a id="fechamento-contratual-t03"></a>
## Histórico — contrato T03-A/B/C preparado, antes do aceite humano

**T0001/T0002: DONE / HUMAN_ACCEPTED. T0003–T0020: PLANNED / NOT_AUTHORIZED.** Autorização exclusiva: “IGNIS — T0003 | Fechamento contratual direcionado T03-A/B/C”, somente documentação/parecer. Branch main, HEAD `f910bb0037522b94679d500807f5960b557df35a`, com três Markdown modificados e SYSTEM_DESIGN_FUNCTIONAL não rastreado já no início; 54 arquivos rastreados/não ignorados. Nenhum commit intermediário presumido.

[Adição contratual mínima 11](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo) preparada sob autorização expressa: fixed_speed_radar v1 e DTOs/validações/null/defaults/versões/referências determinísticas; preparo local operational separado do demo, epoch/grant/ator e referência pública sem descoberta; política demonstrativa proposta de agenda opcional e pedido preventivo inicial somente explícito, com projeção e atomicidade existentes. Nenhum limite de demonstração é apresentado como regulamentar real; política não declarada aprovada individualmente.

**T03-A/B/C: contratos documentais prontos para revisão, implementação futura. Parecer: T0003_FUNCTIONAL_GATE_READY_FOR_HUMAN_APPROVAL.** Somente GF03/GF04/GF05 foram reavaliados para READY_FOR_HUMAN_APPROVAL; GF01/GF02/GF06/GF07/GF08 preservados. O responsável ainda deve ratificar/revisar o contrato (especialmente a política demonstrativa proposta) e decidir o aceite do gate, separadamente de eventual autorização de T0003. Não se exige executar provisão real para avaliar este contrato, e não se declara o código existente.

Definidos [16 casos V01-T3](VERIFICATION_GUIDE.md#v01-t3-radar), todos NOT RUN. Fonte de tipos/regras permanece no design técnico; design funcional usa referência cruzada e comportamento de UI. TICKETS explicita somente o mínimo cadastral autorizável correspondente, sem novo ticket ou antecipação de intervenções; 19 outras definições preservadas e todos os estados de tickets mantidos. KNOWN_ISSUES rastreia contrato pronto e validação humana/prova futura.

Verificações documentais PASS: 17 Markdown e 225 links locais válidos, cercas balanceadas e sem whitespace indevido; JF-06 e os cinco critérios GF não reavaliados textualmente preservados. 20 tickets mantidos, somente a definição de T0003 recebeu referências/escopo cadastral mínimo correspondente ao adendo; 19 outras definições e todos os estados preservados. Os 16 V01-T3 continuam NOT RUN e os 21 V00-I originais intactos. SHA-256 preservou 48 arquivos fora do escopo; seis Markdown autorizados revisados, nenhum arquivo criado/removido nesta execução; HEAD/index preservados. Os textos anteriores completos do design técnico/guia permanecem, com adições identificadas. `git diff --check`: exit 0, sem saída. Status: cinco Markdown rastreados modificados e SYSTEM_DESIGN_FUNCTIONAL ainda não rastreado, sem staging; git diff --stat não inclui esse arquivo. Sem aplicação, build, teste, migrations/seed/bootstrap, alterações de código/configuração/dependências/ADRs, banco, design visual ou commit.

<a id="system-design-funcional-v11"></a>
## Histórico — System Design funcional v1.1: diretrizes aprovadas, gate então não pronto

**T0001/T0002: DONE / HUMAN_ACCEPTED. T0003–T0020: PLANNED / NOT_AUTHORIZED.** Arquitetura/ADRs preservados. Autorização: “IGNIS — SYSTEM DESIGN FUNCTIONAL v1.1 — Formalização das decisões D01–D04 e preparação do gate de T0003”, exclusivamente documental; as quatro diretrizes foram aprovadas pelo responsável, sem autorizar implementação, aceite automático do gate ou commit.

Baseline: main, HEAD `f910bb0037522b94679d500807f5960b557df35a`; 54 arquivos rastreados/não ignorados. Trabalho local v1.0 já existente: KNOWN_ISSUES, TICKETS e este estado modificados; SYSTEM_DESIGN_FUNCTIONAL ainda não rastreado. Nenhum commit intermediário presumido.

Atualizado [SYSTEM_DESIGN_FUNCTIONAL v1.1](SYSTEM_DESIGN_FUNCTIONAL.md): radar de velocidade fixo; matriz verificável N/H/S/O/P de campos/edição/nulabilidade/limites conhecidos; referência pública local de build e integração futura de mesma origem; manutenção inicial sem solicitação automática, preservando not_installed, agenda/necessidade separadas e unidade atômica normativa. JF-01–JF-05, estados, rastreabilidade e GF01–GF08 atualizados; JF-06 reservada a T0004 e preservada. Nenhum novo endpoint, valor regulamentar, sensor, default de domínio, schema normativo ou configuração executável criado.

**D01–D04: APPROVED — TECHNICAL DETAIL PENDING.** As diretrizes e a escolha da categoria estão confirmadas; o encerramento integral não é declarado enquanto restarem os detalhes técnicos impeditivos [T03-A/B/C](SYSTEM_DESIGN_FUNCTIONAL.md#decisoes-pendentes): perfil do radar/referências, existência/provisionamento do alvo operational/grant (T0002 só provisiona local-demo do tipo demo), perfil/entrada inicial de manutenção e agenda. Recomendado o menor detalhamento futuro sob autorização específica, sem nova decisão humana de escolha já aprovada nem correção silenciosa de contrato.

**Parecer: T0003_FUNCTIONAL_GATE_NOT_READY.** GF03/GF04/GF05: PENDING_TECHNICAL_CLARIFICATION; GF01/GF02/GF06/GF07/GF08: READY_FOR_HUMAN_APPROVAL. Nenhum critério/gate HUMAN_ACCEPTED ou APPROVED. O gate parcial T0003 não encerra J01. O responsável decidirá a próxima autorização e, posteriormente, o aceite final do gate; esta execução termina na entrega documental.

Verificações documentais PASS: 17 Markdown, 214 links locais válidos, cercas balanceadas e ausência de whitespace indevido nos quatro documentos; seis jornadas/13 regras rastreáveis, JF-06 textualmente preservada, quatro decisões e oito critérios GF com estados explícitos. Os 20 blocos de tickets continuam textualmente iguais ao HEAD; T0003 e posteriores não autorizados. SHA-256 confirmou os mesmos 50 arquivos protegidos; nenhum arquivo criado/removido nesta revisão, HEAD/index preservados. Somente os quatro documentos autorizados foram revisados. `git diff --check`: exit 0, sem erros. Status mantém três Markdown modificados e SYSTEM_DESIGN_FUNCTIONAL não rastreado, como no início. `git diff --stat` reflete os três documentos rastreados desde o HEAD; não inclui o design ainda não rastreado. Sem aplicação, build, teste de aplicação, instalação, alteração de banco/configuração/código, design visual, staging ou commit.

<a id="system-design-funcional-v1"></a>
## Histórico — System Design funcional mínimo v1.0

**T0001/T0002: DONE / HUMAN_ACCEPTED e versionados. T0003–T0020: PLANNED / NOT_AUTHORIZED.** Arquitetura ARCHITECTURE_APPROVED_CONDITIONAL e ADRs Accepted — Conditional preservados. A instrução humana “IGNIS — SYSTEM DESIGN FUNCTIONAL v1.0 — Especificação funcional mínima antes de T0003” autorizou exclusivamente documentação de jornadas, navegação, campos, estados, erros e critérios funcionais; não autorizou implementação, design visual, testes de aplicação, dependências, alterações normativas ou commit.

Baseline observado: branch `main`, HEAD `f910bb0037522b94679d500807f5960b557df35a`, working tree limpa, 53 arquivos rastreados. A entrega/aceite de T0002 já está versionada; os status Git das seções históricas abaixo descrevem aquelas execuções.

Produzido [SYSTEM_DESIGN_FUNCTIONAL.md](SYSTEM_DESIGN_FUNCTIONAL.md), com fronteira Architecture/Design funcional/Design visual, capacidades reais T0001/T0002, persona operacional sem RBAC adicional, navegação textual, JF-01–JF-06, matriz de dados, estados/validações/mensagens, segurança/retry/concorrência, acessibilidade, rastreabilidade e critérios do gate. Distinção explícita: T0003 é uma categoria básica; T0004 amplia catálogo/agentes/localização; T0005/T0006 e demais jornadas mantêm gates próprios. Nenhuma interface, imagem ou código produzido.

**Parecer: FUNCTIONAL_DESIGN_READY_FOR_REVIEW. Gate funcional: PENDING_HUMAN_REVIEW.** Documento concluído não é aprovação humana nem autorização de T0003. D01–D04 requerem decisão/revisão antes da liberação da fatia: categoria inicial, entrada do contexto, schemas/referências mínimos e necessidade/agenda inicial. D05–D07 preservam dependências posteriores e recomendações de sincronização documental sem alterar fontes protegidas. Referências responsáveis: [gate e critérios](SYSTEM_DESIGN_FUNCTIONAL.md#gate-funcional), [pendências](KNOWN_ISSUES.md) e [backlog](TICKETS.md#design-funcional-inventario).

Atualizados somente TICKETS, KNOWN_ISSUES e este estado para registrar existência/dependências/gate pendente. README, AGENTS, ADRs, PROJECT_BRIEF, SYSTEM_ARCHITECTURE, MVP_TECHNICAL_DESIGN, VERIFICATION_GUIDE, relatórios T0001/T0002 e toda implementação/configuração/dependências permanecem preservados. C01 mantém evidências humanas Windows e limite de instalação em ambiente novo não reproduzida; C02 mantém 21 V00-I aprovados e oito integrações futuras pendentes; C03/C04/C05 continuam nos tickets correspondentes.

Verificações documentais PASS: 17 Markdown, 213 links locais com destinos/âncoras válidos e cercas balanceadas; seis jornadas e matriz de 13 regras funcionais revisadas contra seus contratos/tickets. Os 20 blocos de definição de tickets permanecem textualmente iguais ao HEAD; nenhum estado de ticket foi alterado. Comparação SHA-256 preservou os 50 arquivos fora dos três documentos existentes autorizados para atualização; somente SYSTEM_DESIGN_FUNCTIONAL foi criado, sem remoção de arquivos. Após corrigir três âncoras na checagem inicial, a verificação final não apresentou erros. `git diff --check` passou sem saída; status: três Markdown modificados e um novo, sem staging, HEAD/index preservados. Sem build, teste de aplicação, instalação, escrita em schema, commit ou publicação; critérios de interação continuam NOT RUN.

<a id="aceite-humano-t0002"></a>
## Histórico — encerramento formal de T0002 em 24/10/2026

**T0001 e T0002: DONE / HUMAN_ACCEPTED. T0003–T0020: PLANNED / NOT_AUTHORIZED.** Arquitetura ARCHITECTURE_APPROVED_CONDITIONAL e ADRs Accepted — Conditional preservados. Na instrução “IGNIS — Encerramento formal de T0002”, o responsável pelo Sistema IGNIS aprovou formalmente T0002, considerando o relatório de implementação e sua validação independente no Windows. Autorizou exclusivamente o registro documental desse aceite, sem testes adicionais, instalações, mudanças de código/configuração/dependências/ADRs, execução de outro ticket ou commit.

As evidências abaixo foram **informadas pelo responsável**, não executadas novamente pelo agente neste encerramento:

| Evidência humana reproduzida | Resultado informado |
|---|---|
| Ambiente Windows | Node.js 24.22.1 e npm 11.19.1 |
| `npm run typecheck` | PASS |
| `npm run test:t0002` | PASS — 33 testes em 4 arquivos |
| `npm test` | PASS — 52 testes em 6 arquivos |
| `npm run build` | PASS |
| SQLite efetivo / PRAGMAs, confirmados pelos testes | 3.53.4; foreign keys habilitadas; WAL; synchronous FULL; busy_timeout 1000 |
| Regressão T0001 | 19 testes permanecem aprovados |
| `git diff --check` | Sem erros |

**Limite da validação humana:** a instalação limpa do driver nativo em um ambiente inteiramente novo **não foi reproduzida**. A reinstalação pelo lockfile/cache e o aviso nativo relatados na implementação abaixo continuam como evidências daquela execução, sem serem promovidos a reprodução humana em máquina/ambiente novo.

**Condições preservadas:** C01 possui evidências técnicas reproduzidas no Windows; não se amplia a evidência a outros ambientes ou à distribuição final. C02 possui os **21 V00-I aprovados**, com **oito grupos de integração futura pendentes/NOT RUN**; a condição integral não é encerrada pelo aceite da fundação. C03 continua pendente em T0007/T0012, C04 em T0015 e C05 em T0013/T0014, com seus gates contratuais/técnicos. T0003 e todos os tickets posteriores continuam sem autorização de implementação; System Design mantém autorização/gate próprios.

**Integridade e Git deste registro:** baseline `main`, HEAD `a07e25bd4341352bff277b2c167f10bf603871fb`, com o trabalho local da implementação já presente (12 modificados e 17 novos). Alterados somente README, TICKETS, KNOWN_ISSUES, VERIFICATION_GUIDE, relatório T0002 e este estado. Os outros 47 arquivos rastreados ou não ignorados foram preservados por comparação SHA-256 antes/depois, incluindo código, testes, manifests/lockfile, configurações e ADRs. Nenhum arquivo criado/removido; HEAD e index preservados. Verificações exclusivas de documentação/integridade/Git, sem novos testes de aplicação; `git diff --check` sem erros e status final com os mesmos 12 modificados/17 novos, sem staging/commit.

<a id="implementacao-t0002"></a>
## Histórico — implementação de T0002

O parecer READY_FOR_HUMAN_REVIEW e as referências a aceite pendente nesta seção descrevem a entrega técnica anterior. Foram superados somente pelo aceite humano registrado acima; as evidências e limitações da implementação permanecem preservadas.

**T0001: DONE / HUMAN_ACCEPTED, preservado e versionado. T0002: IMPLEMENTED / READY_FOR_HUMAN_REVIEW, sem aceite humano. T0003–T0020: PLANNED / NOT_AUTHORIZED.** Arquitetura ARCHITECTURE_APPROVED_CONDITIONAL; ADRs Accepted — Conditional preservados. A instrução humana “IGNIS — T0002 | Implementação da Fundação de Persistência e Integridade” autorizou exclusivamente implementação, documentação e verificação de T0002, executadas em 23–24/10/2026. Não autorizou commits, outros tickets ou System Design.

**Baseline conferido antes de editar:** `main`, HEAD `a07e25bd4341352bff277b2c167f10bf603871fb`, `docs: finalize T0002 idempotency contract`, working tree limpa. T0001 e preparação contratual de C02 já versionados. O mapeamento dos 21 V00-I para componentes/testes foi feito antes do código. Não foi identificada contradição normativa impeditiva. Contratos, ADRs, AGENTS, frontend e relatório/aceite histórico de T0001 foram preservados.

**Entrega real:** driver better-sqlite3 e migration SQL inicial explícita, versionada por checksum; arquivo persistente `data/ignis.sqlite` ou DATABASE_PATH; operador local estável, sessão/capability com cookie/CSRF, grants de dataset e validação de epoch; readiness; parser JSON estrito, normalização tipada/JCS/SHA-256; helper transacional de recibos com resposta original/cabeçalho de replay, conflito e rollback. WAL/FKs/FULL/busy_timeout verificados em cada conexão. Ação `verification.receipt.v1` apenas na suíte; não há endpoint público dessa ação nem dados/tabelas de domínio futuro. Boot não migra automaticamente.

**Evidência observada:** Node 24.22.1/npm 11.19.1; SQLite efetivo 3.53.4. Instalação limpa pelo lockfile PASS, com aviso npm sobre script nativo não aprovado; prebuild Windows carregado e testado após reinstalação. Faixa npm ajustada a `>=11.19.1 <13` e packageManager 11.19.1, resolvendo P14 no ambiente validado. Nenhuma instalação global alterada. `npm run typecheck`, `npm run build`, `npm test` (**52 testes/6 arquivos**) e `npm run test:t0002` (**33 testes/4 arquivos**) PASS; os **21 V00-I PASS** e os 19 testes T0001 continuam passando. Testes incluem duas conexões/processos reais com barreiras, queda antes/depois do commit, busy 503, integridade SQL, autorização, reinício e revogação HTTP real. `npm audit`: zero vulnerabilidades informadas.

`npm run db:migrate` foi executado e repetido no caminho padrão, mantendo IDs. Gerou somente bootstrap técnico em arquivo ignorado pelo Git; nenhum inventário/cenário. `npm start` e `npm run dev` responderam página/live/ready, incluindo proxy Vite; Ctrl+C encerrou processos e bind confirmou portas 3000/5173 livres. Testes compilados comprovaram banco ausente/incompatível, ausência de automigração e sessão persistente entre reinícios. Resultados, comandos, arquivos e limitações completos no [relatório A–I](T0002_REPORT.md).

**Condições:** C01 tem evidência técnica aplicável no Windows aguardando revisão humana; outros alvos e distribuição final V11 NOT RUN. C02 tem a fundação e 21 V00-I comprovados; oito V05-I de integração continuam NOT RUN, sem encerrar a condição integral. C03/C04 mantêm revisão específica antes de T0007/T0015; C05 mantém avaliação futura T0013/T0014. Nenhum outro ticket iniciado, autorizado ou implementado; System Design funcional mínimo continua gate próprio antes de T0003.

**Git:** 12 arquivos rastreados modificados e 17 novos, todos locais e sem staging; `git diff --check` sem erros. Branch/HEAD preservados, nenhum commit, branch nova, merge, push ou deploy. A entrega termina em READY_FOR_HUMAN_REVIEW; o responsável decidirá o aceite após revisar/reproduzir as evidências.

<a id="preparacao-contratual-t0002"></a>
## Histórico — preparação contratual de T0002 em 23/10/2026

As afirmações de ausência de autorização/implementação e testes NOT RUN nesta seção descrevem a preparação anterior, superada pela autorização individual e evidências acima.

**Escopo humano desta execução:** exclusivamente documentação, conforme “IGNIS — T0002 | Preparação Contratual e Fechamento de Idempotência”. **T0001 permanece DONE / HUMAN_ACCEPTED e versionado; T0002–T0020 permanecem PLANNED / NOT_AUTHORIZED.** Arquitetura ARCHITECTURE_APPROVED_CONDITIONAL e ADRs Accepted — Conditional preservados. Nenhuma implementação de T0002, instalação, migração, seed, build, teste de aplicação, System Design ou operação Git de escrita autorizada/executada.

**Git inicial observado:** branch `main`, HEAD `8d16cb1be741ac082a8a160fc50c3fd012326653`, mensagem `feat: complete T0001 executable foundation`; `git status --porcelain=v1` vazio, 36 arquivos rastreados e zero untracked. O commit versionou a entrega/aceite de T0001 antes desta execução; os HEADs anteriores no histórico abaixo não representam o baseline atual. Código foi consultado somente para confirmar ausência de persistência/idempotência e contratos de health/configuração; manifests e todos os arquivos fora da lista humana foram preservados.

**Ambiguidades documentais encontradas:** I02 não definia composição da chave/representação; seções 4/5 misturavam input de evento com metadados/tempo derivado, excluindo só receivedAt; CommandReceipt não detalhava dados mínimos e ordem de consulta; seção 6 exigia resposta original, enquanto o pipeline usava duplicate sem distinguir replay de disposition. Validar versão/estado antes de ler recibo também poderia rejeitar retry legítimo. As fontes e limites por ticket foram conferidos antes de editar.

**Entrega documental:** [contrato C02](MVP_TECHNICAL_DESIGN.md#idempotencia), [Ce/Ke/Ks de eventos](MVP_TECHNICAL_DESIGN.md#identidade-eventos), [matriz V00-I](VERIFICATION_GUIDE.md#v00-idempotencia) e [integrações V05-I](VERIFICATION_GUIDE.md#v05-idempotencia). Chave contextual por principal/ação; alvo e precondições do cliente entram no hash, metadados/tempos de processamento ficam fora; normalização tipada + JCS + SHA-256; recibo/efeito na mesma transação SQLite; replay original antes de precondições mutáveis de domínio, sempre após autorização/contexto. Não foram criadas APIs, tabelas ou camadas genéricas. Código e testes continuam os de T0001.

Somente cinco documentos alterados: MVP_TECHNICAL_DESIGN (norma), VERIFICATION_GUIDE (casos/entradas/resultados esperados), TICKETS (referências/gates e divisão de responsabilidade), KNOWN_ISSUES (situação de C02/riscos) e este estado (evidência da execução). Nenhum novo documento ou ticket. Relatório T0001 e seu aceite humano foram preservados; o registro abaixo permanece como histórico de suas evidências.

**Parecer: T0002_CONTRACT_READY**, sem outro bloqueio documental identificado para o escopo limitado da fundação. A preparação/revisão documental de C02 não encerra sua parte técnica nem aprova o ADR sem condições. T0002 implementará recibo/contexto/guardas e comprovará driver Windows/SQLite efetivo corrigido, WAL/FKs/rollback/durabilidade e concorrência. C01 permanece parcial, C02 técnica NOT RUN, C03 e C04 exigem revisões específicas antes de T0007/T0015, C05 continua pendente em T0013/T0014. System Design não é pré-requisito de T0002; continua gate próprio antes de T0003. Implementar T0002 exige **nova autorização humana inequívoca**, não inferida deste parecer.

**Verificações documentais PASS:** 15 Markdown, 174 links locais com destinos/âncoras válidos e cercas balanceadas; 20 tickets mantidos, com os 19 fora de T0002 textualmente iguais ao HEAD; 21 casos V00-I sem IDs duplicados; seções de estados e missões preservadas; vetor literal de 200 bytes/digest conferido sem implementar canonicalizador; SHA-256 dos 31 arquivos fora da lista autorizada inalterado; `git diff --check` sem erros. Revisão semântica conferiu identidade/normalização/replay/atomicidade e fronteiras entre tickets. Testes V00-I/V05-I, driver/SQLite e aplicação continuam NOT RUN. Fontes primárias de JCS/SQLite/Node consultadas para a especificação, não como substituto de testes. Estado Git final: somente os cinco Markdown autorizados modificados, sem staging/commit ou alteração do HEAD.

<a id="aceite-humano-t0001"></a>
## Histórico — encerramento formal de T0001 em 23/10/2026

Registro do aceite humano e das execuções anteriores. A implementação de T0002 e o Git vigentes estão na primeira seção; afirmações sobre baseline/arquivos pendentes nesta seção descrevem aquelas execuções.

Arquitetura permanece **`ARCHITECTURE_APPROVED_CONDITIONAL`**. Autorização de implementação anterior e exclusiva: “IGNIS — T0001 | Implementação da fundação executável”, recebida em 23/10/2026. Dependência ADR-0001 Accepted — Conditional conferida na implementação. **T0001: DONE / HUMAN_ACCEPTED. T0002–T0020 continuam PLANNED / NOT_AUTHORIZED.**

**Aceite humano:** em 23/10/2026, o responsável pelo projeto aprovou formalmente T0001 na instrução “IGNIS — Encerramento formal do T0001”, considerando o relatório e sua validação independente no Windows. Evidências abaixo são declaradas pelo responsável, não novos testes executados pelo agente nesta formalização:

| Evidência humana | Resultado informado |
|---|---|
| Ambiente Windows | Node.js 24.22.1; npm 11.19.1 |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 19 testes em 2 suítes |
| Build frontend/backend | PASS |
| Smoke de execução, reinicialização e conflito de porta | PASS |

O npm **11.19.1** da validação humana é distinto do npm **12.2.1** usado pelo agente na implementação. Esse registro preserva ambas as evidências, sem alterar manifests/lockfile ou declarar instalação com npm 11 verificada: a faixa npm declarada no manifest continua `>=12.2.1 <13`. O aceite não autoriza corrigir ou ampliar essa faixa nesta formalização.

Esta execução altera somente documentos para registrar o aceite; não executa testes de aplicação, instalações, builds, código ou T0002. Verificações documentais: revisão de consistência e `git diff --check`; implementação/configurações e ADRs preservados por comparação SHA-256 antes/depois. Sem commit ou staging. O Git já contém as alterações locais da entrega T0001, preservadas.

Baseline confirmado antes de editar: `main`, HEAD `995c9ef docs: formalize conditional architecture approval`, working tree limpa, 14 Markdown versionados, nenhum remoto. Git foi preservado: sem init, add, commit, branch nova, merge, push ou deploy. As alterações desta execução permanecem locais, sem staging.

Entregue somente fundação: npm workspaces `apps/server` e `apps/web`, TypeScript estrito, Fastify com `GET /health/live`, Vue técnico sem CSS/identidade visual, build web e servidor, estáticos servidos pelo backend, configuração loopback/porta e testes HTTP/processo. O payload live mínimo é `{"status":"ok"}`; não comprova readiness, persistência ou operação de domínio. Versões diretas fixadas e lockfile presente; exclusões criadas antes das instalações. Não há banco, migration, seed, CRUD, mapa, simulador, predição, missão, sessão ou System Design.

Ambiente observado: Windows `10.0.26200`, x64; PATH original Node `20.15.0`/npm `10.7.0`. Verificação usou Node **24.22.1** já disponível no runtime do Codex e npm **12.2.1** em `.tmp/tooling`, selecionados apenas no PATH dos comandos. Instalação global preservada. Versões e compatibilidade: [relatório T0001](T0001_REPORT.md#b-dependencias).

Resultados: instalação e reinstalação pelo lockfile, tipos, build frontend/backend, **19 testes em dois arquivos**, navegação real pela página construída e `/health/live`, desenvolvimento Vite/backend e proxy HTTP verificados. Processos parados por Ctrl+C; portas 3000/5173 liberadas e verificadas por bind. Build web repetido após reinstalação produziu o mesmo asset `index-DYNS9fGC.js`. Testes/instalação tiveram falhas iniciais corrigidas e restrições objetivas do sandbox; ver [tabela de evidências](T0001_REPORT.md#d-verificacao). Lint separado, SQLite/readiness e V01–V11 de features: NOT RUN.

Na implementação, a documentação foi sincronizada apenas nos registros afetados: README, regras de autorização por referência em AGENTS, introdução do design técnico, tickets, guia, pendências, este estado e relatório. Neste encerramento, somente README, TICKETS, este estado, relatório, guia e pendências recebem o aceite humano. ADRs, arquitetura, brief e playbook preservados. [P13/P14](KNOWN_ISSUES.md#defasagens-documentais-fora-desta-execucao) mantêm defasagens fora de escopo e o registro dos ambientes. C01 está verificada e aceita somente no estágio T0001; driver/SQLite e C02–C05 continuam pendentes. T0001 encerrado; qualquer próximo ticket exige autorização humana individual e seus gates, sem autorização inferida para T0002.

## Histórico — formalização anterior à execução de T0001

Os relatos abaixo preservam evidências anteriores; suas afirmações de ausência de código ou autorização não descrevem a entrega vigente acima.

**`ARCHITECTURE_APPROVED_CONDITIONAL`**. Responsável pelo projeto aprovou arquitetura com condições na instrução humana “IGNIS — Formalização da Aprovação Arquitetural”, seções 1–2. ADR-0001/0002/0003: **Accepted — Conditional**. Revisão arquitetural encerrada; correções contratuais e verificações técnicas continuam pendentes conforme [C01–C05](KNOWN_ISSUES.md#condicoes-do-aceite). **Todos os 20 tickets: PLANNED / NOT_AUTHORIZED; T0001 não iniciado nem executado.**

### Git observado antes de editar

- `git status --short --branch`: `## main`, sem alterações.
- `git log --oneline -5`: somente `bc60368 docs: approve conditional IGNIS architecture`; nenhuma alteração/commit posterior encontrado.
- `git diff --stat bc60368`: vazio antes das edições.
- `git ls-files`: 14 documentos Markdown versionados; `git remote -v`: sem saída, nenhum remoto configurado.
- Baseline anterior à formalização dos status dos ADRs; preservada. Nenhum init, troca/criação de branch, add, commit, merge, push ou alteração de histórico nesta execução.

### Entrega desta formalização

Alterados somente dez documentos autorizados: AGENTS.md; docs/adr/0001-monolito-stack-persistencia.md; docs/adr/0002-eventos-snapshots-e-isolamento.md; docs/adr/0003-predicao-explicavel-e-missoes.md; docs/adr/README.md; docs/KNOWN_ISSUES.md; docs/TICKETS.md; este documento; docs/MVP_TECHNICAL_DESIGN.md; docs/VERIFICATION_GUIDE.md. Nenhum arquivo novo. README, arquitetura, brief e playbook preservados; defasagens dos três primeiros registradas como P13 em KNOWN_ISSUES por estarem fora do escopo autorizado.

O aceite mantém F01–F09 e os 20 tickets, stack e separação Architecture/Design. Distribuição local mínima obrigatória; publicação pública adicional sujeita à viabilidade/autorização própria. System Design funcional mínimo deve ser preparado/aprovado antes de T0003 e não bloqueia T0001/T0002; nenhum System Design produzido nesta execução.

Correções detalhadas C02/C03/C04 não foram resolvidas por este registro. Antes de T0002/T0007/T0015, respectivamente, exigem revisão documental específica; verificações técnicas ocorrem somente após autorização individual dos tickets. Próxima ação possível é revisão humana deste diff e eventual autorização separada do segundo commit documental; nenhuma operação Git de escrita foi autorizada. T0001 exige autorização humana individual posterior e não inicia automaticamente.

Sem código, instalações, migrations, seeds, builds, testes de aplicação, interfaces ou deploy nesta execução. Gates de aplicação permanecem NOT_RUN. Evidências documentais atuais e diff final são registrados abaixo; relatos seguintes descrevem inspeções anteriores, não o estado vigente.

### Verificações documentais desta formalização

Checagem por leitura, executada diretamente na sessão, sem criar scripts: **14 Markdown; 20 tickets T0001–T0020 com campos obrigatórios; grafo de 20 nós sem ciclos/dependências desconhecidas; três ADRs Accepted — Conditional; zero erros em destinos/âncoras de links locais e cercas Markdown**. Comparação `git diff --name-only bc60368` confirmou exatamente os dez documentos autorizados; `git ls-files --others --exclude-standard` não encontrou arquivos novos. Revisão semântica do diff conferiu os cinco registros C01–C05, preservação F01–F09/stack/20 tickets, distinção entre aceite/pendência/autorizações e gates de System Design. `git diff --check` passou sem saída.

Estado final: branch `main`, baseline/HEAD `bc60368`, dez arquivos modificados sem staging; nenhum commit novo e nenhum remoto. O relatório final apresenta `git status` e `git diff --stat`. Testes de aplicação, compatibilidade, validação preditiva e renderização visual não realizados; não há aplicação. Condições técnicas permanecem pendentes e gates NOT_RUN. **T0001 continua não executado.**

## Histórico — inspeção inicial anterior às alterações

- `Get-Location`: confirmou o diretório de trabalho acima.
- `Get-ChildItem -Force` e contagem de entradas: pasta vazia, inclusive sem arquivos ocultos encontrados.
- `rg --files --hidden` com exclusão de diretórios de dependências: nenhum arquivo encontrado. O exit code de busca sem resultados não significa falha de build.
- `git status --short`: retornou `fatal: not a git repository (or any of the parent directories): .git`. `Test-Path .git`: false. **Não existe Git inicializado; branch atual e working tree não se aplicam.** Não foi inicializado Git.
- Verificação de `AGENTS.md` nos caminhos ancestrais consultados (Desktop, usuário, raiz) não encontrou instruções locais adicionais. Nenhuma decisão anterior, convenção, dependência ou código encontrado no workspace.
- `Get-Content` leu a diretriz anexada fora do workspace. Esse anexo foi usado como entrada, sem alteração. Requisitos da competição foram tratados como informados, sem confirmação independente do regulamento.

Não houve material anterior para sobrescrever nem divergência documental preexistente a resolver. A nomenclatura IGNIS segue a diretriz específica; F.O.G.O. é referência histórica.

## Histórico — entrega documental inicial

Estrutura resultante esperada e conferida na revisão final:

```text
README.md
AGENTS.md
docs/
  PROJECT_BRIEF.md
  SYSTEM_ARCHITECTURE.md
  MVP_TECHNICAL_DESIGN.md
  TICKETS.md
  REPO_CURRENT_STATE.md
  VERIFICATION_GUIDE.md
  KNOWN_ISSUES.md
  CODEX_PLAYBOOK.md
  adr/
    README.md
    0001-monolito-stack-persistencia.md
    0002-eventos-snapshots-e-isolamento.md
    0003-predicao-explicavel-e-missoes.md
```

Estado: **`ARCHITECTURE_REVIEW`**. Fonte de escopo, decisões, contratos e demais responsabilidades documentais estão no [índice](../README.md). Stack recomendada não equivale a dependência instalada. Todos os ADRs permanecem Proposed.

## Histórico — código, execução e validação inicial

| Item | Estado observado |
|---|---|
| Código funcional/componentes/APIs/ORM/migrations/scripts | Inexistentes; não criados |
| Manifest, lockfile, configuração executável e ambiente | Inexistentes; não criados |
| Dependências instaladas | Nenhuma nesta execução; runtime do projeto não verificado |
| Banco/dados de demonstração | Inexistentes; nenhum seed executado |
| Comandos de aplicação | Nenhum disponível; propostas no [guia](VERIFICATION_GUIDE.md#comandos) |
| Build/testes da aplicação | Não executados: não há aplicação; nenhum sucesso declarado |
| Git/commit/merge/push | Sem repositório; nenhuma operação de escrita Git |
| Deploy | Não realizado |
| Tickets | T0001–T0020 apenas planejados, nenhum executado |
| System Design visual | Não iniciado; sem branding/paleta/componentes/puzzles detalhados |

Revisão documental: conferência de arquivos autorizados, destinos e âncoras de links locais, cercas Markdown, IDs/campos dos tickets, cobertura das nove features e das cinco jornadas, estado dos ADRs e coerência entre fórmulas/limites/fluxos. A checagem de leitura em PowerShell encontrou **14 arquivos, todos Markdown; 20 tickets com campos presentes; três ADRs Proposed; zero erros de links/âncoras/cercas ou campos obrigatórios**. Foi executada diretamente na sessão, sem criar scripts no projeto. A conferência semântica é revisão documental, não teste da aplicação. Consulta a fontes oficiais de tecnologias foi usada para a proposta, com links na arquitetura; não substitui teste de compatibilidade. Diagramas Mermaid foram revisados textualmente; não houve renderização por motor Mermaid nem validação visual de interface.

## Histórico — bloqueios e próxima ação da revisão v1.1

### Revisão corretiva v1.1 — 23/10/2026

Inspeção desta revisão encontrou os 14 Markdown anteriores, sem Git e sem aplicação, preservando o relato histórico da inspeção inicial. `Get-Content` leu documentos e diretriz v1.1; `Get-ChildItem`/`Get-FileHash` registraram arquivos e hashes; `git status --short` confirmou ausência de repositório. Não houve instalação, execução de tickets, build, testes funcionais, recursos cartográficos adquiridos, interfaces ou System Design produzido.

Alterações limitadas aos nove Markdown autorizados: arquitetura, design técnico, tickets, guia, pendências, este estado e ADR-0001/0002/0003. Mantidos 20 IDs e as nove features. Os demais cinco arquivos são referências preservadas. Parecer: recomendada para aprovação com ressalvas; três ADRs Proposed e estado ARCHITECTURE_REVIEW. Diagramas não foram modificados; revisão de correspondência textual preserva contexto/containers e sequências J02/J03/J04, com infraestrutura introduzida conforme matriz incremental. Sem renderizador Mermaid executado.

Checagem v1.1 por leitura em PowerShell: 14 arquivos Markdown, 20 tickets com campos obrigatórios, grafo de 20 nós sem ciclos/dependências desconhecidas, zero erros de links/âncoras/cercas. Comparação SHA-256 antes/depois confirmou exatamente nove documentos autorizados modificados, cinco referências inalteradas e nenhum arquivo novo. Não são testes de aplicação. Cobertura mantida: F01=T0003/T0004; F02=T0006/T0010/T0011; F03=T0009 com histórico T0008; F04=T0012/T0013; F05=T0005; F06=T0016; F07=T0019; F08=T0017/T0018; F09=T0014. Gates J01–J05 continuam NOT_RUN; nenhum ADR foi aceito nesta revisão.

Próxima sequência, **nenhuma ação executada**: (1) aprovação humana da revisão/contratos e ADRs; (2) autorização separada para inicializar Git; (3) autorização e preparação do System Design funcional mínimo da primeira jornada; (4) autorização específica futura de T0001, com liberação humana inequívoca conforme AGENTS. Aprovação arquitetural não equivale a execução. Visual/experiencial é gate posterior próprio.

Pendências e riscos mantidos somente em [KNOWN_ISSUES](KNOWN_ISSUES.md). Nenhum documento essencial solicitado foi adiado. Revisar arquitetura, design técnico e três ADRs; confirmar premissas/viabilidade e registrar aprovação. Somente então autorizar explicitamente a fase/ticket desejado. T0001 não foi iniciado e não será executado automaticamente.
