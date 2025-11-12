# Backend Vidya Force - Testes Globais (v3.4)

Este repositório contém o script **global** de testes automatizados para ser utilizado na collection:

**`Backend - Vidya Force.postman_collection.json`**

A versão **v2** mantém toda a lógica da versão anterior, porém:

- Refina a detecção automática de módulos (PPID, Products, Partner, User, etc.).
- Amplia os testes de **contrato** para refletir melhor o comportamento real dos endpoints.
- Mantém o conceito de **Smoke por módulo com gate** usando `skip_<modulo>`.
- Não aborta mais a execução completa da collection em caso de erro — falhas afetam apenas o request/módulo.
- Garante compatibilidade com a estrutura atual da sua collection e padrões de resposta (`hasError`, `BaseList`, etc.).

## Novidades da Versão 3 (add-on integrado ao v2)

> Esta versão **não substitui** o seu script v2 — ela o **complementa**. O README foi **mesclado**: todas as instruções do v2 permanecem válidas e, abaixo, estão os reforços que agora fazem parte da suíte **final**.

- **Pre-request global automático**: injeta `accessData` (se definido em Environment/Collection) e garante `Authorization: Basic {{auth_token}}` gerado a partir de `username` + `password`.
- **Validação de BINÁRIOS**: checks de **PDF/DANFE/BOLETO** e **imagens** (MIME correto e tamanho mínimo) para evitar aceitar HTML de erro como arquivo válido.
- **Paginação consistente**: evita **itens repetidos entre páginas** e confere coerência de `page` (ex.: `/ppid/getPrices?page=N`).
- **Invariantes cross-endpoints**:
  - `/partner/save` ⇒ o parceiro precisa aparecer em `/partner/list`.
  - `/ppid/{nunota}/saveAttachment` ⇒ deve refletir em `/ppid/{nunota}/listAttachment`.
  - `/user/{id}/changePhoto` ⇒ precisa refletir em `/user/{id}/imagem` (MIME/tamanho).
- **Idempotência nas mutações**: repetir operações críticas gera **erro controlado** (ex.: `confirmarPedido` 2x, `excluirItemPedido` 2x).
- **Negativos padronizados pelo nome**: sufixos no **nome do request** como `[NEGATIVO]`, `[SEM AUTH]`, `[SEM ACCESSDATA]`, `[ID INEXISTENTE]` disparam expectativas de **400/401/403/404** e exigem **mensagem clara** no JSON de erro.
- **Hardening de segurança**: previne vazamento de campos sensíveis (`password`, `senha`, `secret`, etc.).
- **Reset real de flags**: o request **“00 – [RESET FLAGS]”** agora limpa variáveis `skip_*` e caches auxiliares (ex.: `v3_seen_ids::getprices`).

### Refinamentos aplicados (v3.1)

- Binários condicionados: validações de PDF/DANFE/BOLETO e imagens agora só executam quando a resposta for 2xx e não-JSON (evita conflito com erros legítimos retornados em JSON).
- Whitelist de segurança (auth/token): em rotas de autenticação (/login, /newLogin, /refresh, /token), campos como auth/token não são considerados vazamento; nas demais rotas, permanecem bloqueados, além de password/senha/secret.
- Paginação com namespace por vendedor: a chave de controle de itens já vistos passou a incluir o codVend (ex.: v3_seen_ids::getprices::<codVend>), evitando “repetidos” falsos quando múltiplos vendedores são exercitados na mesma suíte.
- Idempotência robusta: os replays das mutações críticas clonam o corpo em raw, x-www-form-urlencoded e form-data, garantindo que o segundo envio seja equivalente ao primeiro.
- Obrigatoriedade de accessData: rotas /ppid/ agora exigem, via teste dedicado, a presença do header accessData (valor não vazio) para padronização do contrato.
- Checks leves adicionais: validações mínimas (seguras) para mensagens (/ppid/message) e solicitações de entrega (/ppid/solicitacoesEntrega), reforçando a cobertura sem acoplamento excessivo.

### Refinamentos aplicados (v3.2)

- **Binários blindados:** PDF/DANFE/BOLETO agora verificam assinatura `%PDF-` e tamanho mínimo; imagens checam MIME e tamanho (>512B). Impacto: evita aceitar HTML/erros como arquivo válido.
- **Paginação à prova de erro:** adicionados casos de borda `[PAGE OUT OF RANGE]` e coerência `query.page == body.page`, mantendo o namespace por vendedor em `v3_seen_ids::<rota>::{{codVend}}`.
- **Headers por domínio:** rotas `/ppid/` exigem `accessData` não vazio; pre-request corrige typos (`accesData→accessData`) e injeta faltantes automaticamente.
- **Negativos padronizados:** sufixos como `[SEM AUTH]`, `[SEM ACCESSDATA]`, `[ID INEXISTENTE]`, `[PAGE OUT OF RANGE]` ganham asserts específicos (4xx + mensagem clara).
- **Multi-cliente simples:** variável `ENV_CHOICE` seleciona `baseUrl_*` (DEV/HML/PRD) sem editar requests.


