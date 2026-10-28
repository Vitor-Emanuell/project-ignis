# Decisões arquiteturais

Em **23/10/2026**, o responsável pelo projeto aprovou formalmente os três ADRs **com condições**, na instrução humana “IGNIS — Formalização da Aprovação Arquitetural”, seções 1–2. A revisão arquitetural foi encerrada; implementação continua dependente de autorização humana individual.

| ADR | Decisão arquitetural aprovada | Estado | Condições rastreadas |
|---|---|---|---|
| [0001](0001-monolito-stack-persistencia.md) | Monólito modular, stack e persistência única | Accepted — Conditional | C01: compatibilidade em T0001/T0002 |
| [0002](0002-eventos-snapshots-e-isolamento.md) | Atomicidade, polling e isolamento por geração | Accepted — Conditional | C02: hash antes de T0002; C03: precedência temporal antes de T0007 |
| [0003](0003-predicao-explicavel-e-missoes.md) | Índices explicáveis e manutenção desacoplada dos jogos | Accepted — Conditional | C04: reservas antes de T0015; C05: limitações e verificação P01/P02 |

## Semântica dos estados e gates

- **Proposed:** proposta sem aceite humano; não é decisão aprovada.
- **Accepted — Conditional:** decisão aprovada por humano, com condições abertas. Não significa correção contratual concluída nem teste técnico aprovado. Cada condição tem prazo/gate e evidência em [KNOWN_ISSUES](../KNOWN_ISSUES.md#condicoes-do-aceite).
- **Accepted:** aceite sem condições remanescentes, somente após evidência e registro humano de encerramento; não atribuído nesta execução.
- **Superseded:** decisão substituída, preservada com referência ao ADR sucessor.

**Correção contratual pendente** exige especificação normativa revisada antes do ticket bloqueado. **Verificação técnica pendente** exige execução autorizada e resultado observado nos tickets indicados. **Ticket autorizado** exige instrução humana individual que nomeie o ticket, além de dependências e gates atendidos. Nenhum ticket está autorizado nesta execução; todos continuam `PLANNED / NOT_AUTHORIZED`.

Aceites adicionais: F01–F09 preservadas; distribuição local é entrega mínima obrigatória e hospedagem pública é adicional sujeita à viabilidade e autorização própria. Mantidos os 20 tickets e a separação entre System Architecture e System Design. System Design funcional mínimo deve estar preparado/aprovado antes de T0003; não bloqueia T0001/T0002 e não foi autorizado nem produzido aqui.

Os ADRs registram decisões e justificativas; contratos normativos continuam no [design técnico](../MVP_TECHNICAL_DESIGN.md). Regras atuais de execução: [AGENTS](../../AGENTS.md); gates por ticket: [TICKETS](../TICKETS.md#condicoes-do-aceite). Trechos históricos v1.1 preservados nos ADRs não representam o status atual.
