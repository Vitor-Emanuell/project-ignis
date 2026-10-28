# IGNIS — System Design Functional v1.1

**Estado vigente em 25/10/2026:** T0001–T0004 DONE / HUMAN_ACCEPTED. [JF-T5-01–03 e GF-T5-01–12](#t0005-funcional) ratificadas/HUMAN_APPROVED; [T5-D01–D16/A01–A05](MVP_TECHNICAL_DESIGN.md#t0005-contrato) HUMAN_RATIFIED. T0005 permanece PLANNED / NOT_AUTHORIZED, sem implementação/homologação ou design visual novo. [Fonte humana e limites](TICKETS.md#contratos-t0005). O registro da v1.1 e os estados de preparação abaixo permanecem históricos; os contratos anteriores e suas evidências não são reclassificados.

**Estado vigente em 24/10/2026:** T0001–T0003 DONE / HUMAN_ACCEPTED, versionados em main/236d2e2. A aprovação v1.1/GF01–GF08 abaixo é registro histórico preservado da fatia T0003. [Complemento T0004](#t0004-funcional) HUMAN_RATIFIED em R-T4-01–07; [gate complementar](#gate-funcional-t0004) HUMAN_APPROVED (12 critérios); T0004–T0020 PLANNED / NOT_AUTHORIZED. Frases de implementação ainda futura no registro v1.1 descrevem seu momento anterior à entrega, não o estado atual.

Data da decisão: **24/10/2026 — horário de Brasília (America/Sao_Paulo)**. Aprovador: responsável pelo Sistema IGNIS. Evidência: instrução humana “IGNIS — Formalização do aceite do System Design Funcional v1.1 — Ratificação T03-C e aprovação humana do gate GF01–GF08”. **Parecer consolidado: T0003_FUNCTIONAL_GATE_HUMAN_APPROVED.** GF01–GF08: **HUMAN_APPROVED**, exclusivamente para a fatia de T0003 da primeira categoria fixed_speed_radar v1. **T03-C: RATIFICADA PELO RESPONSÁVEL. T0003: PLANNED / NOT_AUTHORIZED.**

Baseline do registro: main, HEAD `f910bb0037522b94679d500807f5960b557df35a`; alterações documentais anteriores de design e fechamento T03-A/B/C preservadas, inclusive este arquivo ainda não rastreado. O aceite abrange D01–D04, JF-01–JF-05 somente na parcela da primeira categoria e os contratos existentes de segurança, sessão, contexto e concorrência. JF-06 e ampliações de T0004/posteriores permanecem nos respectivos gates; J01 não está concluído. Não houve implementação, provisionamento, migration, teste de aplicação ou build.

A aprovação preserva integralmente os contratos preparados de T03-A/B/C na [seção 11 técnica](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo). A redação de proposta no design técnico, no guia e na definição do ticket registra a preparação anterior; a decisão humana posterior está formalizada aqui, sem modificar essas regras. A faixa de 1–200 km/h continua exclusivamente fictícia de demonstração, sem validade regulamentar.

<a id="escopo"></a>
## 1. Objetivo e escopo

Orientar a primeira interação de inventário sem implementar interfaces nem ampliar os 20 tickets. Este documento propõe comportamentos de navegação, formulários, feedback e recuperação; contratos de domínio permanecem no [design técnico](MVP_TECHNICAL_DESIGN.md). Requisitos: [R01–R04/F01](PROJECT_BRIEF.md#requisitos-das-três-partes); execução incremental: [backlog](TICKETS.md#marco-b--inventário-e-primeira-jornada).

| Etapa | Capacidade a orientar | Limite deste design |
|---|---|---|
| T0003 | Acesso contextual, lista/detalhe, criação e edição cadastral básica de radar de velocidade fixo; situação/localização iniciais e concorrência | Diretrizes D01–D04 aprovadas; contrato mínimo T03-A/B/C preparado na seção 11 técnica, com política demonstrativa de manutenção ratificada pelo responsável em 24/10/2026. Não inclui catálogo completo ou edição avançada |
| T0004 | Catálogo completo, agentes, atributos específicos e localização heterogênea | Jornadas e informações descritas para orientar continuidade; aceitação da fatia deve ser confirmada antes da respectiva UI |
| T0005/T0006 | Geração válida e mapa/snapshot | Somente fronteira/dependência: sem fluxo de gerador ou design de mapa. Aprovação desta versão não aprova essas interações |
| T0007/T0010–T0012 | Observações, alertas, comunicação atualizada, histórico e intervenção | Informação futura identificada; sem desenhar ingestão, Central, histórico ou manutenção completa |

Mapa operacional completo, simulador/reset real, previsão, missões, jogos, tour e publicação não são desenhados. F01–F09 e seus tickets permanecem no escopo geral, sem antecipação. Prazo informado: 27/10/2026, 23h59 de Brasília; esta especificação não promete concluir o backlog até essa data.

## 2. Fronteira entre arquitetura, design funcional e visual

| Disciplina | Fonte / responsabilidade |
|---|---|
| System Architecture | [Arquitetura](SYSTEM_ARCHITECTURE.md), [ADRs aceitos condicionalmente](adr/README.md) e [contratos](MVP_TECHNICAL_DESIGN.md#contratos): módulos, persistência, transações e segurança; preservados |
| System Design funcional | Este documento: intenção do operador, dados, ações, estados e respostas; aceite humano limitado à primeira categoria de T0003, conforme seção 12 |
| System Design visual | Gate separado: identidade, cores, tipografia, tokens, composição, componentes, animações e narrativa; não autorizado nem definido aqui |

Não há wireframe, imagem, protótipo, biblioteca visual, escolha de layout ou arquivos executáveis nesta entrega. A estrutura informacional textual não determina representação gráfica. Os [gates existentes](SYSTEM_ARCHITECTURE.md#gates-design) continuam exigindo aprovação por fatia e autorização individual de implementação.

<a id="capacidades"></a>
## 3. Dependências e capacidades existentes

| Classificação | Evidência / implicação funcional |
|---|---|
| Implementado e aceito — T0001 | Entrada Vue técnica, estáticos, live, build/processo loopback; [relatório](T0001_REPORT.md). Não existe navegação de inventário |
| Implementado e aceito — T0002 | SQLite, sessão opaca persistida por hash, cookie HttpOnly/SameSite Strict, Origin/CSRF, grants/contexto e epoch, readiness, helper de recibos; [relatório](T0002_REPORT.md) e [aceite humano](REPO_CURRENT_STATE.md#aceite-humano-t0002) |
| Contratado, não implementado | Equipment/Agent/ResourceLocation, categorias, estados, operações Inventory e transições: [seções 2/3/6](MVP_TECHNICAL_DESIGN.md#dados). Rotas de inventário ainda não existem |
| Design funcional | JF-01–JF-05 aprovadas somente na parcela da primeira categoria; JF-06 reservada a T0004. Nada aqui prova que uma tela esteja pronta |
| Contrato documental preparado, implementação futura | Categoria fixed_speed_radar v1, referências fixas, preparo operational e entrada inicial de manutenção definidos no [adendo T03-A/B/C](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo); nada disso já está implementado. Política demonstrativa ratificada; implementação e provas futuras pendentes |

A inspeção pontual de `apps/web/src/App.vue`, `apps/server/src/foundation-routes.ts`, `auth.ts`, `app.ts` e `config.ts` confirmou essas capacidades, sem executar aplicação. A sessão/contexto atuais não entregam nome de dataset, lista de datasets, permissões de UI ou novo token CSRF por leitura. A revisão de contexto não é a versão de um equipamento.

C01 tem evidências reproduzidas no Windows; instalação limpa do driver em ambiente inteiramente novo não foi reproduzida na validação humana. C02 tem 21 V00-I aprovados e oito grupos futuros pendentes. C03/C04/C05 não são encerradas por este design. Texto histórico desatualizado em documentos protegidos é tratado em D07, sem reinterpretar contratos ou editar essas fontes.

## 4. Usuário operacional e objetivos

Usuário principal: operador de uma central municipal, utilizando dados fictícios no contexto autorizado da instalação local. Precisa localizar o equipamento pela identificação/série, reconhecer categoria, situação e localização conhecida; cadastrar sem duplicar e corrigir dados cadastrais sem sobrescrever trabalho concorrente. Deve distinguir “salvo”, “não confirmado”, “acesso negado” e “informação não disponível”.

Erros relevantes: cadastrar no contexto errado, duplicar série por retry, confundir manutenção com falha física, tratar base de móvel como posição atual, perder alterações concorrentes ou inventar dados para preencher campos. O feedback deve esclarecer o resultado e a ação segura seguinte. Não se criam administrador, despachante, técnico, RBAC ou permissões adicionais. Capability/grant e validade da sessão continuam decididos pelo servidor.

<a id="navegacao"></a>
## 5. Arquitetura da informação textual

Sequência proposta: **Acesso local → confirmação do contexto autorizado → Inventário / Equipamentos → detalhe → edição cadastral → detalhe atualizado**. Da consulta, “Cadastrar equipamento” abre o formulário; salvar leva ao detalhe confirmado; “Voltar ao inventário” retorna à consulta no mesmo contexto. Cancelar uma edição retorna ao detalhe. Antes de abandonar rascunho modificado, pedir escolha entre continuar editando e descartar; não prometer persistência de rascunho após recarga.

Na consulta e no formulário, identificar textualmente o contexto e sua geração; usar apenas dados confiáveis disponíveis. Com a API atual, apresentar referência abreviada do dataset e geração, com identificação completa acessível quando necessária para conferência; não inventar nome/tipo ou permitir editar epoch. A referência vem da configuração pública local de build especificada na seção 9.1; seu fornecimento não autentica nem seleciona epoch. O preparo operacional está contratado em T03-B; sua implementação/prova pertencem ao T0003 futuro, não à conclusão desta documentação. “Contexto não configurado” impede abrir um formulário operacional.

Equipamentos e, em T0004, Agentes são destinos distintos do inventário. Cada registro tem ação identificável de consulta e, quando cabível, edição. Ações de manutenção, mapa, simulação ou jogos não aparecem como funcionalidades utilizáveis nesta fatia. Mensagens críticas identificam a ação afetada e preservam dados apenas dentro do contexto autorizado. Ao trocar/invalidatear contexto, nenhuma lista ou rascunho antigo é apresentado como pertencente ao novo.

<a id="jornadas-funcionais"></a>
## 6. Jornadas funcionais

Todas são **não implementadas**; JF-01–JF-05 têm aceite humano somente na parcela da primeira categoria de T0003, e JF-06 permanece reservada a T0004. As referências a testes são critérios futuros, não execuções desta entrega. Estados comuns da seção 8 integram cada jornada; quando não há escrita, “salvando” e conflito de versão não se aplicam.

### JF-01 — Acessar o inventário

- **Objetivo / entrada:** acessar consulta/cadastro pelo acesso local ou retorno à aplicação.
- **Pré-condições:** backend/banco preparados; UUID não sensível do dataset operational previamente existente na configuração pública local de build (seção 9.1). O comando local de preparação está definido em T03-B, para implementação futura; não se presume que já tenha sido executado. Escrita exige segredo configurado, sessão e contexto autorizados.
- **Sequência:** ler/validar a referência configurada; apresentar acesso local; solicitar segredo somente quando necessário; abrir sessão pela rota existente; confirmar o contexto pelo backend com o UUID configurado; obter epoch/revisão da resposta; identificar a geração e abrir equipamentos. Nunca usar epoch configurado ou fallback para outro dataset. Segredo não permanece no formulário após sucesso.
- **Alternativas:** sessão válida pode permitir consulta após recarga. Se o token CSRF do fluxo de acesso se perdeu, propor novo acesso antes de mutações; não inventar endpoint de renovação de CSRF. Encerrar acesso chama revogação somente com as credenciais/CSRF exigidos; falha não é anunciada como revogação confirmada.
- **Exceções:** credencial inválida pede correção; contexto alheio bloqueia; serviço indisponível oferece nova tentativa. Sem segredo ou em read-only, não prometer login disponível nem leitura anônima: consultas dependem de sessão válida existente. A UI não infere capacidade de escrita só da presença do cookie.
- **Estado final / dependências / ticket:** contexto autorizado conhecido, ou bloqueio explicado sem inventário alheio; T0002 fornece backend, T0003 integra acesso mínimo à primeira jornada; ver seção 9.

### JF-02 — Consultar equipamentos

- **Objetivo / entrada:** reconhecer e selecionar um registro em “Equipamentos”, ao acessar o inventário ou voltar do detalhe.
- **Pré-condições:** JF-01 concluída; perfil público mínimo da seção 7 detalhado sem lacunas normativas e contrato de lista materializado futuramente em T0003.
- **Sequência:** carregar lista contextual; apresentar identificação/série, categoria Radar de velocidade fixo, marca/modelo, situação e referência da localização disponível; selecionar registro; carregar detalhe com os atributos mínimos autorizados, versão e origem dos dados. Paginação deve respeitar os limites contratuais, com quantidade exibida distinguida do total quando este existir.
- **Alternativas:** lista vazia explica ausência de registros e oferece cadastrar se autorizado. Retorno conserva a posição de consulta em memória quando possível. Campos específicos completos chegam em T0004.
- **Exceções:** erro não vira lista vazia; 404 informa que o registro não está disponível naquele contexto. Última lista conhecida pode permanecer sinalizada como desatualizada enquanto houver autorização; não reutilizá-la após perda de acesso/contexto.
- **Estado final / dependências / ticket:** registro lido ou ausência/falha explícita; T0003 básico, T0004 ampliação. Não há busca textual contratada para T0003. Filtros combinados de categoria/situação/órgão/localização/região/bbox pertencem a snapshot/mapa T0006 e Central T0011, com gate próprio; não inventar parâmetros de pesquisa.

### JF-03 — Cadastrar equipamento

- **Objetivo / entrada:** criar registro persistente por “Cadastrar equipamento”.
- **Pré-condições:** sessão/CSRF/contexto válidos, capacidade de escrita e referência determinística da categoria Radar de velocidade fixo. Os contratos T03-A/B/C estão definidos na seção 11 técnica; sua implementação só poderá ocorrer após o aceite do gate e autorização individual de T0003.
- **Sequência:** mostrar categoria única Radar de velocidade fixo e mobilidade fixa; informar os dados comuns e a localização conhecida; iniciar situação em not_installed; preencher somente o atributo específico admitido pelo perfil autorizado, sem sugerir valor regulamentar. Necessidade/agenda seguem a política ratificada da seção 7.2: solicitação preventiva inicial opcional, explícita, nunca automática; sua política foi ratificada pelo responsável em 24/10/2026. Explicar obrigatoriedade condicional; validar; preservar uma intenção/commandId durante envio; aguardar confirmação; apresentar “Equipamento cadastrado” e abrir detalhe confirmado.
- **Alternativas:** cancelar antes do envio não altera banco. Coordenadas desconhecidas seguem as exceções contratuais, sem criar ponto fictício. Catálogo completo é T0004; em T0003 categoria/mobilidade são informações fixadas pela primeira fatia, sem seletor universal. Não converter not_installed em operational por ter endereço/coordenadas.
- **Exceções:** série equivalente já registrada retorna conflito, mantém formulário e orienta conferir a consulta; não cria outra chave para insistir no mesmo cadastro. Campo inválido recebe mensagem associada; falha de rede deixa resultado não confirmado e permite reenviar a mesma intenção. Contexto inválido interrompe envio, sem migrar o rascunho para nova geração.
- **Estado final / dependências / ticket:** um cadastro confirmado, ou nenhum sucesso anunciado; T0003 básico e T0004 ampliação. A atomicidade cadastral é a da seção 2 técnica; necessidade/agenda eventualmente informada não pode ser gravada por atalho, conforme D04.

### JF-04 — Consultar e atualizar registro

- **Objetivo / entrada:** corrigir dados cadastrais pelo detalhe e ação “Editar cadastro”.
- **Pré-condições:** radar fixo consultado com versão, acesso atual e campos editáveis da matriz 7.1. Identificador, contexto, categoria/versão de catálogo e mobilidade são somente leitura; edição não cria nem altera manutenção.
- **Sequência:** carregar valores atuais; identificar campos editáveis; alterar; validar; enviar com versão esperada do registro e commandId da intenção; após confirmação mostrar “Cadastro atualizado” e consultar detalhe atual. Desabilitar envio repetido é conveniência, sem substituir o recibo do servidor.
- **Alternativas:** cancelar retorna sem salvar. Troca de categoria/mobilidade não é oferecida pela edição mínima até haver schema/migração e interação aprovados em T0004. Valores ausentes só podem ser limpos explicitamente se o schema aceitar null.
- **Exceções:** conflito de versão interrompe gravação: mostrar “O cadastro foi alterado. Consulte a versão atual antes de salvar novamente”; permitir comparar o rascunho em memória com dados reconsultados, sem merge automático. Nova intenção usa nova chave após revisão humana; retry de envio idêntico mantém chave e versão originais. Replay confirma a alteração antiga; uma consulta posterior distingue a versão atual.
- **Estado final / dependências / ticket:** correção confirmada ou conflito explícito, sem sobrescrita silenciosa; T0003 campos básicos, T0004 atributos completos. Não editar situação, comunicação, necessidade ou conclusão de manutenção pelo PATCH cadastral; ações próprias dependem de Operations/Maintenance e D06/T0012.

### JF-05 — Equipamentos fixos e móveis

- **Objetivo / entrada:** compreender onde o recurso está cadastrado e o que se sabe sobre sua posição, no formulário ou detalhe.
- **Pré-condições:** categoria/mobilidade válidas e ResourceLocation; T0003 cobre apenas o radar fixo da seção 7.1. Cadastro/base conhecidos de um radar not_installed não comprovam instalação.
- **Sequência:** em T0003 identificar “Fixo”, mostrando localização cadastral/instalação e base quando existente, separadas; a alternativa “Móvel” pertence à ampliação T0004. No móvel, mostrar posição observada somente quando efetivamente fornecida pelo backend, com origem/instante e indicação de atualidade. Não converter consulta de cadastro em rastreamento.
- **Alternativas:** fixo ainda não instalado pode ter somente base conhecida; recurso sem ponto continua na lista como “Coordenadas não informadas”. Ausência/atraso de observação de móvel remete à base/cadastro, explicitamente rotulada como tal.
- **Exceções:** coordenada parcial é inválida; não preencher 0,0, geocodificar CEP ou escolher região próxima. Posição antiga nunca recebe rótulo “tempo real”. Informação dinâmica ainda não implementada é identificada como indisponível nesta etapa, sem inventar timestamp/freshness.
- **Estado final / dependências / ticket:** posição/proveniência compreensíveis; T0004 diferenciação completa, T0007 observação dinâmica, T0006/T0011 representação operacional futura. Não há mapa ou nova fonte de localização neste design.

### JF-06 — Agentes de campo

- **Objetivo / entrada:** consultar/cadastrar/editar agentes fictícios no destino “Agentes” do inventário, somente na fatia T0004.
- **Pré-condições:** JF-01, modelo Agent e referências/location de T0004; sem dados pessoais reais.
- **Sequência:** listar identificação/matrícula fictícia, nome fictício, função e vínculo organizacional disponível; abrir detalhe; cadastrar/editar campos permitidos com o mesmo ciclo de validação/confirmação de JF-03/JF-04, respeitando unicidade contextual da matrícula e versão do recurso.
- **Alternativas:** ausência de posição dinâmica mantém cadastro/base rotulados; consulta sem atividade conhecida usa o estado efetivamente retornado ou “Informação indisponível”. Agente não recebe série, marca/modelo ou atributos de sensor como obrigatórios.
- **Exceções:** duplicidade, coordenada inválida, acesso/epoch ou versão seguem seção 8. Não solicitar CPF, contato pessoal, rastreamento ou despacho; não inferir disponibilidade pela posição ou ausência de comunicação.
- **Estado final / dependências / ticket:** agente distinto de equipamento e cadastrado sem duplicação, ou erro explícito; T0004. Atividade observacional depende de T0007 e não vira seletor livre neste formulário; não entra no denominador de disponibilidade de equipamentos.

<a id="dados-interface"></a>
## 7. Modelo mínimo e comportamento do radar fixo

A fonte contratual única para tipos, campos exatos, defaults/null, referências e respostas é a [seção 11 técnica T03-A/B/C](MVP_TECHNICAL_DESIGN.md#t0003-contrato-minimo), adição mínima preparada na etapa documental anterior. Não há mais lacuna de tipo/unidade/faixa a preencher no código. O aceite funcional e a ratificação da política não significam que API ou configuração estejam implementadas, nem autorizam sua implementação.

<a id="radar-minimo"></a>
### 7.1. Matriz funcional resumida

| Informação exibida | Contrato preparado / comportamento funcional | Cadastro / edição |
|---|---|---|
| Tipo/categoria/versão/mobilidade | equipment; fixed_speed_radar, versão 1, “Radar de velocidade fixo”; fixed | Uma opção fornecida pelo catálogo; somente leitura, sem troca por PATCH |
| Identificador/identificação pública | UUID gerado no servidor; publicLabel é a série normalizada | Sem novo nome obrigatório; não mostrar ID como salvo antes do commit |
| Série | Texto 1–256, trim/caixa normalizados, único por dataset/epoch | Editável; duplicidade 409 sem nova criação por retry |
| Fabricante/modelo | Textos obrigatórios 1–256, sem normalização global/default | Editáveis; erros associados ao campo |
| Organização | ORG_LOCAL, “Órgão municipal fictício”, UUID público determinístico do contexto | Uma opção de catálogo contextual, somente leitura; sem CRUD de órgãos |
| Criticidade | Inteiro 1–5, explícito e sem default | Editável; não vira prioridade de manutenção |
| Limite regulamentado | regulatedSpeedLimitKmh inteiro 1–200 km/h, obrigatório; parâmetro **fictício de demonstração**, não validade legal | Editável; rótulo evidencia caráter fictício; não preencher limite/regulamento de uma via real |
| Localização cadastral | registrationLocation obrigatória, referenceType base/installation, endereço/bairro/cidade/UF/CEP/referência | Substituição completa na edição; referência de base conhecida é permitida para not_installed, sem declarar instalação realizada |
| Base adicional | baseLocation opcional/null, papel separado e referenceType=base | Pode ser removida explicitamente com null; não apagar cadastro obrigatório |
| Coordenadas/região | Par válido ou ambos null; região somente leitura, sem posição artificial/atribuição por vizinhança | Sem ponto continua consultável; CEP não gera geocodificação; mapa é futuro T0006 |
| Situação | initialState default not_installed, única situação exposta no cadastro desta fatia | Leitura no detalhe; PATCH não instala, ativa, desativa ou inicia manutenção |
| Necessidade/agenda | initialMaintenance opcional conforme política ratificada em 7.2, no domínio Maintenance | Somente criação inicial explícita; PATCH cadastral não altera manutenção |
| Versão/contexto/revisão | version do recurso começa em 1, expectedVersion consultada na edição; dataset/epoch/revision confirmados no servidor | Não editáveis; nunca usar revisão como versão de recurso |

Campos obrigatórios ausentes são erros, não placeholders gravados. Opcionais e null seguem os defaults estáticos/schemas da fonte técnica; não adicionar coerção, zeros, data atual, prioridade ou dados de hardware. Consulta, POST/PATCH e catálogo usam os envelopes contratados; lista somente paginada, sem busca textual/filtros de mapa antecipados. Respostas mais antigas/replays não sobrescrevem uma consulta mais recente; reconsultar detalhe após confirmação.

<a id="manutencao-inicial"></a>
### 7.2. Política inicial ratificada pelo responsável

**T03-C — RATIFICADA PELO RESPONSÁVEL em 24/10/2026, horário de Brasília:** radar demonstrativo não abre pedido automaticamente, não tem agenda universal obrigatória e pode receber uma única solicitação preventiva inicial explicitamente informada. A ratificação aprova exatamente a política demonstrativa já preparada, sem redefinir seus detalhes normativos e sem obrigação/dispensa regulamentar. Detalhes completos em [T03-C](MVP_TECHNICAL_DESIGN.md#t03-c-manutencao-inicial).

| Intenção/estado | Interação e resultado contratados |
|---|---|
| initialMaintenance omitido/null | Nenhuma solicitação; mostrar “Sem solicitação registrada” e “Agenda não informada”; not_installed permanece |
| Solicitação inicial explícita | Operador informa reason, priority sem default e schedule; servidor cria open/version1, causeCode fictício initial_preventive_check, na mesma transação do cadastro |
| schedule dated | Data civil dueDate obrigatória; mostrar a data em Brasília; não criar alerta/intervenção |
| schedule unknown | Sem data/motivo de inaplicabilidade; mostrar “Agenda não informada”, sem converter em não aplicável |
| schedule not_applicable | Sem data e com justificativa explícita obrigatória; mostrar “Agenda não aplicável” e motivo |
| Agenda avulsa ou combinação incoerente | Recusar; orientar explicitar uma solicitação inicial para registrar sua agenda. Não criar pedido oculto nem campo livre em Equipment |
| Pós-cadastro | Prioridade, agenda, solicitação e situação não são alteradas por edição cadastral. Intervenções/conclusões permanecem T0012; sem missão/reparo |

A projeção nextMaintenance deriva da única solicitação inicial quando existir; não é coluna editável de Equipment. Cadastro, pedido opcional, estado, localização, evento, revisão e recibo confirmam/revertem juntos. Reenvio equivalente não abre segundo pedido. Qualquer mudança posterior dessa política exige revisão específica e validação humana antes de implementação, sem improvisação no código.

### 7.3. Referências e ampliação posterior

A [preparação local T03-B](MVP_TECHNICAL_DESIGN.md#t03-b-contexto-operacional) define operational separado do demo, ator local estável, grant e ORG_LOCAL; categoria global vem de migration futura explícita e imutável. O GET D/catalog já proposto ganha apenas o payload mínimo categories/organizations do contexto, sem nova rota ou catálogo universal. IDs/códigos fixos e divergência recusada tornam o preparo repetível; nenhuma referência é gerada aleatoriamente a cada consulta/boot.

JF-06 continua íntegra e reservada a T0004. Outras categorias, móveis, migração de categoria/mobilidade, observações, filtros/mapa, histórico e intervenções mantêm seus tickets/gates. O perfil inicial não exclui nenhuma feature F01–F09.

<a id="estados-interacao"></a>
## 8. Estados, validações e mensagens

As mensagens são sugestões funcionais; preservar código/requestId seguro do backend para suporte, sem SQL, stack, segredo ou hash do recibo. Validação local melhora a correção do preenchimento, sem substituir validação server-side.

| Estado | Comportamento / mensagem sugerida | Aplicação |
|---|---|---|
| Inicial | Sem referência local ou UUID inválido: “Contexto não configurado”; sem tentativa de descoberta/fallback. Formulário novo só após contexto autorizado | Todas |
| Carregando | “Consultando equipamentos”/“Carregando cadastro”; não confundir com vazio | Todas nas leituras; JF-01 ao autenticar |
| Vazio | “Nenhum equipamento cadastrado neste contexto”; agente separado em T0004 | JF-02/JF-06; não se aplica ao detalhe/formulário como total zero |
| Dados disponíveis | Identificação/contexto/origem coerentes; habilitar somente ações entregues naquela fatia | Todas |
| Salvando | “Salvando cadastro”; impedir reenvio acidental, manter intenção em memória; não anunciar sucesso | JF-03/JF-04/JF-06; JF-01 indica autenticação/revogação, sem recibo de domínio |
| Sucesso | Identificação e confirmação recebidas; mostrar cadastrado/atualizado. Replay confirma resultado original, sem duplicar mensagem de novo efeito | Escritas; nas consultas, basta conteúdo disponível |
| Validação 400/422 | Resumo e erros junto aos campos; manter valores; “Revise os campos indicados”. Aplicar o perfil fictício 1–200 km/h e demais tipos/null definidos em T03-A; combinações de agenda seguem T03-C; nenhuma regra é preenchida por suposição no código | Formulários; nas leituras, corrigir entrada/contexto inválido |
| Rede/500/503 | Consulta: “Não foi possível atualizar”; escrita: “Não foi possível confirmar o resultado”. Permitir tentativa explícita, sem ciclo infinito; preservar chave/intenção | Todas; não afirmar que falhou antes do commit sem evidência |
| Sessão inválida/expirada 401 | Interromper leitura/escrita protegida; pedir novo acesso. Rascunho só em memória, bloqueado e vinculado ao contexto anterior até revalidação | Todas |
| Acesso negado 403 | “Você não tem acesso a este contexto” ou “Escrita indisponível”, conforme código seguro; sem retries de autorização | Todas; sem revelar dados de outro contexto |
| Registro indisponível 404 | “Registro não disponível neste contexto”; permitir voltar à consulta | JF-02/JF-04/JF-05/JF-06 |
| Conflito de cadastro/versão 409 | Série/matrícula já usada: conferir cadastro. VERSION_CONFLICT: reconsultar e revisar; não sobrescrever nem atualizar versão automaticamente | JF-03/JF-04/JF-06 |
| Conflito de idempotência 409 | IDEMPOTENCY_CONFLICT: “Esta tentativa corresponde a outro conteúdo. Revise a operação”; parar retry. Nova intenção só após revisão explícita | Escritas de domínio |
| Epoch invalidado 409 | EPOCH_CONFLICT: “O contexto foi reinicializado. Atualize o contexto para continuar”. Invalidar consultas/formulários antigos; descobrir geração atual sem reenviar comando antigo nela | Todas; teste de guarda existe em T0002, reset real somente T0009 |
| Informação indisponível/desatualizada | Distinguir ausência de dado, não aplicável, não implementado e última consulta válida; posição antiga inclui indicação textual | JF-02/JF-04/JF-05/JF-06 |
| Limite 429 | “Aguarde antes de tentar novamente”; respeitar retry informado; nenhuma repetição automática ilimitada | JF-01/mutações futuras |

JF-05 herda os estados do formulário/consulta em que aparece; não possui gravação dinâmica própria. Um campo ausente em resposta não é convertido em null, zero, falso ou enum desconhecido no banco. O formulário não descarta conteúdo em erro recuperável; ao perder acesso, oculta os dados protegidos da apresentação operacional e não oferece exportar/persistir rascunho. Antes de saída voluntária, o operador pode descartar conscientemente valores locais; não se garante recuperação após fechar a aba.

<a id="seguranca-interacao"></a>
## 9. Segurança, autorização e concorrência

As rotas abaixo são as existentes ou as já propostas na [seção 6 normativa](MVP_TECHNICAL_DESIGN.md#operacoes). Não são novos endpoints. Prefixo `/api/v1`; **D** mantém a abreviação normativa `/datasets/{datasetId}/epochs/{epoch}`. Nomes de parâmetros de paginação/filtros e detalhes de payload ainda não definidos não são criados aqui.

| Interação | Contrato / situação real |
|---|---|
| Abrir/revogar acesso | POST/DELETE `/api/v1/session`, existentes em T0002. POST recebe secret, devolve csrfToken/cookie; DELETE exige Origin/CSRF/cookie e retorna 204. Sessões não geram recibo contextual |
| Confirmar contexto | GET `/api/v1/datasets/{datasetId}/context`, existente, autenticado, devolve datasetId/epoch/revision. Não lista datasets nem revela capacidade de escrita |
| Equipamentos | GET/POST D/equipment e GET/PATCH D/equipment/{id}, propostos, implementação futura T0003/T0004, 200/201 conforme operação |
| Catálogo mínimo e ampliação | GET D/catalog de T0003 retorna apenas a categoria inicial e referência organizacional conforme adendo 11.1; ainda não implementado. Agentes/regiões/catálogo ampliado permanecem T0004/T0006 |
| Situação/manutenção | state-transitions e maintenance-requests já propostos, não equivalem a edição de cadastro. Intervenção T0012 e dependências; alocação administrativa detalhada D06 |

Regras funcionais a preservar:

1. Cookie de sessão não é actorId; identidade estável e grants vêm do servidor. Não solicitar ator/epoch editáveis, não criar contas ou RBAC. Secret e token CSRF não entram em URL, log, bundle ou armazenamento persistente de rascunho; proposta: segredo só durante acesso e CSRF em memória. Cookie HttpOnly continua inacessível à UI.
2. Sessão pode sobreviver ao reinício, mas não prometer mutação após recarga sem CSRF. Novo acesso com a rota existente recupera capacidade de envio; não implica revogar outras sessões. Sem CSRF disponível, revogação também não é presumida. A validade é de uma hora no backend atual, sem renovar silenciosamente.
3. Origem/CSRF/contexto são obrigatórios nas mutações aplicáveis. APP_MODE read-only e ausência de segredo não criam acesso público anônimo; não fabricar leitura nem permissões. O backend sempre pode negar uma ação que a UI apresentou.
4. Uma intenção gera commandId UUID; retry de resultado desconhecido conserva contexto, alvo, corpo semântico, chave e expectedVersion originais. Desabilitar botão não substitui atomicidade/idempotência. Se for preciso corrigir corpo após rejeição definitiva, tratar como intenção revista e nova chave; não fazê-lo enquanto confirmação anterior estiver incerta.
5. Sucesso só após resposta confirmada. Replay recupera resultado original, possivelmente anterior ao estado atual: indicar confirmação e reconsultar o registro para ver a versão atual. Não usar a resposta antiga para sobrescrever consulta mais nova. Se contexto mudou, 409 prevalece sobre replay; nunca remapear comando à geração atual.
6. Conflito de versão exige comparação/revisão do operador, sem overwrite, merge automático ou retry com versão nova às escondidas. Só Inventory altera cadastro; ações de Operations/Maintenance seguem suas próprias guardas. Não oferecer resolução de estado terminal/restrito em PATCH genérico.
7. Proposta mínima não promete retomada automática de uma escrita após recarregar/fechar o navegador: não há contrato de armazenamento persistente de intenções. Se a intenção em memória se perdeu, conferir o cadastro/lista antes de iniciar outra criação; não anunciar recuperação idempotente que já não conhece a chave. Confirmar a política em revisão funcional, sem inventar endpoint de recibos.
8. Distribuição construída usa a mesma origem. No desenvolvimento atual, Vite encaminha apenas `/health`; a seção 9.1 especifica o ajuste futuro do proxy para as APIs já contratadas, preservando Origin/cookie/CSRF, sem alterar configuração nesta entrega.

<a id="acesso-contextual-v11"></a>
### 9.1. Mecanismo mínimo de acesso contextual — D02

**Escolha funcional de mecanismo, ainda não implementada:** uma referência pública de build, denominada documentalmente `VITE_IGNIS_DATASET_ID`, fornecida pelo responsável da instalação a partir do UUID do dataset operational autorizado. É somente um UUID não sensível; não é credencial. Nenhum valor concreto, configuração ou arquivo executável foi criado nesta revisão. T0003 futuro deverá implementar/verificar sua leitura e documentação no escopo então autorizado.

1. A instalação fornece o UUID no ambiente local usado para desenvolvimento e para construir a distribuição. A única referência pública de contexto entra no frontend; segredo de operador permanece no ambiente do backend, e CSRF/cookies não entram na configuração. Não oferecer seletor multitenant, geração automática, lista de datasets ou novo endpoint de descoberta.
2. Inicialmente validar presença/formato UUID; falha mostra “Contexto não configurado” e impede consulta/cadastro. Não escolher o primeiro dataset encontrado, local-demo ou epoch 1 como fallback.
3. Havendo sessão persistida, tentar o GET de contexto existente com credenciais da mesma origem. Sem sessão/ao receber 401, solicitar acesso local e usar POST /api/v1/session já existente, com Origin local. Segredo é informado pelo operador, não incorporado à aplicação; o cookie HttpOnly é gerido pelo navegador e csrfToken fica em memória.
4. Confirmar pelo GET /api/v1/datasets/{datasetId}/context. Backend autentica, confere grant e geração ativa/pronta; UUID configurado não concede acesso. A UI obtém epoch/revision da resposta, identifica dataset/geração em texto e só então permite a primeira consulta.
5. Referência para contexto não autorizado/indisponível produz bloqueio/erro conforme o contrato existente; não descobrir outro UUID nem inventar resposta 404 para a rota atual, que pode negar grant com 403. Ausência de segredo/read-only não oferece login público ou leitura anônima.
6. Sessão existente não recupera automaticamente o token CSRF em memória após recarga. Permitir consulta se autorizada; para mutação/revogação sem token, solicitar novo acesso pelo fluxo existente, sem novo endpoint ou alegação de revogar todas as sessões.
7. No desenvolvimento futuro, frontend usa caminhos relativos /api/v1 e o proxy local encaminha /api ao backend loopback, sem mudar a rota, remover Origin, cookies ou cabeçalho X-CSRF-Token. O backend em modo dev já admite a origem exata http://127.0.0.1:5173; outras origens não são abertas por este documento. A integração do proxy ainda não existe (atualmente só /health) e deverá ser verificada em T0003.
8. Na distribuição construída, Fastify serve frontend e APIs na mesma origem; o UUID é definido para aquela instalação no build. Alterar a referência exige atualizar o build público correspondente e confirmar o contexto, sem mudar grants nem transportar rascunhos/comandos entre datasets. Nenhum recurso de configuração dinâmica ou API adicional é criado.
9. Epoch invalidado leva à reconfirmação do contexto, nunca a reenviar comando antigo na nova geração. Cookie/sessão não altera identidade estável do ator nem dispensa expectedVersion/idempotência.

**Contrato T03-B preparado:** a [seção 11.2 técnica](MVP_TECHNICAL_DESIGN.md#t03-b-contexto-operacional) define preparo local separado, kind=operational, IDs públicos fixos e grant ao operador existente, sem converter o demo. O comando planejado db:prepare-operational ainda não existe e não foi executado. A implantação futura fornecerá VITE_IGNIS_DATASET_ID e comprovará preparo/proxy/contexto em T0003; não se exige essa execução para aprovar o contrato. O GET de contexto existente continua retornando somente datasetId/epoch/revision, sem inventar kind ou descoberta.

## 10. Acessibilidade e usabilidade

- Todas as ações propostas devem ser alcançáveis por teclado, com ordem lógica: contexto, consulta/identificação, ação, campos, revisão e confirmação. Sem dependência de hover, gesto ou dispositivo apontador.
- Cada campo tem rótulo compreensível, instrução de formato e indicação textual de obrigatoriedade condicional; grupos cadastral/base/posição e situação/manutenção são nomeados de forma distinta. Código técnico pode complementar, sem substituir o rótulo.
- Após erro de envio, levar atenção ao resumo e permitir chegar aos campos correspondentes; após navegação, identificar o destino; após cancelar, retornar à origem lógica. Preservar foco utilizável durante carregamento.
- Anunciar salvando, sucesso, falha e mudança crítica de contexto às tecnologias assistivas, sem roubar foco a cada consulta. Mensagem de conflito deve permanecer disponível até resolução.
- Estado operacional, manutenção, atraso, acesso negado e dado ausente possuem texto; cor, forma, ícone ou animação não são sua única indicação. Nenhuma decisão estética é fixada.
- Em larguras menores, preservar identificação do registro, rótulos/valores, ações e mensagens; a ordem de leitura continua compreensível sem exigir comparação visual entre colunas. Não impor grid, barra lateral ou layout específico.

<a id="rastreabilidade"></a>
## 11. Matriz de rastreabilidade

RF identifica regra funcional deste design, não novo requisito de domínio ou novo ticket. Critérios abaixo serão testados após autorização de implementação; **todos NOT RUN nesta execução documental**. V01 em T0003 cobre só a categoria inicial; catálogo/agentes ficam T0004. JF são jornadas funcionais, distintas de J01–J05, que são gates de integração.

| Jornada → regra | Contrato de domínio / fonte | Ticket responsável | Critério de verificação futuro |
|---|---|---|---|
| JF-01 → RF01 acesso/contexto | I01, sessão/contexto existentes; D02/seção 9.1 | T0002 backend aceito; T0003 implementação futura do contrato T03-B | V00: referência local sem segredo; confirmação de epoch/grant; ausência/UUID inválido sem fallback; proxy preserva Origin/CSRF |
| JF-01 → RF02 recuperação de sessão/CSRF | Auth T0002; operações /session; seção 9 | T0003 | Recarregar sem CSRF não envia mutação; novo acesso não altera ator nem promete revogar todas as sessões |
| JF-02 → RF03 consulta básica | R01/R02, Resource/Equipment, operações Inventory | T0003 | V01 parcial: listar/abrir registro criado e persistido após reinício; vazio distinto de falha |
| JF-02 → RF04 atributos/filtros por estágio | Catálogo; snapshot seção 3 | T0004 atributos; T0006/T0011 filtros/snapshot | V01 completo depois; V03 posterior, sem atribuir busca textual/filtros completos a T0003 |
| JF-03 → RF05 criação válida/única | R02; I02/I03; matriz radar 7.1/D01/D03 | T0003 implementação futura do contrato T03-A; T0004 demais categorias | V01: série normalizada única; perfil mínimo não omite limite regulamentado nem inventa unidade/faixa; falha/replay sem duplicação |
| JF-03 → RF06 estado/localização inicial | CurrentState/ResourceLocation; Maintenance/I03; seção 7.2/D04 | T0003 implementação futura do contrato T03-C; T0004 heterogeneidade | V01: not_installed não cria solicitação; falta de agenda não vira não aplicável; intenção inicial admitida confirma ou reverte junto ao cadastro |
| JF-04 → RF07 edição sem perda | I04, expectedVersion, C02 | T0003 básico; T0004 completo | V01 e integração V05-I por estágio: uma edição vence, outra conflita; replay retorna original mesmo após alteração posterior |
| JF-04 → RF08 domínio de estado/manutenção | I05, transições/solicitações seção 3 | Operations conforme D06; T0012 intervenção | V06 posterior: editar cadastro não resolve causa, não altera estado administrativo pelo atalho |
| JF-05 → RF09 cadastro/base/observação distintos | R02/R03, geografia e proveniência | T0003 conforme categoria; T0004 completo; T0007 posição | V01/V02 por estágio: par completo, sem 0,0 artificial; posição antiga rotulada; sem inferir localização de CEP |
| JF-05 → RF10 referência ao mapa futuro | R05/J01; snapshot/geografia | T0006 e depois T0011 | V03 futuro: sem ponto permanece na consulta; não declarar mapa aprovado por este documento |
| JF-06 → RF11 agente distinto | R03; Agent/atividade | T0004; observações T0007 | V01: matrícula contextual única, identidade fictícia; sem série/sensor obrigatório, atividade não derivada de posição |
| Todas → RF12 recuperação/epoch | I01/I02; C02; códigos seção 1 | T0003/T0004 integração; reset T0009 | V00/V01 conforme operação: 401/403/409 não viram sucesso; epoch aposentado não recebe retry remapeado |
| Todas → RF13 feedback/acessibilidade | Seções 8/10 deste design; I05/I08 | T0003/T0004 respectivas UI | Revisão futura por teclado e leitura assistida: campo/erro/contexto identificáveis, sem depender de cor; dados indisponíveis não viram zero |

<a id="gate-funcional"></a>
## 12. Avaliação GF01–GF08 e gate parcial de T0003

**GF01–GF08: HUMAN_APPROVED pelo responsável em 24/10/2026, horário de Brasília**, exclusivamente para fixed_speed_radar v1 na fatia T0003. D01–D04 e os contratos preparados são preservados; T03-C está ratificada. As situações abaixo registram aceite funcional humano, sem autorização de implementação e sem prova de execução.

| Critério | Evidência | Situação | Pendência |
|---|---|---|---|
| GF01 — escopo correto | Seções 1/3: radar de velocidade fixo em T0003; catálogo/agentes T0004; maior J01 separado | HUMAN_APPROVED | Aceite limitado à primeira categoria; ampliações permanecem nos próprios gates |
| GF02 — jornadas completas | JF-01–JF-05 atualizadas; JF-06 reservada; entradas, alternativas, falhas/finais e responsáveis descritos | HUMAN_APPROVED | JF-01–JF-05 somente na parcela da primeira categoria; implementação futura, JF-06 reservada |
| GF03 — primeira categoria utilizável | Adendo técnico 11.1: perfil fixed_speed_radar v1, tipos/null/limites fictícios, referências e transportes exatos; matriz 7.1 | HUMAN_APPROVED | Contrato documental aprovado no alcance definido; implementação/migrations e V01-T3 futuros |
| GF04 — acesso viável | Adendo técnico 11.2: preparo operacional explícito/repetível, grant/ator estável, UUID público, GET existente e mesma origem | HUMAN_APPROVED | Preparo/proxy/configuração e prova real só em T0003; ausência atual de código/dataset não é bloqueio documental |
| GF05 — estado/manutenção separados | Adendo técnico 11.3 e seção 7.2: política ratificada de agenda opcional, pedido explícito, projeção e atomicidade I03 | HUMAN_APPROVED | T03-C ratificada sem redefinição normativa; implementação depende de autorização individual posterior |
| GF06 — feedback/concorrência | Seções 8/9: resultado incerto, mesma intenção, replay, versões, acesso e epoch; sem overwrite | HUMAN_APPROVED | Sem nova regra funcional pendente; testes de implementação continuam NOT RUN |
| GF07 — acessibilidade/usabilidade | Seção 10 preservada: teclado, rótulos, foco, feedback e estados textuais | HUMAN_APPROVED | Aceite funcional concedido; verificação futura da UI pendente, nenhum visual definido |
| GF08 — compatibilidade/governança | Normas/ADRs intactos; 20 tickets preservados; lacunas registradas em vez de novos contratos | HUMAN_APPROVED | Gate funcional aprovado somente nesta fatia; T0003 PLANNED / NOT_AUTHORIZED |

**Parecer consolidado: T0003_FUNCTIONAL_GATE_HUMAN_APPROVED.** Todos os oito critérios recebem aceite humano exclusivamente no alcance da primeira categoria. T03-C está ratificada, preservando os contratos preparados. O gate parcial funcional de T0003 não é o gate maior J01, que permanece dependente de T0004/T0006 e V01–V03. Os 16 V01-T3 e todas as verificações futuras de aplicação/UI continuam NOT RUN. T0003 permanece PLANNED / NOT_AUTHORIZED.

<a id="decisoes-pendentes"></a>
## 13. Fechamento direcionado T03-A/B/C e dependências residuais

A autorização atual permite somente registrar o aceite humano. D01–D04 permanecem **CLOSED — FUNCTIONALLY SPECIFIED**, com aprovação funcional da fatia e ratificação expressa de D04/T03-C. Contrato preparado e aprovado não é código executado. Não há campo, unidade, referência ou ramo de manutenção deixado para improvisação no código; os detalhes normativos permanecem intactos.

| Lacuna | Regra original / decisão consolidada | Contrato de implementação | Verificação futura | Residual / decisão humana |
|---|---|---|---|---|
| T03-A | R02 e seção 2 exigem perfil/atributos/referências/unicidade; radar fixo escolhido em D01 | [11.1](MVP_TECHNICAL_DESIGN.md#t03-a-perfil-radar): fixed_speed_radar v1, regulatedSpeedLimitKmh inteiro 1–200 km/h fictícios, DTOs/null/defaults/refs/versões e APIs mínimas | [V01-T3](VERIFICATION_GUIDE.md#v01-t3-radar), especialmente perfil, cadastro, unicidade, localização e edição | Contrato aprovado na fatia; migrations/API/UI/testes futuros. Parâmetros exclusivamente fictícios de demonstração, sem validade legal |
| T03-B | I01/ADR-0002 exigem contexto/grant; bootstrap existente é demo, D02 exige operational | [11.2](MVP_TECHNICAL_DESIGN.md#t03-b-contexto-operacional): preparo explícito separado, IDs fixos, epoch inicial/grant/ator existente, referência de build e GET atual | Preparo/repetição/colisões, sessão/grant/epoch e proxy em V01-T3 | Contrato aprovado na fatia; preparo e prova real pendentes. Bootstrap/checksum T0002 preservados |
| T03-C | I03/I05 e cadastro atômico preveem pedido/agenda se informados; D04 veda automatismo/atalho Equipment | [11.3](MVP_TECHNICAL_DESIGN.md#t03-c-manutencao-inicial): política demonstrativa ratificada, agenda opcional, pedido explícito com três estados de agenda, projeção/atomicidade | Ramos, erros, rollback, replay e limites de PATCH em V01-T3 | **RATIFICADA PELO RESPONSÁVEL** sem redefinição de regras; contrato preparado, implementação e verificação pendentes. Sem intervenção/missão antecipada |

A decisão humana do contrato/gate está resolvida no alcance definido. Permanecem pendentes autorização individual de T0003, implementação e provas futuras; eventual mudança normativa exige revisão própria. Os nomes T03-A/B/C não são tickets novos.

D05 (migração de categoria/mobilidade), D06 (demais transições administrativas) e D07 (sincronização histórica de documentos) permanecem fora do mínimo fechado, sem impedir a primeira fatia contratada. C01 mantém evidências/limites de validação Windows; C02 mantém 21 V00-I e oito integrações futuras pendentes; C03/C04/C05 e os 20 tickets são preservados.

## 14. Próxima etapa e encerramento

**T0003_FUNCTIONAL_GATE_HUMAN_APPROVED.** Aceite registrado por instrução expressa do responsável. O próximo passo é revisar as alterações documentais e criar um commit específico de aprovação, sob autorização correspondente; nenhum commit foi realizado aqui. Somente depois será considerada autorização individual para implementar T0003.

<a id="t0004-funcional"></a>
## 15. Complemento funcional exclusivo de T0004 — HUMAN_RATIFIED / HUMAN_APPROVED

**Estado vigente em 24/10/2026:** T0001/T0002/T0003 DONE / HUMAN_ACCEPTED; baseline main/236d2e2 limpa antes desta preparação. O registro v1.1 e GF01–GF08 acima preserva o aceite histórico exclusivamente de T0003; suas frases “não implementado/sem autorização” descrevem aquela etapa. A primeira jornada agora implementada é referência de compatibilidade, conforme [aceite T0003](T0003_REPORT.md#aceite-humano-t0003). A instrução “IGNIS — T0004 | Fechamento Contratual D05–D08 e Gate Funcional Complementar” autoriza somente documentação. Nenhuma UI nova foi criada/verificada.

T4-D05–T4-D08 são diretrizes aprovadas e detalhadas, sem renumerar D05–D07 históricos. **R-T4-01–07 HUMAN_RATIFIED**, pelo responsável em 24/10/2026 na instrução “IGNIS — T0004 | Formalização do aceite contratual R-T4-01–07 e do gate funcional complementar”. O aceite aprova exatamente os comportamentos desta seção e os [contratos 12.1–12.8](MVP_TECHNICAL_DESIGN.md#t0004-contrato), sem alterar sua redação funcional. Termos “proposta” preservados identificam a origem anterior ao aceite. Explicitamente ratificados: occupantCapacity inclui condutor, com limites fictícios sem validade regulatória; operational inicial de novo fixo exige declaração explícita e precondições documentadas, jamais inferência por endereço/coordenadas/base. Sem visual, dashboard ou mapa; J01 pendente; implementação não autorizada.

### 15.1. Equipamentos — ampliação de JF-02–JF-05

1. **Entrada/lista:** após acesso e contexto já contratados, destino Equipamentos separado de Agentes. Lista paginada identifica série, categoria/nome/versão, órgão, mobilidade e situação efetivamente recebida, com local cadastral resumido. Nenhum rótulo fixo de radar ou not_installed aplicado a todos; desconhecido/indisponível é explícito. Carregando, falha, vazio total e página além do total são estados distintos. Ordem/paginação do contrato técnico, sem novos filtros de mapa.
2. **Criação/seleção:** selecionar categoria por code/version explícito no catálogo autorizado. Mostrar nome, fixed/mobile e atributos/unidades/obrigatoriedade desse schema, com limites demonstrativos identificados como fictícios. Nenhuma categoria escolhida por posição no array, “mais recente” ou inferida da série. Até selecionar, não enviar formulário nem mostrar atributo de outro perfil. Organização ORG_LOCAL contextual continua referência, não campo livre.
3. **Troca durante rascunho não enviado:** preservar série, marca/modelo, criticidade e localizações compatíveis; identificar atributos específicos e manutenção inicial que ficariam incompatíveis com o novo perfil/causa. Pedir confirmação explícita para descartá-los. Cancelar mantém integralmente categoria e rascunho anteriores; confirmar troca e limpa os atributos específicos (mesmo nome em perfis diferentes não implica equivalência), limpando pedido inicial/motivo de estado incompatíveis após informar o que será descartado. Localização não admitida pela nova categoria não é convertida: após confirmação manter campos textuais em memória como rascunho não validado, retirar referência incompatível e exigir seleção válida; não reenviar dados inválidos silenciosamente. Dados de uma categoria não migram a um registro persistido.
4. **Intenção enviada/incerta:** não permitir trocar categoria, alvo, contexto ou campos da intenção até esclarecer confirmação. Não gerar nova commandId para contornar incerteza. Após rejeição definitiva 400/422, correção cria intenção revista com nova chave, preservando formulário; após sucesso ou consulta que esclareça o cadastro, novo cadastro é decisão explícita.
5. **Localização:** separar “Localização cadastral”, “Base adicional” e “Posição observada — indisponível nesta etapa”. Para fixo not_installed, explicar installation planejada versus base conhecida; nenhuma delas declara instalação realizada. Móvel usa base cadastrada, nunca “posição atual”. Campos de coordenadas podem estar ambos vazios conforme ramo permitido, sem geocodificar CEP ou preencher zeros. Ausência de região não bloqueia cadastro válido.
6. **Estado inicial proposto:** not_installed é padrão explícito. Radar v1 continua somente esse estado. Para os novos perfis, escolha operational exige declaração expressa e motivo; fixo requer instalação e coordenadas completas; móvel requer base cadastral válida. Mostrar “Declaro a situação inicial informada” antes da confirmação; endereço não seleciona operational. Não oferecer demais estados iniciais, ativação de registro existente ou controle administrativo pelo formulário cadastral.
7. **Manutenção inicial:** para cada perfil, consultar capacidade/causa/agenda ratificadas. Seleção de categoria não cria solicitação. Oferecer manifestação explícita; ao marcar, exigir motivo/prioridade e escolher dated/unknown/not_applicable com campos condicionais. Sem pedido: “Sem solicitação registrada / Agenda não informada”. Nenhuma data avulsa, prioridade inferida ou boolean independente. Não estender a causa do radar aos demais; dados inválidos mantêm formulário.
8. **Confirmação/detalhe:** sucesso somente após commit informado; abrir detalhe confirmado com atributos do perfil e unidade, situação real, versão, órgão, cadastro/base e projeção de Maintenance. Replay confirma a intenção original, seguido de GET atual; falha do GET posterior não invalida a confirmação já obtida. Não rotular posição/heartbeat como atual sem observação.
9. **Edição:** abrir pelo detalhe/version; permitir apenas C-E, com atributos completos do perfil persistido. Categoria/versão, órgão, mobilidade, estado e manutenção são somente leitura. Mudança de atributos valida contra aquela versão, sem upgrade automático. No-op confirmado explica que não houve mudança; cancelar não grava. Duplicidade série 409 orienta conferir registro, sem iniciar cadastro alternativo oculto.
10. **Concorrência:** VERSION_CONFLICT mantém o rascunho em memória, consulta versão atual para comparação e exige revisão expressa antes de nova intenção; nenhuma adoção automática de versão, sobrescrita ou merge. Experiência entre abas não promete atualização em tempo real, polling, notificações ou sincronização oculta.

### 15.2. JF-06 — jornada completa proposta de Agent

| Etapa | Comportamento verificável / alternativa segura |
|---|---|
| Entrada e navegação | Acesso/contexto existentes; destino Agentes com retorno a Equipamentos no mesmo dataset/epoch; abandono de rascunho exige confirmar descarte |
| Lista / vazio | Carregar GET D/agents; matrícula/identificação pública, nome fictício, função, órgão e atividade retornada; paginação/total reais; “Nenhum agente cadastrado neste contexto” apenas em total zero, erro separado |
| Cadastro | Formulário institucional fictício com matrícula, nome fictício, função, órgão permitido, localização institucional e base adicional opcional; initialActivity unknown é informação, sem seletor operacional |
| Validação | Tipos/normalização/null/limites de 12.3 técnica; matrícula obrigatória normalizada; erro associado ao campo + resumo; sem CPF, telefone pessoal, residência ou atributos de sensor |
| Confirmação | Uma intenção/commandId preservada em memória; aguardar 201; mostrar identificação AG-01 normalizada e abrir detalhe; cancelamento anterior ao envio não grava |
| Detalhe | AgentView, versão, matrícula/nome/função/órgão; atividade separada; instituição e base rotuladas; posição dinâmica indisponível, sem manutenção de equipamento |
| Edição permitida | Matrícula, nome fictício, função, cadastro/base; expectedVersion do detalhe; órgão/kind/atividade imutáveis; no-op sem evento/revisão nova; retorno ao detalhe após confirmação |
| Matrícula duplicada | 409 ENROLLMENT_CONFLICT mantém rascunho; orientar consultar agentes existentes; não substituir outro Agent, reutilizar série ou criar nova chave automaticamente para insistir |
| Concorrência | Uma edição obsoleta recebe VERSION_CONFLICT; comparar consulta atual/rascunho, revisar explicitamente e só então nova commandId/expectedVersion; replay antigo não sobrescreve consulta atual |
| Sessão expirada | Interromper envio, ocultar dados protegidos, bloquear rascunho em memória; novo acesso e confirmação do mesmo contexto antes de retomar; perda do CSRF requer acesso existente, sem endpoint inventado |
| Confirmação incerta | Timeout/rede/500/503 mantém contexto, método, alvo, body, commandId e versão originais imutáveis; tentativa explícita consulta confirmação por reenvio; nenhum sucesso/fracasso de commit presumido |
| Instituição/base | Cadastro institucional obrigatório e base adicional opcional; coordenadas par completo ou ausentes; sem duplicação automática ou inferência de posição/atividade; retirar base não retira cadastro |
| Acessibilidade funcional | Fluxo completo por teclado, rótulos e instruções associados, campos condicionais anunciados, foco no destino/resumo de erros e mensagens textuais persistentes; largura menor sem perda de ações/valores |

Sem despacho, missão, alocação, rastreamento, conta de autenticação ou dados reais de pessoas. Inicial unknown é proposta de atividade, não ausência convertida em available. Ao trocar destino, não tratar Agent como Equipment nem conservar sua commandId para outra operação/alvo.

### 15.3. Recuperação, contexto e acessibilidade compartilhados

Preservar regras 8–10 para ambas as jornadas; códigos efetivos conforme 12.3 técnica, sem renomear os existentes. 401 UNAUTHORIZED exige novo acesso; 403 distingue READ_ONLY, ORIGIN_FORBIDDEN, CSRF_FORBIDDEN e CONTEXT_FORBIDDEN, sem retry automático. 429 respeita espera; dados inválidos não são “rede indisponível”. Mensagens incluem código/requestId seguros, sem stack/SQL/segredos.

Rascunho só em memória, vinculado a dataset/epoch/tipo/alvo/perfil. Perda de acesso o bloqueia; contexto diferente invalida seu uso operacional e exige descarte/novo cadastro explícitos, sem transposição automática. Se intenção incerta existir, avisar que descartá-la não desfaz possível commit; orientar consulta antes de outra criação. Recarregar/fechar pode perder a chave: não prometer recuperação idempotente sem ela, nem persistir segredo/CSRF/intenção no navegador por conta própria.

Campos condicionais possuem nomes/unidades/obrigatoriedade e feedback textual; campos ocultos não são enviados como atributos de outro schema. Confirmação de descarte mantém foco previsível na categoria/ação que a originou; cancelar preserva campos. Navegação identifica destino e contexto, anuncia salvando/sucesso/falha, não usa cor como único sinal, não depende de hover e não desloca foco em consultas rotineiras. Auditoria completa de leitor de tela é verificação futura, não evidência desta documentação.

<a id="gate-funcional-t0004"></a>
## 16. GATE FUNCIONAL COMPLEMENTAR T0004 — HUMAN_APPROVED

**GF-T4-01–12: HUMAN_APPROVED**, em 24/10/2026 por decisão expressa do responsável na instrução de formalização acima. Os sete grupos [R-T4-01–07](MVP_TECHNICAL_DESIGN.md#t0004-ratificacao) estão HUMAN_RATIFIED. Identificadores, critérios e vínculos da matriz permanecem os mesmos, acrescentando somente o estado do aceite. GF01–GF08 da fatia T0003 não foram reabertos. Aprovação funcional não significa implementação, execução ou aprovação de testes; V01-T4-01–24 NOT RUN e T0004 PLANNED / NOT_AUTHORIZED.

| ID complementar | Critério verificável para revisão humana | Evidência futura / vínculo  Estado |
|---|---|---|---|
| GF-T4-01 | Cobertura de 14 perfis, schemas/unidades fictícias e mobilidades compreensíveis; radar v1 preservado | 12.1 técnica; V01-T4-01–04 | HUMAN_APPROVED |
| GF-T4-02 | Seleção explícita e troca de rascunho com preservação de comuns, confirmação de descarte e nenhuma conversão de registro persistido | 15.1 passos 2–4; V01-T4-17/19 | HUMAN_APPROVED |
| GF-T4-03 | Lista/detalhe/edição exibem categoria/versão/mobilidade/situação reais e atributos do perfil, sem suposições da primeira categoria | 15.1; V01-T4-02/18 | HUMAN_APPROVED |
| GF-T4-04 | JF-06 completa: identidade própria, unicidade, cadastro/consulta/edição, vazio/paginação e finalidade fictícia institucional | 15.2; V01-T4-06/07/18 | HUMAN_APPROVED |
| GF-T4-05 | Cadastro/instalação/base/observação e ausência de ponto estão separados; sem atualidade/estado inferidos | 12.4 técnica; V01-T4-09–11 | HUMAN_APPROVED |
| GF-T4-06 | Estados iniciais e ramo operational/motivo são deliberados; radar legado continua limitado; sem transição por PATCH | 12.5 técnica; V01-T4-20 | HUMAN_APPROVED |
| GF-T4-07 | Capacidade/agenda/pedido explícito por perfil e projeção sem automatismo ou atalho Equipment | 12.2 técnica; V01-T4-21 | HUMAN_APPROVED |
| GF-T4-08 | Erro recuperável, duplicidade, versão, replay e resultado incerto preservam intenção; reconsulta/revisão explícitas | 15.3; V01-T4-12–15/19 | HUMAN_APPROVED |
| GF-T4-09 | Teclado/foco/rótulos/campos condicionais/mensagens/largura menor especificados, sem definição visual | 15.2/15.3; V01-T4-19 | HUMAN_APPROVED |
| GF-T4-10 | Contexto/sessão/CSRF e isolamento não são alterados; ausência de atualização entre abas é clara | V01-T4-12/24; ressalva manual T0003 preservada | HUMAN_APPROVED |
| GF-T4-11 | Migração/replay/regressões preservam a base aceita; limitações e fronteiras T0005–T0020 identificadas | 12.6/12.7 técnica; V01-T4-05/13/22/23 | HUMAN_APPROVED |
| GF-T4-12 | Ratificação documental, aprovação funcional e autorização individual são separadas; J01/ADRs não encerrados | [Rastreabilidade](TICKETS.md#preparacao-t0004); todos V01-T4 NOT RUN | HUMAN_APPROVED |

Critério humano deste gate é avaliar os fluxos e contratos escritos; execução futura comprovará o comportamento. Não condicionar revisão documental à criação de SQL/UI. A [concorrência manual T0003](KNOWN_ISSUES.md#concorrencia-manual-t0003) permanece MANUAL_INCONCLUSIVE e V01-T3-13 PASS histórico. V01-T4-24 é acompanhamento da experiência, sem promoção automática a bloqueio se integridade automática e interação segura forem comprovadas.

**Parecer vigente: T0004_CONTRACT_AND_FUNCTIONAL_GATE_HUMAN_APPROVED.** R-T4-01–07 HUMAN_RATIFIED e os 12 GF-T4 HUMAN_APPROVED, sem alterar os fluxos/contratos aprovados. O parecer anterior de prontidão foi sucedido por este aceite humano; T0004 permanece PLANNED / NOT_AUTHORIZED. Nenhuma implementação, teste de aplicação, build, migração, staging ou commit. Próxima etapa: conferência documental e eventual commit específico sob autorização própria, seguido de eventual autorização individual de implementação; nenhum desses atos foi autorizado agora.


T0003 e posteriores permanecem PLANNED / NOT_AUTHORIZED. Sem código, configuração, schema executável, bootstrap/migration, instalação, execução de testes/build, design visual, staging ou commit. A ausência atual desses artefatos é implementação futura, não lacuna do contrato preparado. A execução termina nesta documentação e no relatório.

<a id="t0005-funcional"></a>
## 17. T0005 — jornadas e gate ratificados, 25/10/2026

Autorização humana: “IGNIS — T0005 | Formalização documental dos contratos ratificados”. Aprova expressamente T5-D01–D16, condições A01–A05, **JF-T5-01–03 e GF-T5-01–12** e somente a formalização documental. [Contratos técnicos](MVP_TECHNICAL_DESIGN.md#t0005-contrato) são HUMAN_RATIFIED; critérios abaixo HUMAN_APPROVED. T0005 **PLANNED / NOT_AUTHORIZED**, sem UI implementada/homologada por esta aprovação. T0001–T0004 permanecem DONE / HUMAN_ACCEPTED. [Governança](TICKETS.md#contratos-t0005); [testes futuros NOT_RUN](VERIFICATION_GUIDE.md#v02-t5).

### 17.1. JF-T5-01 — preparação e confirmação

Objetivo: solicitar baseline fictício deliberadamente no demo autorizado e elegível. Sequência: acesso local → confirmar dataset/epoch → GET contextual de elegibilidade → configurar parâmetros → revisão textual → confirmar ou cancelar. Não escolher automaticamente um demo ou tratar UUID/configuração como permissão. O servidor declara tipo/impedimentos; o cliente não os infere pelo nome do dataset.

Defaults visíveis/editáveis antes de confirmar: seed **ignis-t5-001**, baseTime **2026-10-24T12:00:00.000Z**, cenário ignis-baseline/1, gerador t5-baseline-v1 e PRNG sha256-counter32-v1; distribuição 20 Equipment/6 Agents/14 categorias de [13.6 técnica](MVP_TECHNICAL_DESIGN.md#t0005-contrato). Não preencher silenciosamente a hora atual. Quantidades/categorias são explícitas, limites 200/30 independentes do preset. Validação estrita, sem IDs livres ou controles de futuro.

A revisão identifica dataset/epoch/revisão esperada, seed/baseTime/versões, categorias/quantidades, todos os Equipment not_installed, todos os Agents unknown e pedidos conforme preset (15 no padrão). Informa que coordenadas são cadastrais demonstrativas, seis recursos padrão não têm ponto, região não atribuída, sem observação/telemetria/ticks/histórico/mapa/reset. Confirmar é decisão explícita; cancelar não envia POST nem grava. Ao abandonar parâmetros alterados, confirmar descarte; não prometer persistência de rascunho após fechar/recarregar. Nenhuma implementação visual deliberada autorizada.

### 17.2. JF-T5-02 — geração e consulta do manifesto

Confirmar cria uma intenção única em memória {contexto,método,rota,commandId,corpo normalizado,expectedRevision}. Durante envio, bloquear edição/disparo duplicado e manter os valores. Indicador de espera representa requisição em andamento, sem percentual inventado, job/ScenarioRun ou polling de execução inexistentes.

201 informa commit confirmado. Exibir manifesto, contagens reais, identidade/proveniência sintética, hashes e revisão de criação; consultar GET posterior para revisão atual. O manifesto inicial é imutável e não deve parecer recalculado de registros editados. Replay confirma a intenção original e usa indicador próprio; leitura posterior mostra estado atual. A geração confirma uma revisão com eventos individuais, não um salto de revisão por item.

Lista/detalhe cadastral permanecem disponíveis pelo inventário; seleção do manifesto não altera dados. Nenhum GET gera ou prepara referências. Falha de consulta após sucesso mantém a confirmação e oferece somente nova consulta, sem reenviar mutação automaticamente.

### 17.3. JF-T5-03 — recuperação e isolamento

| Situação | Estado/mensagem e ação segura |
|---|---|
| Timeout/rede/500/503 de POST | Resultado incerto; manter a mesma intenção imutável; retry explícito da mesma chave/corpo/contexto/revisão, sem presumir rollback |
| 401/sessão perdida ou CSRF inválido | Solicitar novo acesso; bloquear dados/rascunho conforme fluxo existente; retomar somente após confirmar o mesmo contexto, preservando intenção/guarda |
| Epoch alterado/aposentado | Bloquear envio antigo; reconfirmar contexto e exigir descarte explícito; não remapear intenção para outro epoch |
| Outra Kc e baseline existente | Consultar manifesto existente; conflito não é replay nem autorização para substituir/mesclar |
| Demo não vazio/referência divergente | Explicar impedimento; nenhuma limpeza, reparo ou complemento silencioso |
| Fechar/reabrir sem chave | Consultar manifesto antes de nova geração; não afirmar recuperação de recibo/commandId ou persistência de intenção |
| GET sem manifesto após incerteza | Informar apenas que não foi observado manifesto confirmado nessa leitura; isso não prova falha de tentativa ainda em andamento |
| GET falha após 201/replay confirmado | Preservar “geração confirmada”; consulta indisponível é separada; não gerar nova chave ou novo POST |
| Contexto operacional | GET autorizado informa inelegível/DEMO_ONLY; POST é proibido. Não representar esse impedimento de geração como perda geral da sessão/inventário |
| 400/422 | Distinguir rejeição de dados de falha de rede; correção deliberada após rejeição definitiva cria intenção revista, nunca durante incerteza |
| 429/busy | Espera informada e retry explícito, sem laço infinito ou alteração de parâmetros para contornar limite |

Ao descartar intenção incerta, avisar que isso não desfaz possível commit. Sessão HttpOnly persistida não equivale a intenção/CSRF recuperados. Não persistir segredo, CSRF ou intenção no navegador por conta própria; não adicionar endpoint de recibos.

Estados funcionais: **verificando contexto, inelegível, configurando, revisando, enviando, confirmado, resultado incerto, acesso necessário, contexto alterado e consulta indisponível**. Mensagens têm código/requestId seguro, sem stack/SQL/segredos; cor não é único indicador. Foco acompanha confirmação/erros/destino; consultas rotineiras não deslocam foco indevidamente.

<a id="gate-funcional-t0005"></a>
### 17.4. GF-T5-01–12 — HUMAN_APPROVED

Todos aprovados expressamente em 25/10/2026 pela autorização da seção 17; aprovação é de contrato funcional, não implementação, homologação, design visual ou liberação de ticket.

| Critério | Comportamento ratificado | Jornada / verificação | Estado |
|---|---|---|---|
| GF-T5-01 | Dataset/tipo/epoch e elegibilidade confiáveis do servidor, sem privilégio pelo UUID | JF-T5-01/03; V02-T5-17/18/25 | HUMAN_APPROVED |
| GF-T5-02 | Formulário de versões/seed/baseTime/contagens e limites estritos, sem futuro | JF-T5-01; V02-T5-05/06/20/25 | HUMAN_APPROVED |
| GF-T5-03 | Preset 20/6 e cobertura das 14 categorias explícitos; máximo 200/30 distinto | JF-T5-01; V02-T5-05/08/10/25 | HUMAN_APPROVED |
| GF-T5-04 | Revisar/confirmar/cancelar; cancelamento sem escrita | JF-T5-01; V02-T5-25 | HUMAN_APPROVED |
| GF-T5-05 | Uma intenção por envio, campos bloqueados, sem duplicação por clique | JF-T5-02; V02-T5-13/14/25/26 | HUMAN_APPROVED |
| GF-T5-06 | Sucesso após commit; manifesto inicial distinto do estado/revisão atuais | JF-T5-02; V02-T5-10/11/24 | HUMAN_APPROVED |
| GF-T5-07 | Incerteza preserva chave/corpo/contexto/guarda; reenvio explícito | JF-T5-03; V02-T5-11/16/26 | HUMAN_APPROVED |
| GF-T5-08 | Reautenticação não troca intenção/contexto silenciosamente | JF-T5-03; V02-T5-17/26 | HUMAN_APPROVED |
| GF-T5-09 | Epoch diferente bloqueia e exige descarte explícito, sem remapeamento | JF-T5-03; V02-T5-18/26 | HUMAN_APPROVED |
| GF-T5-10 | Fechar não promete recuperar chave; consultar antes de outra criação | JF-T5-03; V02-T5-24/26 | HUMAN_APPROVED |
| GF-T5-11 | Falha de GET após sucesso não invalida commit nem gera POST automático | JF-T5-02/03; V02-T5-26 | HUMAN_APPROVED |
| GF-T5-12 | Teclado/foco/rótulos/erros textuais/largura reduzida; sem alegar leitor de tela não testado | Todas; V02-T5-25/26 | HUMAN_APPROVED |

Preservar GF01–GF08, GF-T4-01–12, JF-01–JF-06 e T03-C. O novo gate não ratifica operacional inicial para o preset, transição de estado, manutenção avançada, geografia, mapa ou simulação. J01, C01–C05 e T0006–T0020 permanecem nos gates próprios. Nenhum trabalho visual, código, build ou teste de aplicação executado nesta formalização.
