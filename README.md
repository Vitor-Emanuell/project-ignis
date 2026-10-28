# PROJECT IGNIS — F.O.G.O. PROMETHEUS
## Plataforma Unificada de Gestão e Observabilidade Urbana

**DSiN Coder Challenge 2026 — Protocolo Prometheus / Operação NEXT**  
**Versão Consolidada de Release:** `T0020_CONSOLIDATED_READY` / `VISUAL_RELEASE_READY`  
**Data de Entrega:** 27 de Outubro de 2026  
**Repositório oficial:** https://github.com/Vitor-Emanuell/project-ignis

---

## 1. Visão Geral do Projeto

O **PROJECT IGNIS** (anteriormente denominado F.O.G.O. Prometheus) é uma plataforma monolítica web desenvolvida para a gestão, observabilidade e análise de resiliência da infraestrutura urbana inteligente. O sistema consolida em uma única arquitetura executável os três desafios do programa:

1. **Desafio 1 — Inventário Heterogêneo e Mapa Operacional (J01):**
   - Cadastro e ciclo de vida de equipamentos urbanos (radares fixos e móveis, câmeras, sensores meteorológicos, semáforos, estações ambientais) e agentes de campo.
   - Localização institucional/instalação, regiões administrativas GeoJSON do município de São Paulo e mapa operacional interativo com Leaflet.
2. **Desafio 2 — Alertas e Telemetria com Relógio Confiável (D08):**
   - Ingestão determinística de telemetria e episódios com controle estrito de causalidade.
   - Motor determinístico de avaliação de alertas (`equipment_fault`, `communication_missing`, `maintenance_due`).
   - API de consulta paginada e reconhecimento autenticado de alertas (`POST /acknowledge`) com avanço atômico do marco durável no SQLite (`telemetry_trusted_clock`) e proteção contra regressão temporal (`CLOCK_UNTRUSTED`).
3. **Desafio 3 — Cidade Preditiva (Histórico e Resiliência Urbana):**
   - Consulta analítica retrospectiva (`GET /prediction/history`) com corte temporal exato.
   - Agregação de falhas registradas, ocorrências de telemetria, pedidos de manutenção e criticidade.
   - Conformidade ética estrita com C03/D08: declaração transparente de `insufficient_data` e `score: null` na ausência de janela de cobertura temporal mínima comprovada, recusando falsas projeções de IA.

---

## 2. Tecnologias Utilizadas

- **Runtime & Linguagem:** Node.js (v24.22.1 LTS), TypeScript (v5.9.3).
- **Backend:** Fastify (v5.12.7), `@fastify/static` (v10.1.7).
- **Frontend SPA:** Vue 3 (v3.5.29), Vite (v7.3.7), Leaflet (v1.9.4).
- **Persistência & Integridade:** SQLite 3.53 via `better-sqlite3` (v13.0.3), modo WAL, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 1000ms`.
- **Testes & Tipagem:** Vitest (v4.1.12), `vue-tsc` (v2.2.8).

---

## 3. Pré-requisitos de Ambiente

- **Sistema Operacional:** Windows 10/11 x64 (compatível com Linux x64).
- **Node.js:** `>= 24.22.1 < 25` (recomendado: Node 24.22.1).
- **npm:** `>= 11.19.1 < 13` (utiliza lockfile v3).

---

## 4. Instruções de Instalação e Execução (Passo a Passo)

### 4.1 Instalação das Dependências
Na raiz do projeto extraído, execute a instalação estrita a partir do lockfile:
```powershell
npm ci
```

### 4.2 Configuração de Variáveis de Ambiente
Defina as variáveis no terminal PowerShell antes de compilar e iniciar:

```powershell
# 1. Referência pública do dataset operacional oficial (OBRIGATÓRIO antes do build web)
$env:VITE_IGNIS_DATASET_ID = "10000000-0000-4000-8000-000000000003"

# 2. Caminho do banco SQLite local (o arquivo será criado se não existir)
$env:DATABASE_PATH = "C:\caminho\para\ignis.sqlite"

# 3. Segredo do operador local para autenticação
$env:OPERATOR_SECRET = "ignis-operator-secret-2026"

# 4. Host e porta de escuta
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
```

> **IMPORTANTE:** A variável `$env:VITE_IGNIS_DATASET_ID` é embutida no frontend durante a etapa de build. Deve ser definida **antes** da execução de `npm run build`.

### 4.3 Migração do Banco e Preparo Operacional
Execute as migrações determinísticas (Schema 1 a 7) e inicialize o dataset operacional:

```powershell
# Aplica migrations 0001 a 0007 (alcança Schema 7)
npm run db:migrate

