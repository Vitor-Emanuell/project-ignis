# ADR-0002 — Eventos transacionais, snapshots e gerações

**Status: Accepted — Conditional.** Data da decisão e aprovação: 23/10/2026. Aprovador: responsável pelo projeto (usuário). Evidência: instrução humana “IGNIS — Formalização da Aprovação Arquitetural”, recebida nesta execução, seção 1. O aceite aprova a decisão arquitetural com condições; não comprova correções contratuais ou verificações técnicas e não autoriza tickets. Semântica do status: [índice dos ADRs](README.md).

## Contexto

Telemetria pode repetir, atrasar ou chegar após reset. Alertas e indicadores não podem divergir do estado confirmado. Demonstrações e tour podem coexistir sem interferência.

## Alternativas

- Persistência e projeções síncronas na mesma transação, com consulta por polling.
- Fila/outbox e projeções assíncronas; maior tolerância a carga, mas consistência eventual e recuperação mais complexas.
- Atualização por SSE/WebSocket desde o início; reduz atraso potencial, mas adiciona reconexão/entrega e requisitos de hospedagem.
- Reset por apagar tabelas compartilhadas, banco separado por sessão ou namespace/geração no mesmo banco. Apagar globalmente é inseguro; banco por sessão dificulta ciclo de vida e conexões.

## Decisão aprovada condicionalmente

Transação local com histórico, projeções, alertas e recibos; polling de snapshot consistente; datasets isolados com epoch e troca atômica do ponteiro ativo. Contratos normativos: [I01–I08](../MVP_TECHNICAL_DESIGN.md#contratos), [pipeline](../MVP_TECHNICAL_DESIGN.md#telemetria) e [reset](../MVP_TECHNICAL_DESIGN.md#simulacao).

## Justificativa

O volume proposto cabe numa estratégia simples a verificar. Polling consulta fatos confirmados e se recupera sem replay de notificações. Contexto nas FKs e guardas de geração impedem que callbacks ou jogos antigos reparem equipamentos da nova execução. Não se promete entrega exatamente uma vez; o processamento é idempotente sob reenvio.

## Consequências

Chaves/contexto adicionais, recibos persistidos e disciplina de validação em toda escrita. Reset exige staging e fencing de tarefas; o frontend renova contexto ao detectar epoch incompatível. Snapshot evita combinar contagens e mapa de instantes diferentes. Há latência e custo periódicos de leitura.

## Histórico da recomendação v1.1 (anterior ao aceite)

Revisão v1.1: recomendação mantida; nenhuma garantia de idempotência, atomicidade ou isolamento foi removida. Simplificação proposta: T0002 fornece contexto/epoch e recibo SQL mínimos; T0007 introduz cursores; T0009 introduz staging/token/CAS e scheduler único sem depender do histórico T0008. Testes por estágio estão no [guia](../VERIFICATION_GUIDE.md#validacao-v11). Provisão de visitantes não é parte da fundação local; sem controles completos, exposição pública fica somente leitura. Persistem riscos de corrida e bloqueio síncrono, ainda não medidos. Aprovação humana necessária para consistência, contexto/geração, polling e introdução incremental. Status continua Proposed.

Vazamento entre contextos, transações grandes de seed, crescimento de snapshots e falhas de ordenação. Validar com concorrência, crash e eventos atrasados. Reavaliar SSE se polling não cumprir metas medidas; outbox somente quando efeitos precisarem sair do processo ou processamento síncrono não couber no orçamento. Não adicionar transportes paralelos sem decisão explícita.

## Condições do aceite — 23/10/2026

- **C02 — correção contratual pendente, antes de T0002:** especificar na fonte normativa a lista de campos imutáveis e a canonicalização do hash de comandos/eventos, excluindo metadados e horários derivados do processamento. V00 em T0002 e V05 em T0007 devem comprovar replay equivalente e conflito por conteúdo imutável divergente.
- **C03 — correção contratual pendente, antes de T0007:** definir precedência temporal entre telemetria e conclusão de manutenção. Observações anteriores à intervenção não podem reabrir causas resolvidas; falhas genuinamente posteriores devem continuar sendo aceitas. Definir comparação, empate e episódios sem depender da ordem de chegada. V05 em T0007 e V06 em T0012 verificarão as duas ordens de processamento.

O aceite não declara essas especificações concluídas. O pipeline atual é insuficiente para encerrar C02/C03; seus gates estão no [backlog](../TICKETS.md#condicoes-do-aceite).

Condições e evidências de encerramento: [registro central](../KNOWN_ISSUES.md#condicoes-do-aceite). **Nenhum ticket autorizado; T0001 não executado.** O histórico v1.1 acima descreve o parecer anterior e não substitui este aceite.
