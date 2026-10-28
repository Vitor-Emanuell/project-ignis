# Escopo funcional

Referência de escopo, consolidada em 23/10/2026 a partir da diretriz fornecida pelo usuário. As exigências da competição abaixo são as **informadas no briefing**, sem validação independente do regulamento. Decisões técnicas são propostas em [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md).

## Identificação e limites

Nome público proposto: **IGNIS**; denominação formal proposta: Sistema Ignis. F.O.G.O. é o nome anterior, não um módulo. PROMETHEUS é a IA fictícia e identidade narrativa. Competição: DSIN Coder Challenge 2026, Protocolo Prometheus, Operação NEXT, etapa bônus. Entrega: **27/10/2026 às 23h59, America/Sao_Paulo**.

Objetivo: integrar inventário, operação urbana, histórico e prevenção, com demonstração reproduzível e gamificação subordinada à manutenção. Nenhum requisito obriga LLM, agente autônomo, serviço pago ou equipamento físico.

Esta fase autoriza documentação arquitetural e planejamento. Implementação, instalação, execução de tickets e definição visual pertencem a fases posteriores e dependem de liberação.

## Requisitos das três partes

| ID | Obrigação funcional |
|---|---|
| R01 | Inventariar equipamentos de segurança, fiscalização, trânsito e mobilidade de diferentes categorias e recursos fixos/móveis |
| R02 | Registrar tipo, série, marca/modelo, CEP, bairro, cidade, UF, endereço, referência de instalação/base, coordenadas, situação operacional, necessidade/prioridade e próxima manutenção quando aplicável, além de características específicas da categoria |
| R03 | Cadastrar agentes de trânsito, guardas, policiais e demais profissionais; distinguir localização cadastral, base operacional e posição dinâmica |
| R04 | Representar estados: ainda não instalado, operacional, mau funcionamento, em manutenção, desativado e furtado; separar estado de necessidade de manutenção |
| R05 | Oferecer mapa com equipamentos/agentes identificáveis, situação, detalhes e filtros combinados por tipo, situação, localização, região e órgão |
| R06 | Apresentar quantidades, disponibilidade, atividade, condições regionais, alertas e manutenções críticas/próximas, com atualização contínua |
| R07 | Receber/normalizar dados IoT/equipes, registrar eventos/histórico, tratar inválidos, duplicados e fora de ordem, identificar atraso/ausência de comunicação sem presumir furto ou falha física; documentar disponibilidade |
| R08 | Priorizar manutenção preventiva com histórico de falhas, indisponibilidade, última/próxima manutenção e criticidade |
| R09 | Estimar risco de degradação operacional futura por região, com horizonte, dados/fatores, aplicação prática e limitações; não inferir criminalidade, acidentes ou periculosidade populacional |
| R10 | Diferenciar regras, scores heurísticos, anomalias, previsão estatística e probabilidades calibradas; validar a abordagem com histórico demonstrativo, sem chamar score de probabilidade |

R01–R04 correspondem à Parte 1; R05–R07 à Parte 2; R08–R10 à Parte 3. Exemplos de categorias: radares de velocidade/semáforo/conversão, câmeras, balanças, veículos de fiscalização, cancelas, táxis/mototáxis/escolares, totens, patinetes, motocicletas e viaturas. A lista orienta categorias extensíveis e não obriga telemetria uniforme.

## Funcionalidades selecionadas

O escopo F01–F09 está aprovado **como seleção funcional no briefing**; sua arquitetura e implementação ainda não estão aprovadas.

| Feature | Resultado esperado | Responsabilidade técnica |
|---|---|---|
| F01 | Inventário completo de equipamentos e agentes, características, localização, estado e manutenção | Inventory, Operations, Maintenance |
| F02 | Mapa, indicadores, filtros e alertas operacionais | Operations, Alerts |
| F03 | Simulador de telemetria/ocorrências, cenários e histórico coerentes | Simulation, Telemetry |
| F04 | Histórico e priorização preventiva explicável | Maintenance, Prediction |
| F05 | Gerador de cadastros válidos por categoria | Demo Data, Inventory |
| F06 | Reconectar Circuitos associado à manutenção | Game Missions, Maintenance |
| F07 | Tour guiado PROMETHEUS com cenários controlados | Guided Experience |
| F08 | Restaurar o Sinal e Calibrar Sensores, no mesmo fluxo de manutenção | Game Missions, Maintenance |
| F09 | Mapa de risco operacional futuro e fatores por região | Prediction, Operations |

Conclusões dos três minigames podem produzir intervenções e mudanças **simuladas**, nunca certificar reparo físico.

<a id="exclusoes"></a>
## Exclusões

Não obrigatórios no MVP: Command Palette, narrações gravadas, sons, animação inicial, Operação Amanhã, modelos avançados de IA sem necessidade demonstrada. Não gerar tickets prioritários para esses itens. Escala distribuída, hardware real e autenticação corporativa não foram exigidos.

Identidade visual, paleta, tipografia, tokens, mockups, componentes, animações e puzzles detalhados ficam para System Design. Nesta fase, nada disso é definido.

## Critérios de sucesso e rastreabilidade

As três partes devem funcionar de ponta a ponta, com dados fictícios identificáveis, reinicialização segura, histórico explicável e todas as nove features demonstráveis. A execução local deve ser reproduzível e documentada após existir.

| Cobertura | Evidência futura |
|---|---|
| R01–R05, F01/F05 | J01 e casos V01–V03 do [guia](VERIFICATION_GUIDE.md) |
| R06–R07, F02/F03 | J02 e V04–V06 |
| R08–R10, F04/F09 | J04 e V07–V08 |
| F06/F08 | J03 e V09 |
| F07 e integridade da demonstração | J05 e V10–V11 |

Os fluxos são definidos uma única vez no [design técnico](MVP_TECHNICAL_DESIGN.md#jornadas). Critérios de aprovação **documental** estão na [arquitetura](SYSTEM_ARCHITECTURE.md#aprovacao).
