# Templates de trabalho

Antes de usar um template, ler [AGENTS](../AGENTS.md), estado real, ticket e fontes vinculadas. Todos os modelos herdam o gate humano e o limite de áreas do ticket; preencher os campos entre colchetes. Regras e requisitos não devem ser copiados para este arquivo.

## Implementar um ticket

> Autorização humana posterior à aprovação arquitetural: [referência e ticket]. Execute somente [Txxxx], após verificar dependências e estado do projeto. Leia suas fontes normativas e limite alterações às áreas permitidas; preserve áreas proibidas e não objetivos. Não antecipe trabalho dependente. Se surgir decisão arquitetural ou dependência não autorizada, registre e comunique o bloqueio. Execute os casos [Vxx] pertinentes e verificação manual prevista. Entregue relatório com arquivos/alterações, comportamento, comandos e resultados reais, testes não realizados e motivo, riscos e pendências. Não faça merge, push ou deploy. Atualize somente as fontes documentais afetadas e encerre.

## Revisar um ticket

> Revise somente a entrega de [Txxxx], comparação [base/arquivos]. Verifique critérios de aceitação, contratos, áreas permitidas/proibidas e regressões relacionadas, sem corrigir ou ampliar escopo. Faça verificações pertinentes e relate resultados ou motivo de não execução. Produza achados acionáveis com arquivo/local, impacto e evidência; informe também critérios não demonstrados, limitações e bloqueios. Ausência de achado não equivale a teste executado. Atualize documentação apenas se explicitamente solicitado.

## Corrigir uma regressão

> Corrija apenas a regressão [descrição/reprodução], dentro de [áreas autorizadas], associada a [ticket/contrato]. Confirme comportamento esperado na fonte normativa; reproduza a falha, faça a menor correção coerente e teste o fluxo afetado e sua integração crítica. Não use a correção para refatorar áreas alheias ou mudar arquitetura. Se exigir mudança de contrato, registre bloqueio antes de implementar. Relate causa, alterações/arquivos, evidência antes/depois, testes realizados/não realizados, risco residual e pendências.

## Atualizar documentação

> Atualize somente [documentos/assunto], mantendo a informação na sua fonte responsável conforme o README. Preserve conteúdo relevante, use referências cruzadas e diferencie proposta, aprovação e comportamento observado. Não altere código/configuração nem aprove decisões por conta própria. Verifique links, consistência de nomes/estados e impacto nas referências; relate arquivos e verificações reais, testes de aplicação não realizados e eventuais conflitos/bloqueios. Se houver conflito substancial, registre-o para decisão humana sem resolver silenciosamente.

## Solicitar revisão arquitetural

> Prepare proposta para [problema comprovado], sem implementar. Identifique ADR/contratos/tickets afetados, evidência, alternativas proporcionais, recomendação, custos, riscos, compatibilidade/migração e condição de reversão ou revisão. Restrinja alterações a [Markdown autorizado]. Especifique verificações de consistência realizadas, testes técnicos ainda necessários e bloqueios. Mantenha novo ADR como Proposed e aguarde decisão humana; não modifique implementação com base na própria recomendação.

## Preparar handoff ao ChatGPT

> Prepare handoff textual para [objetivo/destinatário], limitado ao escopo [ticket/documentos]. Informe estado real, autorização vigente, decisões aceitas/propostas, arquivos alterados e contratos relevantes por link, dependências, verificações executadas e resultados, testes não realizados, problemas/bloqueios e próxima ação autorizada. Não inclua segredos, não declare trabalho futuro concluído e não envie mensagens a outro chat/serviço sem autorização explícita. Entregar o texto aqui não autoriza executar o próximo ticket.