# Inicializa o dataset local-operational e a organização padrão ORG_LOCAL
npm run db:prepare-operational
```

### 4.4 Compilação (Build de Produção)
Gera os artefatos compilados da SPA (`apps/web/dist`) e do servidor TypeScript (`apps/server/dist`):

```powershell
npm run build
```

### 4.5 Inicialização do Servidor
Inicie o servidor monolítico compilado:

```powershell
npm start
```

Saída esperada no console:
```
{"level":30,"time":...,"msg":"Server listening at http://127.0.0.1:3000"}
```

---

## 5. Endereços da Aplicação

- **Interface Web Integrada:** [http://127.0.0.1:3000/](http://127.0.0.1:3000/)
- **Diagnóstico do Processo (Health Live):** [http://127.0.0.1:3000/health/live](http://127.0.0.1:3000/health/live)

---

## 6. Roteiro de Demonstração dos Três Desafios

### Acesso Inicial
1. Abra [http://127.0.0.1:3000/](http://127.0.0.1:3000/) no navegador.
2. A tela exibirá a referência da instalação `10000000-0000-4000-8000-000000000003`.
3. No campo **Segredo do operador local**, digite o segredo configurado (ex: `ignis-operator-secret-2026`) e clique em **Acessar**.

### Demonstração 1 — Inventário e Mapa Operacional
1. O painel exibirá o inventário contextual (`Geração 1 · Revisão 1`).
2. Utilize os botões **Equipamentos** e **Agentes** para alternar listagens.
3. Clique em **Cadastrar equipamento** para registrar um novo radar ou câmera com endereço em São Paulo.
4. Clique em **Abrir mapa operacional, regiões e indicadores (J01)** para visualizar o mapa Leaflet com as 5 regiões administrativas e indicadores de disponibilidade.

### Demonstração 2 — Alertas e Reconhecimento Transacional
1. A API de alertas opera sob o prefixo `/api/v1/datasets/10000000-0000-4000-8000-000000000003/epochs/1/alerts`.
2. Para consultar alertas:
   ```powershell
   # Exemplo via curl / PowerShell após login
   Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/datasets/10000000-0000-4000-8000-000000000003/epochs/1/alerts" -WebSession $session
   ```
3. Reconhecimento autenticado: submeter `POST /alerts/:alertId/acknowledge` com `commandId` (UUID). A transação avança atômica e monotonicamente o marco durável em `telemetry_trusted_clock`, grava o evento auditável em `alert_event` e incrementa a revisão em `dataset_epoch`.

### Demonstração 3 — Cidade Preditiva
1. No painel principal, clique em **Consultar Cidade Preditiva**.
2. A interface consulta `GET /prediction/history` e renderiza a tabela com os recursos, contagem de falhas observadas, ocorrências de telemetria e pedidos de manutenção abertos.
3. O status exibido é explicitamente `insufficient_data` com score `null` e horizonte de 7 dias, acompanhado de notas explicativas sobre os limites de cobertura temporal da amostra.

---

## 7. Verificação Automatizada e Testes

A suíte completa de testes pode ser executada com:

```powershell
# Checagem estática de tipos (TypeScript + Vue)
npm run typecheck

# Suíte completa de testes automatizados (503 testes em 32 arquivos)
npm test -- --fileParallelism=false

# Testes específicos por módulo
npm run test:t0010   # 67 testes: alertas, avaliador determinístico e migração
npm run test:t0013   # 3 testes: histórico preditivo e isolamento
npm run test:smoke   # Smoke test de inicialização de processo real
```

---

## 8. Limitações Conhecidas e Notas Técnicas

1. **Gatilho de Avaliação de Alertas em Runtime:**
   - O motor de avaliação determinístico (`evaluateAlerts`) está 100% implementado, testado e em conformidade estrita com as regras normativas (`equipment_fault`, `communication_missing`, `maintenance_due`).
   - O motor opera como biblioteca transacional em lote sob o banco SQLite. Não há um processo em background contínuo (daemon/cron) executando a cada segundo no servidor HTTP; a avaliação ocorre quando invocada em lote, em scripts operacionais ou em suítes de teste.
2. **Dados Preditivos e Rigor Probabilístico (C03/D08):**
   - O sistema **não possui previsão estatística validada** ou modelo preditivo probabilístico homologado. O módulo de Cidade Preditiva foi implementado com honestidade estrita sobre a proveniência dos dados observados. Sem amostragem temporal contínua que atenda aos requisitos matemáticos de cobertura P01, o sistema recusa expressamente inventar scores fictícios de probabilidade futura, reportando com integridade transparente `status: "insufficient_data"` e `score: null`.
3. **Distribuição Monolítica:**
   - O servidor Fastify serve a API REST e os arquivos estáticos da SPA compilada na mesma origem (`127.0.0.1:3000`), garantindo proteção de cookies `HttpOnly; SameSite=Strict` e tokens CSRF sem necessidade de proxies externos reversos para demonstração local.

---

## 9. Uso de Inteligência Artificial

O desenvolvimento do **PROJECT IGNIS** contou com o auxílio de ferramentas de inteligência artificial generativa em diferentes fases do ciclo de vida da engenharia de software:

- **ChatGPT:** planejamento, arquitetura, especificação e revisão.
- **Codex:** implementação e refinamento de interface.
- **Gemini:** desenvolvimento, integração, testes e empacotamento.
- **Direção, decisões e avaliação do projeto conduzidas pelo participante.**