### Refinamentos aplicados (v3.2.1)

- **Bootstrap reset-once:** limpeza leve e automática de resíduos entre rodadas (`skip_*`, `v3_*`, `seen_*`, `idempotency_*`, `page_state*`, `run_*`, `tmp_`, `last_*`) preservando credenciais e configuração. Gera `run_id` único por execução para estabilizar testes de idempotência.
- **Testes sempre-registrados:** binários, paginação, headers `/ppid/`, SLA e negativos passam a registrar `pm.test` em todos os casos, marcando **“N/A”** quando o cenário não se aplica. Isso mantém a **contagem de testes estável** entre a 1ª e a 2ª bateria.
- **Paginação coerente:** comparação explícita `query.page == body.page` quando disponível, sem alterar coberturas já existentes. 
- **Boas práticas de Runner:** recomenda-se executar com **Persist variables = OFF** e iniciar pela requisição **“00 – [RESET FLAGS]”**; o bootstrap ajuda mesmo quando alguém esquece o reset.
- **Compatibilidade total:** tudo é incremental; V2/V3 permanecem ativos e inalterados. Se a suíte já cobria algum ponto, o novo guard apenas retorna “N/A” (não aumenta falsos negativos).

### Refinamentos aplicados (v3.3)

- JWT (claims mínimos): em fluxos de autenticação, valida presença de `exp` e expiração ≥ 5 min.
- Observabilidade: exige `X-Request-ID`/`X-Correlation-ID`/`traceparent` em respostas.
- Rate limit: quando presentes, verifica `Remaining ≤ Limit`.
- Timestamps ISO-8601/UTC: campos de data padronizados (evita problemas de fuso).
- Content-Type para JSON: se o corpo *parece* JSON, exige `application/json`.
- Cookies seguros: quando há `Set-Cookie`, exige flags `Secure` e `HttpOnly`.
- Consistência monetária: soma de itens ≈ total (tolerância 0,05) em detalhes de pedido.
- Baseline de schema: salva conjunto de chaves por rota/método e alerta drift.
- Cache HTTP: em GET 2xx, exige `ETag` ou `Last-Modified` (revalidação opcional).
- SLA percentis: coleta `responseTime` para cálculo de p95/p99 em request de relatório.
- Paginação — limites: `pageSize` dentro de 1..200 e retorno como array.
- Uploads: filename ecoado sem `../`/`/`/`\` e tamanho 1..255.

### Refinamentos aplicadps (v3.4)

### 1. Detecção robusta de JSON
- **Antes**: regex com `\bjson\b` podia falhar em alguns *Content-Types*.
- **Agora**: `contentType.toLowerCase().includes('json')`.
- **Efeito**: evita falsos “não‑JSON” e testes indevidamente pulados.

### 2. Normalização do *path* para *schema key*
- A chave do baseline passou a ser calculada por **segmentos da URL** (`req.url.path`):
  - *Join* com `/`, **remoção de barra final**, **lower‑case**.
  - Ex.: `"/ppid/getPrices/"` → `"/ppid/getprices"`.
- **Efeito**: evita *drift* artificial quando a mesma rota é chamada com ou sem barra final.

### 3. Mapa explícito para `/ppid/getprices`
- Inclusão do `SCHEMA_KEYS['/ppid/getprices']` com chaves esperadas:
  - `codProd,codTab,nomeTab,nuTab,preco,precoFlex`.
- **Efeito**: validação **estrita** para o endpoint de preços.

### 4. Baseline de schema mais tolerante
- Se a chave não existir no mapa, usa **baseline por endpoint**: `v3_schema::<METHOD>::<pathNormalizado>`.
- O sentinel legado `'erro'` **não** dispara falha: baseline é **criado/atualizado** no primeiro run válido.
- Adicionada verificação de **uniformidade**: todos os itens do array devem ter o **mesmo conjunto** de chaves do baseline.

> **Compatibilidade**: se você possuía baselines antigos salvos com *path* diferente (ex.: com barra final), a primeira execução gravará a chave normalizada. Se quiser preservar o histórico manualmente, copie o valor antigo para `v3_schema::<METHOD>::<pathNormalizado>` antes do run.

### Como usar a suíte final (v2 + v3)
1. **Collection ▸ Pre-request Script**: mantenha o bloco que injeta `Authorization` e `accessData` automaticamente.
2. **Collection ▸ Tests**: deixe o **Add-on v3 colado abaixo do v2** (os dois permanecem ativos).
3. **Request “00 – [RESET FLAGS]” ▸ Tests**: use o script de reset **compatível** (remove `skip_*` e caches).
4. Crie **clones negativos** dos requests com sufixos no **nome** para ativar asserções negativas automáticas.
5. Rode a suíte (Runner/Newman). Para uma execução limpa, inicie por “00 – [RESET FLAGS]”.

### Notas rápidas
- O add-on v3 **não altera** o comportamento do v2; ele só adiciona novas asserções e fluxos de verificação.
- Se o seu design aceitar “confirmar/excluir” múltiplas vezes **como sucesso**, comente os blocos de idempotência.

## Como usar

1. Importe a collection **Backend - Vidya Force** no Postman.
2. Edite a collection (ícone de três pontinhos) > **Tests**.
3. Cole **todo o conteúdo** do arquivo:

   - `tests-global-v2.js`

4. Salve a collection.
5. Configure as variáveis necessárias (ex.: `baseUrl`, `username`, `password`, `codVend`, etc.).
6. Execute a collection normalmente (Collection Runner ou Newman).

> Não é necessário configurar scripts por request. O v2 lê automaticamente:
> URL, método, status, corpo JSON, headers e nome do request, e aplica os testes adequados.

---

## Estrutura lógica do Script v2

### 1. Helpers Gerais

- Identificação do módulo a partir da URL:
  - `ppid/login` → `ppid_login`
  - `ppid/orderList` → `ppid_orderlist`
  - `products/...` → `products`
  - `partner/...` → `partner`
  - `user/...` → `user`
- Identificação de cenários negativos pelo nome do request:
  - Requests contendo `[NEGATIVO]`, `[ERRO]`, `[ERROR]`, `[4xx]`, `[5xx]`.
- Detecção de JSON, leitura segura com `try/catch`.
- Helpers:
  - `isBaseListResponse(json)` → detecta padrão `{ hasError, qtdRegistros, data[] }`.
  - `getMainArray(json)` → retorna o array principal de dados.
  - `ensureAtLeastOneKey(obj, keys)` → valida campos obrigatórios alternativos.
  - `ensureFieldType(value, types)` → valida tipos esperados.

### 2. Smoke Global `[SMOKE-GLOBAL]`

- Teste único:
  - Falha se houver resposta **5xx** (500, 502, 503, etc.).
- Não interrompe a execução total da collection.
- Serve como alarme rápido de instabilidade geral do backend.

### 3. Smoke por Módulo + Gate `skip_<modulo>`

Para cada request não-negativo:

- Verifica:
  - Status HTTP iniciando com **2xx**.
  - Se resposta segue `BaseList`:
    - `hasError` **deve ser `false`**.
- Em caso de falha:
  - Define `skip_<modulo> = true` em `Collection Variables`.
  - Exemplo: `skip_ppid_orderlist = true`.
- Em requests seguintes:
  - Se `skip_<modulo>` estiver ativo:
    - O script **ignora testes avançados** daquele módulo.
    - Garante que erros estruturais grandes não poluam os demais testes.

### 4. Testes Genéricos de Contrato

Aplicados sempre que a resposta for JSON.

Principais regras:

- JSON **não pode conter HTML** (`<html`).
- Se existir `hasError`:
  - Deve ser booleano.
  - Se `hasError = true`:
    - Exige `message` / `mensagem` / `error` / `errors`.
  - Se `hasError = false`:
    - Não pode vazar `stackTrace`, `exception`, `developerMessage`, etc.

### 5. Padrão BaseList

Quando detectado `{ hasError, qtdRegistros, data[] }`:

- Confere:
  - `data` é array.
  - `qtdRegistros` numérico ou string numérica.
  - `qtdRegistros == data.length` (quando numérico válido).
  - Se `qtdRegistros > 0` → `data.length > 0`.
  - Itens de `data` são objetos.
- Paginação (se presente):
  - `page`, `pageSize`, `totalPages` numéricos.
  - O controle de itens já vistos considera o `codVend` para evitar falsos "repetidos" quando múltiplos vendedores são testados na mesma execução.

---

## Contratos por Módulo (Resumo)

Abaixo um resumo dos principais contratos implementados, alinhados com a collection.

### Login (`/ppid/login`, `/ppid/newLogin`)

- `hasError` obrigatório.
- Sucesso:
  - Deve retornar pelo menos um:
    - `token`, `auth`, `accessToken`, `bearer`, `usuario`, `user`.
- Erro:
  - Exige mensagem clara (`mensagem/message/error/errors`).

### Dashboard (`/ppid/dashBoard`)

- `hasError` obrigatório.
- Sucesso:
  - Deve retornar dados em `data` ou `resumo` ou `cards` ou `widgets`.
  - Cards/widgets, se existirem:
    - Devem ter identificador/título e valores coerentes.

### Mensagens (`/ppid/message`)

- `hasError` obrigatório.
- Lista:
  - Cada item deve possuir ao menos:
    - `id`, `idMsg`, `message`, `texto` ou `titulo`.

### Pedidos - Lista (`/ppid/orderList`)

- Para cada pedido:
  - Identificador:
    - Um entre `nunota`, `NUNOTA`, `numero`, `id`.
  - Referência de parceiro:
    - Um entre `codParc`, `CODPARC`, `cliente`, `idParceiro`.
  - Se houver:
    - `status/situacao` não vazio.
    - Data não vazia (`data`, `dtEmissao`, etc.).
    - Campo de total numérico/string numérica.

### Pedidos - Detalhe (`/ppid/orderDetails`)

- Exige identificador (nunota/id/numero).
- Em sucesso:
  - Deve haver itens (itens/items/data) com estrutura mínima.

### Pedidos - Mutação

Endpoints como:

- `/ppid/orderSaveHeaderClient`
- `/ppid/salvarItem`
- `/ppid/duplicar`
- `/ppid/confirmarPedido`
- `/ppid/excluirItemPedido`
- `/ppid/orderDelete`

Valida:

- `hasError` obrigatório.
- Sucesso:
  - Retorna referência (`nunota`, `id`, `numero`, `success`, etc.).
- Erro:
  - Retorna mensagem clara.

### Preços

Endpoints:

- `/ppid/getPrices`
- `/ppid/getTablePrices`
- `/ppid/priceDetails`
- `/ppid/precoMinimo`

Valida:

- `hasError` obrigatório.
- Quando lista:
  - `codProd/CODPROD` presente quando aplicável.
  - Preços numéricos ou string numérica.

### Produtos (`/products/...`)

- Lista/Detalhe:
  - Identificador:
    - `codProd/CODPROD/id/codigo`.
  - Nome/descrição não vazios quando existirem.

### Parceiros (`/partner/...`)

- Quando lista BaseList:
  - `hasError` obrigatório.
- Itens:
  - `codParc/CODPARC` obrigatório.
  - Se possuir documento:
    - CPF/CNPJ com 11 ou 14 dígitos.

### Usuários (`/user/...`)

- Estrutura mínima:
  - Algum identificador de nome:
    - `nome`, `name`, `usuario`, `login`.

### Versão Mínima (`/user/versaominima`)

- Campo `versaoMinima` obrigatório.

### Logística / Feriados

- `/tabelafrete`, `/regrasentregas`, `/feriados` (quando retornarem JSON):
  - Aceitam BaseList ou objeto/array coerente.

### Documentos (Danfe/Boleto/PDF)

> Nota: os checks de binário só se aplicam a respostas **2xx** e **não-JSON**.


- Para erros em JSON:
  - Devem seguir padrão `hasError` + mensagem.

---

## Funcionais (Regras de Negócio Leves)

Aplicados quando a resposta segue BaseList.

- **TIPPESSOA x CGC_CPF**
  - `F` → CPF com 11 dígitos.
  - `J` → CNPJ com 14 dígitos.
- **TEMCOMODATO x QTDCOMODATO**
  - Se `TEMCOMODATO = "S"` → `QTDCOMODATO > 0`.
  - Se `TEMCOMODATO = "N"` → `QTDCOMODATO = 0`.
- Logs de inconsistência são exibidos no console do Postman.

---

## Negativos

Para respostas JSON com `status >= 400`:

- Exige:
  - `hasError = true` ou
  - `message/mensagem/error/errors`.
- Garante que erros sejam tratáveis pelo front-end.

---

## Fluxos / E2E

- Login bem-sucedido:
  - Salva `bearerToken` e `currentUser` em variáveis de ambiente.
- Endpoints de pedido:
  - Quando retornam `nunota/id`, valor é salvo para encadear cenários:
    - criar → detalhar → confirmar → excluir, etc.

---

## SLA / Performance

- Global:
  - `responseTime < 5000ms`.
- Críticos (login, dashboard, sincronização inicial, produtos, parceiros):
  - `responseTime < 2000ms`.

---

## Segurança

**Observação:** nas rotas de autenticação (`/login`, `/newLogin`, `/refresh`, `/token`), campos `auth/token` são aceitos; nas demais rotas permanecem bloqueados (além de `password/senha/secret`).


- Verifica se o JSON **não** expõe:
  - `password`, `senha`, `secret`, `segredo`.
- Se a requisição tem `Authorization`:
  - Não deve retornar `401` (token válido rejeitado).

---

## Qualidade de Dados

Para BaseList:

- Validações informativas:
  - UFs válidas.
  - CEP com 8 dígitos.
  - Detecção de possíveis documentos duplicados (`CGC_CPF`).

---


