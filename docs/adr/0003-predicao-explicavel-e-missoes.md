# ADR-0003 — Análises explicáveis e fronteira da manutenção gamificada

**Status: Accepted — Conditional.** Data da decisão e aprovação: 23/10/2026. Aprovador: responsável pelo projeto (usuário). Evidência: instrução humana “IGNIS — Formalização da Aprovação Arquitetural”, recebida nesta execução, seção 1. O aceite aprova a decisão arquitetural com condições; não comprova correções contratuais ou verificações técnicas e não autoriza tickets. Semântica do status: [índice dos ADRs](README.md).

## Contexto

Há duas capacidades analíticas e três minigames obrigatórios no escopo escolhido. O histórico inicial é sintético; não há base para alegar probabilidade de falha validada. Um jogo não pode determinar sozinho a verdade operacional.

## Alternativas

- Scores heurísticos versionados e limitados aos fatores disponíveis, ou modelos estatísticos/ML com necessidade maior de histórico e validação.
- Cada jogo altera equipamento, ou um motor comum valida tentativas e chama o domínio Maintenance.

## Decisão aprovada condicionalmente

Adotar P01/P02 e protocolo de validação definidos em [predição](../MVP_TECHNICAL_DESIGN.md#predicao), sem alegação probabilística; usar motor de missões independente de mecânicas, com efeito apenas simulado autorizado por Maintenance, conforme [contrato de missões](../MVP_TECHNICAL_DESIGN.md#missoes).

## Justificativa

Fatores rastreáveis tornam a demonstração auditável no prazo e permitem abster-se quando faltam dados. A validação no servidor e uma intervenção por missão preservam integridade sob retries e concorrência. Maintenance decide o estado mesmo quando há falhas simultâneas; o jogo apenas oferece evidência de conclusão do desafio.

## Consequências

Pesos/limiares são parâmetros demonstrativos, não calibrados. Resultados podem mostrar dados insuficientes ou não superar baseline. Mecânicas precisam oferecer evidência verificável, sem acesso direto a tabelas. Comunicação pode continuar atrasada após jogo até chegar observação válida.

## Histórico da recomendação v1.1 (anterior ao aceite)

Revisão v1.1: recomendação mantida como índice heurístico demonstrativo. [Contrato analítico](../MVP_TECHNICAL_DESIGN.md#predicao) explicita unidades, coorte, razão temporal ponderada e renormalização quando Q não se aplica; correções de ambiguidade, sem mudança de pesos/modelo. [Matriz de validação](../VERIFICATION_GUIDE.md#validacao-v11) separa correção da implementação e capacidade preditiva externa, esta última não demonstrada. Simplificação proposta: amostra/cenários menores, cálculo sob demanda na contingência e uma dificuldade por jogo, preservando fatores/insuficiência e validação no servidor. T0015 entrega motor; T0016–18 são adaptadores independentes. Persistem sobreajuste sintético e risco de prova fraca. Aprovação humana necessária para método/parâmetros/limitações, fronteira de manutenção simulada e gates funcionais das mecânicas. Status continua Proposed.

Sobreajuste ao gerador, extrapolação indevida, prova de solução fraca e divergência entre causas. Reavaliar método com dados externos representativos e avaliação temporal; probabilidade somente após calibração demonstrada. Reavaliar integração de manutenção real em decisão independente, nunca como extensão silenciosa da gamificação.

## Condições do aceite — 23/10/2026

- **C04 — correção contratual pendente, antes de T0015:** definir liberação condicional de reservas. Expiração, falha ou cancelamento só podem liberar reserva ainda pertencente à missão; nunca reabrir solicitação resolvida/cancelada ou sobrescrever estado administrativo, incluindo `disabled` e `stolen`. Especificar guardas e concorrência na fonte normativa; V09 em T0015 verificará esses casos.
- **C05 — limitação aprovada, verificação técnica pendente:** preservar P01/P02 como índices heurísticos demonstrativos. Limites documentais já estão explícitos na seção 9 do design técnico; T0013/T0014 e V07/V08 devem verificar cálculos, cortes, comunicação dos resultados e limitações. Validade preditiva estatística/externa permanece não demonstrada; não é inferida deste aceite.

Condições e evidências de encerramento: [registro central](../KNOWN_ISSUES.md#condicoes-do-aceite). **Nenhum ticket autorizado; T0001 não executado.** O histórico v1.1 acima descreve o parecer anterior e não substitui este aceite.
