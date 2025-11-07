# Testes JS Postman

[Tabela_Testes_Backend_VidyaForce.xlsx](Tabela_Testes_Backend_VidyaForce.xlsx)

[https://animaedu-my.sharepoint.com/:x:/r/personal/123112959_ulife_com_br/Documents/Tabela_Testes_Backend_VidyaForce.xlsx?d=wc5f2b1d7f26947b58fdbff1fc70f0641&csf=1&web=1&e=aL4dhk](https://animaedu-my.sharepoint.com/:x:/r/personal/123112959_ulife_com_br/Documents/Tabela_Testes_Backend_VidyaForce.xlsx?d=wc5f2b1d7f26947b58fdbff1fc70f0641&csf=1&web=1&e=aL4dhk)

### Resumo

Os **helpers** funcionam como o núcleo lógico: identificam módulo, contexto, tipo de cenário (positivo/negativo), padrão de resposta e configuram automaticamente flags de *skip* por módulo. Isso permite que todos os testes (Smoke, Contrato, Funcionais, Fluxo, SLA, Segurança, Qualidade de Dados) sejam **dinâmicos e reutilizáveis**, sem necessidade de escrever lógica duplicada para cada endpoint.

A estratégia de testes se organiza em camadas:

1. **Disponibilidade & Saúde (Smoke + Gate)**
    
    Garante que o ambiente está estável (sem 5xx, módulos com 2xx consistentes) antes de aprofundar. Se um módulo falha na base, os testes avançados são automaticamente ignorados, reduzindo ruído e evidenciando o ponto raiz do problema.
    
2. **Contrato Genérico & Padrões Globais**
    
    Valida JSON correto, uso adequado de `hasError`, mensagens claras, ausência de HTML indevido e integridade do padrão **BaseList**. Isso assegura que o backend fala uma “língua única” com o front, facilitando manutenção, monitoramento e integrações.
    
3. **Contrato Específico por Módulo**
    
    Login, dashboard, mensagens, pedidos, produtos, preços, parceiros, usuários, configuração, logística e documentos são verificados com critérios próprios. Cada endpoint crítico precisa entregar identificadores, dados úteis e comportamentos previsíveis, alinhados ao uso real do app e dos vendedores em campo.
    
4. **Regras de Negócio & Fluxos (E2E técnico)**
    
    Testes como TIPPESSOA x documento, comodato, encadeamento de token, uso de `nunota` em pedidos e sequência criar→detalhar→confirmar garantem que a API não só responde, mas **sustenta corretamente os fluxos reais de operação**.
    
5. **SLA, Segurança e Qualidade de Dados**
    
    Tempo de resposta controlado, proteção contra exposição de credenciais, consistência de UF, CEP e documentos, e detecção de duplicidades fecham o ciclo, garantindo não apenas funcionamento, mas **confiabilidade, segurança e robustez da base**.
    

## Glossário Resumido dos Testes

- **TST-001 — Smoke Global 5xx**
    
    **O que faz:** Garante que nenhuma API responda com erro 5xx.
    
    **Por que existe:** Se tem 5xx, o ambiente está instável; não faz sentido confiar nos demais testes.
    
- **TST-002 — Smoke por Módulo**
    
    **O que faz:** Checa se endpoints principais de cada módulo respondem 2xx corretamente.
    
    **Por que existe:** Confirmar saúde mínima do módulo antes de testar detalhes.
    
- **TST-003 — Gate Skip Módulo**
    
    **O que faz:** Se o Smoke de um módulo falha, marca `skip_módulo` e não executa testes avançados.
    
    **Por que existe:** Evitar avalanche de erros derivados e focar no problema raiz do módulo.
    
- **TST-004 — JSON sem HTML**
    
    **O que faz:** Confirma que respostas JSON não retornam HTML ou páginas de erro disfarçadas.
    
    **Por que existe:** Proteger o consumo pelo front e detectar erros de infraestrutura/redirect/login.
    
- **TST-005 — Uso padrão de hasError**
    
    **O que faz:** Valida `hasError` como booleano, com mensagem quando true e sem stack/exception quando false.
    
    **Por que existe:** Padronizar tratamento de erro e evitar exposição técnica sensível.
    
- **TST-006 — Padrão BaseList**
    
    **O que faz:** Valida `{ hasError, qtdRegistros, data[] }` e coerência entre contagem e itens.
    
    **Por que existe:** Garantir integridade de listagens/paginação.
    
- **TST-007 — Contrato Login**
    
    **O que faz:** Em sucesso: exige token/dados; em erro: mensagem clara.
    
    **Por que existe:** Garantir autenticação utilizável e feedback correto.
    
- **TST-008 — Contrato Dashboard**
    
    **O que faz:** Sucesso com `hasError=false` deve trazer dados úteis (cards/resumo/etc.).
    
    **Por que existe:** Evitar "sucesso vazio" em tela crítica do usuário.
    
- **TST-009 — Contrato Mensagens**
    
    **O que faz:** Cada mensagem precisa de ID/texto.
    
    **Por que existe:** Garantir mensagens exibíveis e rastreáveis.
    
- **TST-010 — Lista de Pedidos**
    
    **O que faz:** Verifica nunota/codParc quando presentes.
    
    **Por que existe:** Permitir rastrear pedidos e clientes corretamente.
    
- **TST-011 — Detalhe de Pedido**
    
    **O que faz:** Exige identificador do pedido no detalhe.
    
    **Por que existe:** Saber exatamente qual pedido está sendo exibido.
    
- **TST-012 — Mutação de Pedido**
    
    **O que faz:** Operações (salvar, confirmar, excluir, etc.) exigem `hasError` e referência clara do pedido.
    
    **Por que existe:** Garantir rastreabilidade após ações críticas.
    
- **TST-013 — Preços**
    
    **O que faz:** Valida `hasError` e vinculação correta com `codProd`.
    
    **Por que existe:** Garantir integridade entre preços e produtos.
    
- **TST-014 — Produtos**
    
    **O que faz:** Exige identificador único (codProd/id/codigo).
    
    **Por que existe:** Base para preços, pedidos, sincronização.
    
- **TST-015 — Parceiros**
    
    **O que faz:** Exige `codParc`/`CODPARC` nas listas.
    
    **Por que existe:** Garantir identificação correta de clientes/parceiros.
    
- **TST-016 — Usuário/Vendedor**
    
    **O que faz:** Exige nome/login identificável.
    
    **Por que existe:** Permitir autenticação, auditoria e rastreio.
    
- **TST-017 — Versão Mínima App**
    
    **O que faz:** Garante presença de `versaoMinima`.
    
    **Por que existe:** Controlar versões suportadas e forçar atualização quando necessário.
    
- **TST-018 — Estrutura Logística**
    
    **O que faz:** Valida estrutura de frete, regras e feriados (BaseList/array coerente).
    
    **Por que existe:** Apoiar cálculo confiável de frete e regras de entrega.
    
- **TST-019 — Erro em Documentos (DANFE/Boleto/PDF)**
    
    **O que faz:** Em erro, exige JSON estruturado com mensagem, não HTML ou resposta lixo.
    
    **Por que existe:** Garantir retorno claro ao consultar documentos inválidos/inexistentes.
    
- **TST-020 — TIPPESSOA x Documento**
    
    **O que faz:** Valida CPF (11) para F e CNPJ (14) para J.
    
    **Por que existe:** Garantir conformidade cadastral/fiscal.
    
- **TST-021 — TEMCOMODATO x QTDCOMODATO**
    
    **O que faz:** Confere coerência entre flag de comodato e quantidade.
    
    **Por que existe:** Evitar cadastro inconsistente em comodatos.
    
- **TST-022 — Estrutura de Erro Negativo**
    
    **O que faz:** Para 4xx/5xx em JSON, exige `hasError` ou mensagem padrão.
    
    **Por que existe:** Padronizar erros para o front tratar sempre do mesmo jeito.
    
- **TST-023 — Fluxo: Persistência do Token**
    
    **O que faz:** Armazena token do login para uso automático nos próximos requests.
    
    **Por que existe:** Simular sessão real e validar autenticação encadeada.
    
- **TST-024 — Fluxo: Persistência de Nunota**
    
    **O que faz:** Salva `nunota/id` do pedido para usar nos próximos passos.
    
    **Por que existe:** Validar fluxo completo de pedido utilizando o dado retornado.
    
- **TST-025 — SLA Global 5s**
    
    **O que faz:** Verifica se todas as respostas são < 5000 ms.
    
    **Por que existe:** Garantir desempenho mínimo aceitável.
    
- **TST-026 — SLA Crítico 2s**
    
    **O que faz:** Mede endpoints críticos (< 2000 ms).
    
    **Por que existe:** Proteger experiência nas operações mais usadas.
    
- **TST-027 — Campos Sensíveis Não Expostos**
    
    **O que faz:** Procura por `senha`, `password`, `secret` etc.
    
    **Por que existe:** Evitar vazamento de dados sensíveis.
    
- **TST-028 — 401 com Token Válido**
    
    **O que faz:** Garante que requisições com Authorization válido não recebam 401 indevido.
    
    **Por que existe:** Validar consistência da autenticação.
    
- **TST-029 — Validade de UF**
    
    **O que faz:** Checa se UF é uma sigla brasileira válida.
    
    **Por que existe:** Melhorar qualidade de endereço/logística.
    
- **TST-030 — Formato de CEP**
    
    **O que faz:** Valida CEP com 8 dígitos após remover máscara.
    
    **Por que existe:** Garantir compatibilidade com serviços de frete/busca.
    
- **TST-031 — Documento Não Duplicado**
    
    **O que faz:** Detecta CGC_CPF duplicado entre parceiros diferentes.
    
    **Por que existe:** Prevenir duplicidade e riscos fiscais/operacionais.
    

## 1. HELPERS GERAIS — Mecanismo Central do Script

Os helpers são o “cérebro” do script. Eles não realizam testes de negócio diretamente, mas preparam todas as informações necessárias para que os testes sejam:

- Dinâmicos (funcionam para múltiplos endpoints sem duplicação).
- Genéricos (baseados em padrões e convenções).
- Contextualizados por módulo/serviço.

### 1.1. Funções executadas pelos helpers

Em cada requisição, o script:

1. **Coleta dados da requisição e resposta**
    - URL completa.
    - Caminho (path) da API.
    - Método HTTP (GET, POST, PUT, DELETE, etc.).
    - Status code.
    - Content-Type.
    - Nome do request configurado na collection.
2. **Detecta se a resposta é JSON**
    - Verifica se o Content-Type é compatível.
    - Aplica `pm.response.json()` dentro de bloco seguro (try/catch) para evitar falhas do script caso a resposta não seja JSON.
3. **Identifica cenários negativos**
    - Marca requisições como negativas quando o nome contém indicadores como:
        - `[NEGATIVO]`, `[ERRO]`, `[4xx]`, `[5xx]`.
    - Isso orienta a interpretação dos resultados (por exemplo, 400 pode ser esperado).
4. **Determina automaticamente o módulo (moduleKey)**
    - Com base no path:
        - `/ppid/login` → `ppid_login`
        - `/ppid/orderlist` → `ppid_orderlist`
        - `/partner/...` → `partner`
        - `/products/...` → `products`
        - `/user/...` → `user`
    - Esse módulo é utilizado para agrupar testes, relatórios e decisões (como o skip).
5. **Gerencia flags de skip por módulo**
    - Cria e atualiza variáveis de coleção do tipo `skip_<módulo>`.
    - Exemplo: `skip_ppid_orderlist`.
    - Quando um módulo falha no teste de Smoke, essas flags instruem o script a não executar testes avançados daquele módulo.

### 1.2. Objetivo dos helpers

- Padronizar o contexto de execução.
- Permitir que as validações sejam acopladas à estrutura da API sem codificação repetitiva.
- Transformar o script em um motor de testes único, reaplicável a toda a collection.

### 1.3. Exemplo prático

Requisição: `GET /ppid/orderlist`

- O helper define `moduleKey = ppid_orderlist`.
- Os testes de Smoke, Contrato, Funcionais e Qualidade de Dados que dependem de `moduleKey` passam a se aplicar automaticamente a este endpoint, sem necessidade de script específico.

---

## 2. [TST-001] SMOKE GLOBAL — Ausência de Erros 5xx

### O que é feito

Para **todas** as requisições executadas:

- Verifica-se se o status code é **inferior a 500**.

### O que está sendo testado

- Garante que não ocorram erros de servidor (5xx), que indicam:
    - Falhas internas não tratadas.
    - Problemas de infraestrutura.
    - Exceptions sem tratamento adequado.

### Importância para o negócio

- Assegura disponibilidade mínima da API.
- Indica quando o ambiente não está apto para uso produtivo ou testes funcionais confiáveis.

### Exemplo prático

- Se `/ppid/orderlist` retorna 500 ao listar pedidos:
    - O teste classifica como falha crítica.
    - Isso evidencia instabilidade no backend, independentemente da lógica de negócio.

---

## 3. [TST-002/TST-003] SMOKE POR MÓDULO + MECANISMO DE GATE (SKIP)

### O que é feito

Para cada módulo identificado (ex.: `ppid_login`, `ppid_orderlist`, `partner`, etc.), em requisições consideradas “positivas” (não-negativas):

1. Verifica se o status code está na faixa **2xx**.
2. Se a resposta segue o padrão BaseList:
    - Confirma que `hasError === false`.
3. Em caso de falha (status não 2xx ou erro indevido):
    - Define `skip_<módulo> = true`.

Com `skip_<módulo> = true`, os testes avançados daquele módulo (contrato específico, funcionais, SLA, etc.) deixam de ser executados.

### O que está sendo testado

- **Saúde mínima por módulo**:
    - Antes de validar regras detalhadas, garante-se que os endpoints principais de cada módulo estão operacionais.

### Importância para o negócio

- Evita “poluição” de relatórios com múltiplas falhas derivadas de um mesmo problema raiz.
- Facilita a leitura: se o módulo está com Smoke quebrado, concentra-se na sua recuperação antes de avaliar suas regras internas.

### Exemplo prático

- `/ppid/orderlist` retorna `hasError = true` ou 404 de forma inesperada.
- O script marca `skip_ppid_orderlist`.
- Todos os testes de contrato de pedidos deixam de rodar.
- Conclusão: o problema está na disponibilidade ou contrato base do módulo de pedidos, não em um campo específico.

---

## 4. [TST-004 a TST-006] CONTRATO GENÉRICO E PADRÃO BASELIST

### 4.1. JSON não pode conter HTML

**Verificação**

Se a resposta é tratada como JSON, valida-se que o corpo **não** contenha estruturas HTML como `<html>`.

**Objetivo**

- Evitar cenários em que o servidor responde com:
    - Páginas de erro.
    - Páginas de login.
    - Conteúdo de proxy ou servidor web.
- Mas rotuladas como `application/json`, o que quebraria o consumo pelo front.

**Exemplo**

- Chamada a `/ppid/getprices` retorna HTML de erro do servidor IIS:
    - O teste detecta o HTML dentro do JSON e reprova o contrato.

---

### 4.2. Uso correto de `hasError` e mensagens de erro

**Verificação**

Quando o campo `hasError` existe:

- Deve ser do tipo booleano.
- Se `hasError = true`:
    - Deve haver mensagem clara:
        - `message`, `mensagem`, `error` ou `errors`.
- Se `hasError = false`:
    - Não devem existir:
        - `stackTrace`, `exception`, mensagens técnicas internas.

**Objetivo**

- Padronizar o envelope de erro da API.
- Garantir clareza para o consumidor (aplicativo, integração).
- Evitar vazamento de detalhes internos de implementação ou exceções.

**Exemplo**

Válido:

```json
{
  "hasError": true,
  "mensagem": "Usuário ou senha inválidos."
}

```

Inválido:

```json
{
  "hasError": true}

```

Neste caso, o teste falha por ausência de mensagem descritiva.

---

### 4.3. Padrão BaseList (`hasError`, `qtdRegistros`, `data[]`)

**Verificação**

Quando a resposta se enquadra no padrão BaseList (lista de registros paginados):

- Deve conter:
    - `hasError`
    - `qtdRegistros`
    - `data` (array)
- Se `qtdRegistros` for numérico:
    - Deve ser coerente com `data.length`.
- Se `qtdRegistros > 0`:
    - `data` não pode estar vazia.
- Cada elemento de `data` deve ser um objeto JSON.

**Objetivo**

- Garantir integridade estrutural de listagens.
- Evitar inconsistências entre contagem e registros retornados.

**Exemplo**

Resposta:

```json
{
  "hasError": false,
  "qtdRegistros": 15,
  "data": [ { ...3 itens... } ]
}

```

O teste identifica discrepância entre `qtdRegistros` e o número real de itens.

---

## 5. CONTRATO POR MÓDULO — VALIDAÇÕES ESPECÍFICAS

### 5.1. [TST-007] LOGIN (`/ppid/newlogin`, `ppid_login`)

**Verificação**

- Presença de `hasError`.
- Em caso de sucesso:
    - Deve existir ao menos um campo de credencial ou contexto:
        - `token`, `auth`, `accessToken`, `bearer`, `usuario`, `user`.
- Em caso de erro:
    - Deve existir mensagem em `message`/`mensagem`/`error`/`errors`.

**Objetivo**

- Garantir que o login:
    - Em sucesso, retorne dados suficientes para estabelecer sessão.
    - Em falha, ofereça feedback compreensível ao usuário/sistema.

---

### 5.2. [TST-008] DASHBOARD (`/ppid/dashboard`)

**Verificação**

- `hasError` obrigatório.
- Se `hasError = false`:
    - É exigida a existência de alguma estrutura de dados:
        - `data`, `resumo`, `cards` ou `widgets`.

**Objetivo**

- Confirmar que o Dashboard, quando sinalizado como sucesso, realmente entrega informações úteis (indicadores, métricas, painéis), e não um sucesso “vazio”.

---

### 5.3. [TST-009] MENSAGENS (`/ppid/message`)

**Verificação**

Para cada item da lista:

- Deve haver ao menos um dos campos:
    - `id`, `idMsg`, `message`, `texto`, `titulo`.

**Objetivo**

- Assegurar que cada mensagem seja identificável e exibível.
- Evitar registros “inúteis” sem conteúdo.

---

### 5.4. [TST-010] PEDIDOS — LISTA (`/ppid/orderlist`)

**Verificação**

Para cada pedido:

- Quando presentes, `nunota`/`NUNOTA` e `codParc`/`CODPARC` não podem ser vazios.

**Objetivo**

- Garantir rastreabilidade:
    - Cada pedido deve ser identificável.
    - Ligação clara entre pedido e parceiro/cliente.

---

### 5.5. [TST-011] PEDIDOS — DETALHE (`/ppid/orderdetails`)

**Verificação**

- Exige que o corpo contenha ao menos um identificador:
    - `nunota`, `NUNOTA`, `numero` ou `id`.

**Objetivo**

- Assegurar que, ao exibir o detalhe, o sistema saiba precisamente qual pedido está em contexto.

---

### 5.6. [TST-012] PEDIDOS — MUTAÇÃO

(`ordersaveheaderclient`, `salvaritem`, `duplicar`, `confirmarpedido`, `excluiritempedido`, `orderdelete`)

**Verificação**

- `hasError` sempre presente.
- Em sucesso:
    - Deve retornar referência do pedido:
        - `nunota`, `NUNOTA`, `id`, `numero`, `success` ou `sucesso`.

**Objetivo**

- Após operações de gravação/alteração, permitir identificar exatamente qual pedido foi criado/alterado/excluído, permitindo sequência lógica no fluxo (itens, confirmação, impressões, documentos).

---

### 5.7. [TST-013] PREÇOS

**Verificação**

- `hasError` obrigatório.
- Em listas:
    - Quando houver campo `codProd`/`CODPROD`, este não pode ser vazio.

**Objetivo**

- Garantir que associações de preço estejam alinhadas com produtos válidos.

---

### 5.8. [TST-014] PRODUTOS

**Verificação**

- Em listas:
    - Pelo menos um identificador entre `codProd`, `CODPROD`, `id`, `codigo`.
- Em detalhes:
    - Mesmo critério aplicado ao objeto principal.

**Objetivo**

- Assegurar identificador único e consistente, necessário para:
    - vincular preços,
    - criar pedidos,
    - realizar sincronizações de catálogo.

---

### 5.9. [TST-015] PARCEIROS

**Verificação**

- Em listagens, exige `codParc`/`CODPARC`.

**Objetivo**

- Garantir um identificador único por parceiro/cliente, suportando:
    - pedidos,
    - faturamento,
    - análises e relatórios.

---

### 5.10. [TST-016] USUÁRIOS / VENDEDORES

**Verificação**

Para cada registro:

- Deve existir pelo menos um campo de identificação:
    - `nome`, `name`, `usuario`, `login`.

**Objetivo**

- Assegurar que usuários possam ser autenticados, auditados e relacionados a ações do sistema.

---

### 5.11. [TST-017] CONFIGURAÇÃO / VERSÃO MÍNIMA (`/user/versaominima`)

**Verificação**

- Exige a presença do campo `versaoMinima`.

**Objetivo**

- Proteger o contrato utilizado pelo aplicativo para verificar se a versão instalada ainda é suportada ou se há necessidade de atualização obrigatória.

---

### 5.12. [TST-018] LOGÍSTICA (`/tabelafrete`, `/regrasentregas`, `/feriados`)

**Verificação**

- A resposta deve apresentar estrutura coerente:
    - Padrão BaseList **ou**
    - Array/objeto válido.

**Objetivo**

- Confirmar que as informações de logística estão em formato utilizável para:
    - cálculo de frete,
    - aplicação de regras de entrega,
    - consideração de feriados.

---

### 5.13. [TST-019] DOCUMENTOS (DANFE, Boleto, PDF)

**Verificação**

Aplicado quando endpoints como `viewDanfe`, `viewBoleto`, `viewPdf` retornam JSON (tipicamente em casos de erro):

- Se `status >= 400` ou `hasError = true`:
    - Deve haver mensagem de erro padronizada.

**Objetivo**

- Quando o usuário informa um número de nota, boleto ou identificador de PDF:
    - Se o documento não existir, estiver inválido, formatado incorretamente ou não estiver cadastrado,
    - A API deve retornar JSON estruturado indicando a falha (por exemplo, “Documento não encontrado ou inválido”),
    - Em vez de HTML genérico, PDF vazio ou erro silencioso.

**Exemplo funcional direto:**

“Este teste verifica se, ao tentar gerar um PDF/DANFE/Boleto com um identificador inexistente ou em formato inválido, o backend responde de forma controlada e compreensível, confirmando que o documento informado não está cadastrado ou não é válido.”

---

## 6. [TST-020/TST-021] TESTES FUNCIONAIS — REGRAS DE NEGÓCIO

### 6.1. TIPPESSOA x CGC_CPF

**Verificação**

Quando existirem `TIPPESSOA` e `CGC_CPF`:

- `TIPPESSOA = "F"` → documento deve corresponder a CPF (11 dígitos).
- `TIPPESSOA = "J"` → documento deve corresponder a CNPJ (14 dígitos).

**Objetivo**

- Garantir consistência cadastral e aderência às regras fiscais.
- Evitar mistura indevida de CPF/CNPJ.

---

### 6.2. TEMCOMODATO x QTDCOMODATO

**Verificação**

- `TEMCOMODATO = "S"` → `QTDCOMODATO > 0`.
- `TEMCOMODATO = "N"` → `QTDCOMODATO = 0`.

**Objetivo**

- Assegurar integridade nas relações de comodato.
- Evitar cenários incoerentes (ex.: marcado que tem comodato, mas sem quantidade vinculada).

---

## 7. [TST-022] TESTES NEGATIVOS — PADRÃO DE ERRO

**Verificação**

Para respostas com `status >= 400` em formato JSON:

- Exige pelo menos uma das formas padronizadas:
    - `hasError = true`
    - `message` / `mensagem` / `error` / `errors`.

**Objetivo**

- Toda falha deve produzir uma resposta estruturada e previsível.
- Permite ao front-end tratar erros de forma uniforme e amigável ao usuário.

---

## 8. [TST-023/TST-024] TESTES DE FLUXO (E2E TÉCNICO)

### 8.1. Fluxo de Login

**Verificação**

- Em caso de login bem-sucedido:
    - O token (bearer/credencial) e informações do usuário são armazenados em variáveis.
- Essas variáveis são utilizadas automaticamente em requisições subsequentes.

**Objetivo**

- Simular o comportamento real do sistema:
    - Usuário autentica uma vez e mantém sessão ativa durante os demais testes.

---

### 8.2. Fluxo de Pedidos

**Verificação**

- Quando operações de pedido retornam `nunota`/`id`/`numero`:
    - O valor é salvo em variável de ambiente.

**Objetivo**

- Permitir encadear cenários:
    - Criar pedido → Consultar detalhes → Confirmar → Consultar documentos.
- Validar que os endpoints funcionam em sequência, usando os dados retornados pelo backend.

---

## 9. [TST-025/TST-026] SLA — TEMPO DE RESPOSTA

### Verificações

1. **SLA Global**
    - Todas as respostas devem ocorrer em menos de **5000 ms**.
2. **SLA Crítico**
    - Endpoints considerados críticos (ex.: login, dashboard, sincronização inicial, principais listagens):
        - Devem responder em menos de **2000 ms**.

**Objetivo**

- Assegurar desempenho mínimo aceitável.
- Suportar boa experiência de uso, inclusive em campo ou redes móveis.

---

## 10. [TST-027/TST-028] SEGURANÇA

### 10.1. Campos Sensíveis

**Verificação**

- Garante que respostas JSON não contenham campos como:
    - `password`, `senha`, `secret`, etc.

**Objetivo**

- Evitar exposição de credenciais ou segredos de sistema em respostas públicas/logs.

### 10.2. Autenticação (401 indevido)

**Verificação**

- Para requisições enviadas com header `Authorization` válido:
    - Garante que não haja retorno 401 injustificado.

**Objetivo**

- Validar consistência do mecanismo de autenticação.
- Evitar falhas onde tokens válidos são rejeitados erroneamente.

---

## 11. [TST-029 a TST-031] QUALIDADE DE DADOS

### 11.1. UF

**Verificação**

- Quando presente, o campo `UF` deve ser uma sigla válida de estado brasileiro.

**Objetivo**

- Garantir endereços consistentes para relatórios, logística e integrações.

---

### 11.2. CEP

**Verificação**

- Quando presente, o `CEP` é normalizado (remoção de máscara).
- Deve conter **8 dígitos numéricos**.

**Objetivo**

- Facilitar integração com serviços de frete, roteirização e conferência de endereço.

---

### 11.3. Documento Duplicado (CGC_CPF)

**Verificação**

- Combina `CGC_CPF` com identificadores de parceiro (`CODPARC`, `COD`).
- Identifica documentos iguais vinculados a parceiros distintos.

**Objetivo**

- Sinalizar possíveis duplicidades cadastrais.
- Apoiar saneamento da base, evitando problemas financeiros, fiscais e operacionais.