# ADR-0001 — Monólito modular, stack e persistência única

**Status: Accepted — Conditional.** Data da decisão e aprovação: 23/10/2026. Aprovador: responsável pelo projeto (usuário). Evidência: instrução humana “IGNIS — Formalização da Aprovação Arquitetural”, recebida nesta execução, seção 1. O aceite aprova a decisão arquitetural com condições; não comprova correções contratuais ou verificações técnicas e não autoriza tickets. Semântica do status: [índice dos ADRs](README.md).

## Contexto

As jornadas exigem estados, histórico e alertas consistentes, com execução local e prazo curto. O repositório não contém implementação ou preferência tecnológica comprovada. [Comparação de stack](../SYSTEM_ARCHITECTURE.md#alternativas-de-stack).

## Alternativas

1. Monólito TypeScript, SPA Vue, Fastify e SQLite/SQL explícito.
2. SPA React e backend Python/FastAPI, PostgreSQL/SQLAlchemy.
3. Separar ingestão, operação e análises em serviços; exigiria comunicação confiável e coordenação adicional.

## Decisão aprovada condicionalmente

Adotar a alternativa 1 e os limites modulares da [arquitetura](../SYSTEM_ARCHITECTURE.md#estilo-arquitetural-e-limites). Sem ORM, broker ou serviço de IA obrigatório. As versões exatas serão verificadas e fixadas somente após liberação.

## Justificativa

Uma linguagem reduz integração entre ferramentas; transação local resolve a consistência central; análises aritméticas não exigem Python. SQLite evita operar um servidor de banco. Separar processos não traz benefício demonstrado para a carga presumida. A avaliação é qualitativa, sem benchmark.

## Consequências

Um serviço construído, banco local persistente e módulos com contratos internos. SQL explícito aumenta responsabilidade por mapeamento, migrations e testes. O acesso síncrono requer consultas e transações curtas. Não há escalabilidade horizontal de escrita nesta proposta.

## Histórico da recomendação v1.1 (anterior ao aceite)

Revisão v1.1: recomendação mantida. Simplificação proposta, ainda não aprovada: fundação local mínima, um processo e SQL explícito; tabelas/serviços de features entram no ticket que as usa, conforme [matriz incremental](../SYSTEM_ARCHITECTURE.md#fundacao-minima). T0001 verifica runtime/build; T0002 driver Windows, versão SQLite, FKs, persistência e rollback; hipótese de carga só é confirmada em T0011. Sem benchmark realizado. Aprovação humana necessária para manter stack/persistência e aceitar esse sequenciamento; publicação pública é decisão posterior e não requisito da primeira fatia. Status continua Proposed.

Driver nativo no Windows, contenção de escrita, consultas espaciais e familiaridade real da equipe precisam de evidência. Reabrir se T0001/T0002 não validarem compatibilidade, se carga medida falhar após ajuste de consultas, se houver múltiplas instâncias escritoras ou se a equipe tiver domínio significativamente maior da alternativa 2. A troca de banco não é automática nem justifica criar abstrações antecipadas.

## Condições do aceite — 23/10/2026

Mantidos monólito modular, Vue 3, TypeScript, Vite, Node.js, Fastify, SQLite, SQL parametrizado e Leaflet. A fundação incremental permanece conforme as fontes vinculadas.

- **C01 — verificação técnica pendente:** T0001 verifica compatibilidade de runtime/build; T0002 verifica driver no Windows, versão SQLite, FKs, persistência e rollback (V00). Nenhuma verificação foi executada. Incompatibilidade exige revisão humana, sem troca automática de stack.

Condições e evidências de encerramento: [registro central](../KNOWN_ISSUES.md#condicoes-do-aceite). **Nenhum ticket autorizado; T0001 não executado.** O histórico v1.1 acima descreve o parecer anterior e não substitui este aceite.
