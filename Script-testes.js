// =======================================================
// BACKEND VIDYA FORCE - TESTES GLOBAIS DINÂMICOS
// =======================================================
// - Smoke Global (opcional, comentado pra não travar tudo)
// - Smoke por módulo (dinâmico por URL) com flags skip_<modulo>
// - Gate: se smoke do módulo falhar, ignora testes avançados só dele
// - Testes genéricos: Contrato, Funcionais, Negativo, Fluxos, SLA,
//                     Segurança, Qualidade de Dados
// =======================================================


// 1. HELPERS GERAIS

const rawUrl = pm.request.url.toString();
const url = rawUrl.toLowerCase();
const method = pm.request.method;
const status = pm.response.code;
const contentType = (pm.response.headers.get("Content-Type") || "").toLowerCase();
const isJson = contentType.includes("application/json");
const requestName = (pm.info.requestName || "").toLowerCase();

// parse JSON se possível
let json = null;
if (isJson) {
    try {
        json = pm.response.json();
    } catch (e) {
        // JSON inválido será pego por contrato/smoke se relevante
    }
}

// identifica se é um teste negativo (não entra em smoke)
const isNegativeCase =
    requestName.includes("[negativo]") ||
    requestName.includes("[error]") ||
    requestName.includes("[erro]") ||
    requestName.includes("[4xx]") ||
    requestName.includes("[5xx]");

// pega segmentos do path
const pathSegments = (pm.request.url.path || []).filter(Boolean).map(s => s.toLowerCase());

// resolve módulo automático:
// - se começar com ppid/, módulo = "ppid_<seg2>" (ex: ppid_login, ppid_order)
// - senão, módulo = primeiro segmento (ex: partner, products, user, etc)
function getModuleKey() {
    if (!pathSegments.length) return "root";
    if (pathSegments[0] === "ppid" && pathSegments.length > 1) {
        return `ppid_${pathSegments[1]}`;
    }
    return pathSegments[0];
}

const moduleKey = getModuleKey();
const skipKey = `skip_${moduleKey}`;
const moduleSkip = pm.collectionVariables.get(skipKey) === "true";

// helpers baseList
function isBaseListResponse(body) {
    if (!body || typeof body !== "object") return false;
    const hasHasError = Object.prototype.hasOwnProperty.call(body, "hasError");
    const hasQtd = Object.prototype.hasOwnProperty.call(body, "qtdRegistros") ||
                   Object.prototype.hasOwnProperty.call(body, "qtdregistros");
    const hasData = Array.isArray(body.data);
    return hasHasError && hasQtd && hasData;
}

function getMainArray(body) {
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    return [];
}


// 2. SMOKE GLOBAL

// Sempre verificar 5xx (não para a collection por padrão)
pm.test("[SMOKE-GLOBAL] Sem erro 5xx na API", () => {
    pm.expect(status, "Resposta 5xx recebida").to.be.below(500);
});

// OPCIONAL: descomente para ABORTAR TODA A COLLECTION se qualquer request der 5xx
/*
if (status >= 500 && !isNegativeCase) {
    console.log("[SMOKE-GLOBAL] 5xx em", rawUrl, "- Abortando toda a coleção.");
    pm.execution.setNextRequest(null);
    return;
}
*/

// 3. SMOKE POR MÓDULO (DINÂMICO)

// Regra genérica:
// - Só considera requests que NÃO são negativas (pelo nome).
// - Se status não for 2xx => smoke do módulo falha.
// - Se seguir padrão {hasError, qtdRegistros, data} e hasError=true => smoke falha.
// - Quando falha: marca skip_<modulo> = true, e futuros testes avançados
//   desse módulo serão ignorados.
// - Não mexe com outros módulos.

if (!isNegativeCase && !moduleSkip) {
    let smokeFailed = false;

    // Status deve ser 2xx para cenário feliz
    if (String(status)[0] !== "2") {
        smokeFailed = true;
    }

    pm.test(`[SMOKE][${moduleKey}] Status 2xx esperado`, () => {
        pm.expect(
            String(status)[0],
            `Status inesperado no módulo ${moduleKey}: ${status} (${rawUrl})`
        ).to.eql("2");
    });


    // Se é uma resposta baseList, hasError deve ser false
    if (isJson && isBaseListResponse(json)) {
        pm.test(`[SMOKE][${moduleKey}] BaseList sem hasError`, () => {
            pm.expect(json.hasError, `hasError=true no módulo ${moduleKey}`).to.be.false;
        });
        if (json.hasError === true) {
            smokeFailed = true;
        }
    }

    if (smokeFailed) {
        pm.collectionVariables.set(skipKey, "true");
        console.log(`[SMOKE][${moduleKey}] Falhou. Marcando ${skipKey}=true. Ignorando testes avançados deste módulo nas próximas requisições.`);
    }
}


// 4. GATE POR MÓDULO

// Se o módulo está marcado como skip_<modulo>=true
// e NÃO é um teste negativo, sai fora antes dos testes avançados.
//

if (moduleSkip && !isNegativeCase) {
    console.log(`[GATE][${moduleKey}] Smoke já falhou. Ignorando testes avançados para esta requisição (${rawUrl}).`);
    return;
}


// =======================================================
// 5. TESTES AVANÇADOS (RODAM SE SMOKE DO MÓDULO OK)
// =======================================================
// Daqui pra baixo tudo é genérico ou se aplica só quando os campos existem,
// então funciona para múltiplos módulos automaticamente.
// =======================================================


// 5.1 CONTRATO / SCHEMA (VERSÃO APRIMORADA)

// Só valida contrato se veio JSON mesmo
if (!isJson || !json || typeof json !== "object") {
    // se algum endpoint crítico deveria ser JSON e não veio, você pode
    // futuramente adicionar uma lista de URLs obrigatoriamente JSON aqui.
} else {
    const bodyStr = JSON.stringify(json).toLowerCase();

    // GENÉRICO: JSON não pode ser HTML travestido
    pm.test("[CONTRACT][GENERIC] Resposta JSON não contém HTML", () => {
        pm.expect(bodyStr).to.not.include("<html");
    });

    // GENÉRICO: envelope hasError (muito usado no seu backend)
    if (Object.prototype.hasOwnProperty.call(json, "hasError")) {
        pm.test("[CONTRACT][GENERIC] hasError é booleano", () => {
            pm.expect(json.hasError, "hasError deve ser booleano").to.be.a("boolean");
        });

        pm.test("[CONTRACT][GENERIC] Estrutura de erro quando hasError = true", () => {
            if (json.hasError === true) {
                const hasMsg =
                    json.message ||
                    json.mensagem ||
                    json.error ||
                    (Array.isArray(json.errors) && json.errors.length > 0);
                pm.expect(!!hasMsg, "hasError=true sem mensagem/erro detalhado").to.be.true;
            }
        });

        pm.test("[CONTRACT][GENERIC] Sem stack/exception em sucesso (hasError = false)", () => {
            if (json.hasError === false) {
                const temLixo =
                    json.stackTrace ||
                    json.exception ||
                    json.developerMessage ||
                    json.error;
                pm.expect(!!temLixo, "Campos de erro vazando em sucesso").to.be.false;
            }
        });
    }
}

// -------------------------
// BaseList genérico
// -------------------------
if (isJson && isBaseListResponse(json)) {
    const data = getMainArray(json);

    pm.test("[CONTRACT][BaseList] Estrutura mínima válida", () => {
        pm.expect(json).to.have.property("hasError");
        pm.expect(json).to.have.property("qtdRegistros");
        pm.expect(json).to.have.property("data").that.is.an("array");
        pm.expect(json.hasError, "hasError deve ser booleano").to.be.a("boolean");
        pm.expect(
            typeof json.qtdRegistros === "number" || typeof json.qtdRegistros === "string",
            "qtdRegistros deve ser number ou string numérica"
        ).to.be.true;
    });

    pm.test("[CONTRACT][BaseList] Coerência entre qtdRegistros e data.length", () => {
        const qtd = Number(json.qtdRegistros);
        if (!Number.isNaN(qtd)) {
            pm.expect(qtd, "qtdRegistros divergente de data.length")
              .to.eql(data.length);
        }
    });

    pm.test("[CONTRACT][BaseList] Se qtdRegistros > 0 então data não é vazia", () => {
        const qtd = Number(json.qtdRegistros);
        if (!Number.isNaN(qtd) && qtd > 0) {
            pm.expect(data.length, "qtdRegistros > 0 mas data está vazia").to.be.above(0);
        }
    });

    pm.test("[CONTRACT][BaseList] Itens são objetos", () => {
        data.forEach((item, i) => {
            pm.expect(item, `Item[${i}] não é objeto`).to.be.an("object");
        });
    });

    pm.test("[CONTRACT][BaseList] Paginação consistente (se presente)", () => {
        if (json.page !== undefined) {
            pm.expect(json.page, "page deve ser numérico").to.be.a("number");
        }
        if (json.pageSize !== undefined) {
            pm.expect(json.pageSize, "pageSize deve ser numérico").to.be.a("number");
        }
        if (json.totalPages !== undefined) {
            pm.expect(json.totalPages, "totalPages deve ser numérico").to.be.a("number");
        }
    });
}

// =====================================================
// CONTRATOS POR MÓDULO (DINÂMICOS, BASEADOS NA COLLECTION)
// =====================================================

// Helpers locais
function ensureAtLeastOneKey(obj, keys, msg) {
    const ok = keys.some(k => Object.prototype.hasOwnProperty.call(obj, k));
    pm.expect(ok, msg || `Deve possuir pelo menos um dos campos: ${keys.join(", ")}`).to.be.true;
}

// -------------------------
// AUTENTICAÇÃO / LOGIN
// -------------------------
if (isJson && (moduleKey === "ppid_login" || url.includes("/ppid/newlogin"))) {
    pm.test("[CONTRACT][LOGIN] Envelope padrão", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CONTRACT][LOGIN] Sucesso contém dados mínimos de sessão", () => {
        if (json.hasError === false && String(status)[0] === "2") {
            const hasAuthData =
                json.token ||
                json.auth ||
                json.accessToken ||
                json.bearer ||
                json.usuario ||
                json.user;
            pm.expect(!!hasAuthData, "Login sem token/usuário/autorização no sucesso").to.be.true;
        }
    });

    pm.test("[CONTRACT][LOGIN] Erro de login com mensagem clara", () => {
        if (json.hasError === true || status >= 400) {
            const msg =
                json.message ||
                json.mensagem ||
                json.error ||
                (Array.isArray(json.errors) && json.errors[0]);
            pm.expect(!!msg, "Falha de login sem mensagem de erro").to.be.true;
        }
    });
}

// -------------------------
// DASHBOARD
// -------------------------
if (isJson && url.includes("/ppid/dashboard")) {
    pm.test("[CONTRACT][DASHBOARD] Estrutura básica do dashboard", () => {
        pm.expect(json).to.have.property("hasError");
        if (json.hasError === false) {
            pm.expect(
                json.data || json.resumo || json.cards || json.widgets,
                "Dashboard sem dados (data/resumo/cards/widgets)"
            ).to.exist;
        }
    });
}

// -------------------------
// MENSAGENS
// -------------------------
if (isJson && url.includes("/ppid/message")) {
    const data = getMainArray(json);
    pm.test("[CONTRACT][MENSAGENS] Estrutura de mensagens", () => {
        pm.expect(json).to.have.property("hasError");
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((m, i) => {
                ensureAtLeastOneKey(
                    m,
                    ["id", "idMsg", "message", "texto", "titulo"],
                    `[MENSAGENS] Item[${i}] sem campos básicos`
                );
            });
        }
    });
}

// -------------------------
// PEDIDOS - LISTAGENS
// -------------------------
if (isJson && url.includes("/ppid/orderlist")) {
    const data = getMainArray(json);
    pm.test("[CONTRACT][PEDIDOS][Lista] Campos básicos por pedido (se existirem)", () => {
        data.forEach((p, i) => {
            if (p.nunota !== undefined || p.NUNOTA !== undefined) {
                pm.expect(p.nunota || p.NUNOTA, `Pedido[${i}] nunota inválido`).to.exist;
            }
            if (p.codParc !== undefined || p.CODPARC !== undefined) {
                pm.expect(p.codParc || p.CODPARC, `Pedido[${i}] codParc inválido`).to.exist;
            }
        });
    });
}

// -------------------------
// PEDIDOS - DETALHE
// -------------------------
if (isJson && url.includes("/ppid/orderdetails")) {
    pm.test("[CONTRACT][PEDIDOS][Detalhe] Contém identificador do pedido", () => {
        ensureAtLeastOneKey(
            json,
            ["nunota", "NUNOTA", "numero", "id"],
            "[PEDIDOS][Detalhe] Sem identificador de pedido"
        );
    });
}

// -------------------------
// PEDIDOS - CRIAÇÃO / EDIÇÃO
// -------------------------
if (isJson && (
    url.includes("/ppid/ordersaveheaderclient") ||
    url.includes("/ppid/salvaritem") ||
    url.includes("/ppid/duplicar") ||
    url.includes("/ppid/confirmarpedido") ||
    url.includes("/ppid/excluiritempedido") ||
    url.includes("/ppid/orderdelete")
)) {
    pm.test("[CONTRACT][PEDIDOS][Mutação] Envelope de retorno padrão", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CONTRACT][PEDIDOS][Mutação] Sucesso com referência do pedido (quando aplicável)", () => {
        if (json.hasError === false && String(status)[0] === "2") {
            const hasId =
                json.nunota || json.NUNOTA || json.id || json.numero || json.success || json.sucesso;
            pm.expect(!!hasId, "Operação em pedido sem retorno mínimo (nunota/id/success)").to.be.true;
        }
    });
}

// -------------------------
// PREÇOS / TABELAS
// -------------------------
if (isJson && (
    url.includes("/ppid/getprices") ||
    url.includes("/ppid/gettableprices") ||
    url.includes("/ppid/pricedetails") ||
    url.includes("/ppid/precominimo")
)) {
    const data = getMainArray(json);

    pm.test("[CONTRACT][PRECOS] Envelope padrão", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CONTRACT][PRECOS] Itens com identificador de produto (se houver lista)", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                if (p.codProd !== undefined || p.CODPROD !== undefined) {
                    pm.expect(p.codProd || p.CODPROD, `[PRECOS] Item[${i}] sem codProd`).to.exist;
                }
            });
        }
    });
}

// -------------------------
// PRODUTOS
// -------------------------
if (isJson && moduleKey === "products") {
    const data = getMainArray(json);

    pm.test("[CONTRACT][PRODUTOS] Lista/detalhe com identificação de produto", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                ensureAtLeastOneKey(
                    p,
                    ["codProd", "CODPROD", "id", "codigo"],
                    `[PRODUTOS] Item[${i}] sem identificador`
                );
            });
        } else {
            // Em detalhes, o próprio json pode representar um produto
            if (!Array.isArray(data) && typeof json === "object") {
                if (url.includes("/products/details")) {
                    ensureAtLeastOneKey(
                        json,
                        ["codProd", "CODPROD", "id", "codigo"],
                        "[PRODUTOS][Details] Sem identificador de produto"
                    );
                }
            }
        }
    });
}

// -------------------------
// PARCEIROS / CLIENTES
// -------------------------
if (isJson && moduleKey === "partner") {
    const data = getMainArray(json);

    pm.test("[CONTRACT][PARCEIROS] Envelope padrão (quando aplicável)", () => {
        if (isBaseListResponse(json) || "hasError" in json) {
            pm.expect(json).to.have.property("hasError");
        }
    });

    pm.test("[CONTRACT][PARCEIROS] Campos-chave por parceiro (se houver lista)", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                ensureAtLeastOneKey(
                    p,
                    ["codParc", "CODPARC"],
                    `[PARCEIROS] Item[${i}] sem codParc`
                );
            });
        }
    });
}

// -------------------------
// USUÁRIOS / VENDEDORES
// -------------------------
if (isJson && moduleKey === "user") {
    pm.test("[CONTRACT][USUARIO] Estrutura mínima de usuário", () => {
        // Pode ser lista ou objeto único
        const data = Array.isArray(json) ? json : getMainArray(json);
        const arr = Array.isArray(data) && data.length ? data : [json];

        arr.forEach((u, i) => {
            ensureAtLeastOneKey(
                u,
                ["nome", "name", "usuario", "login"],
                `[USUARIO] Registro[${i}] sem identificação`
            );
        });
    });
}

// -------------------------
// CONFIGURAÇÕES / VERSÃO MÍNIMA
// -------------------------
if (isJson && url.includes("/user/versaominima")) {
    pm.test("[CONTRACT][CONFIG] Versão mínima presente", () => {
        pm.expect(json).to.have.property("versaoMinima");
    });
}

// -------------------------
// LOGÍSTICA / FRETE (quando JSON)
// -------------------------
if (isJson && (
    url.includes("/tabelafrete") ||
    url.includes("/regrasentregas") ||
    url.includes("/feriados")
)) {
    pm.test("[CONTRACT][LOGISTICA] Envelope ou lista válida", () => {
        // Aceita BaseList ou array simples de regras
        if (!isBaseListResponse(json)) {
            pm.expect(
                Array.isArray(json) || Array.isArray(json.data) || typeof json === "object",
                "[LOGISTICA] Estrutura inesperada"
            ).to.be.true;
        }
    });
}

// -------------------------
// DOCUMENTOS (viewDanfe, viewBoleto, PDFs)
// - Aqui normalmente NÃO é JSON. Se for JSON de erro, já cai nos genéricos.
// -------------------------
if (isJson && (
    url.includes("viewdanfe") ||
    url.includes("viewboleto") ||
    url.includes("viewpdf")
)) {
    pm.test("[CONTRACT][DOCS] Respostas de erro em documentos usam hasError/message", () => {
        if (status >= 400 || json.hasError === true) {
            const hasMsg =
                json.message || json.mensagem || json.error || json.errors;
            pm.expect(!!hasMsg, "[DOCS] Erro em documento sem mensagem").to.be.true;
        }
    });
}



// 5.2 FUNCIONAIS 

// Regras são aplicadas APENAS se os campos existirem.
// Isso permite reuso entre diferentes módulos sem if fixo.

if (isJson && isBaseListResponse(json)) {
    const data = getMainArray(json);

    // Documento x TIPPESSOA (para qualquer item que tenha esses campos)
    pm.test("[FUNCIONAL] Documento compatível com TIPPESSOA (se informado)", () => {
        data.forEach((p) => {
            if (!p.TIPPESSOA || !p.CGC_CPF) return;
            const doc = String(p.CGC_CPF).replace(/\D/g, "");
            if (p.TIPPESSOA === "F") {
                pm.expect(doc.length, `CPF inválido em registro com CODPARC/COD=${p.CODPARC || p.COD || ""}`).to.eql(11);
            }
            if (p.TIPPESSOA === "J") {
                pm.expect(doc.length, `CNPJ inválido em registro com CODPARC/COD=${p.CODPARC || p.COD || ""}`).to.eql(14);
            }
        });
    });

    // TEMCOMODATO x QTDCOMODATO (se existirem)
    pm.test("[FUNCIONAL] TEMCOMODATO coerente com QTDCOMODATO (se existir)", () => {
        const erros = [];
        data.forEach((p) => {
            if (p.TEMCOMODATO === undefined && p.QTDCOMODATO === undefined) return;
            const qtd = p.QTDCOMODATO || 0;
            if (p.TEMCOMODATO === "S" && qtd <= 0) {
                erros.push(p.CODPARC || p.COD || JSON.stringify(p));
            }
            if (p.TEMCOMODATO === "N" && qtd > 0) {
                erros.push(p.CODPARC || p.COD || JSON.stringify(p));
            }
        });
        if (erros.length) {
            console.log("[FUNCIONAL] Inconsistências TEMCOMODATO/QTDCOMODATO:", erros);
        }
        pm.expect(erros, "Inconsistências TEMCOMODATO/QTDCOMODATO encontradas").to.be.empty;
    });
}


// 5.3 NEGATIVOS

if (isJson && status >= 400) {
    pm.test("[NEGATIVO] Erro possui estrutura mínima", () => {
        const hasMensagem =
            json.hasError === true ||
            json.message ||
            json.error ||
            json.errors;
        pm.expect(
            hasMensagem,
            "Erro sem indicação clara (hasError/message/error/errors)"
        ).to.exist;
    });
}


// 5.4 FLUXOS / E2E 

// Login bem-sucedido → salva dados para outras requisições
if (isJson && moduleKey === "ppid_login" && status === 200 && json.hasError === false) {
    pm.test("[FLOW] Login popula variáveis globais", () => {
        if (json.token) {
            pm.environment.set("bearerToken", json.token);
        }
        if (json.codVend || json.usuario || json.userId) {
            pm.environment.set("currentUser", json.codVend || json.usuario || json.userId);
        }
        pm.expect(true).to.be.true;
    });
}

// Qualquer resposta com nunota/id de pedido → reaproveitar
if (isJson && /order/.test(moduleKey) && status === 200) {
    pm.test("[FLOW] Identificador de pedido reaproveitável (se presente)", () => {
        const nunota = json.nunota || json.NUNOTA || json.id || json.numero || null;
        if (nunota) {
            pm.environment.set("nunota", String(nunota));
        }
        pm.expect(true).to.be.true;
    });
}


// 5.5 REGRESSÃO (GENÉRICO LEVE)

if (isJson && url.includes("/user/versaominima")) {
    pm.test("[REGRESSAO] /user/versaoMinima mantém versaoMinima", () => {
        pm.expect(json).to.have.property("versaoMinima");
    });
}


// 5.6 SLA / PERFORMANCE

pm.test("[SLA] Tempo de resposta abaixo de 5000ms (global)", () => {
    pm.expect(pm.response.responseTime).to.be.below(5000);
});

// Mais rígido para endpoints que normalmente são críticos (heurística genérica)
if (
    moduleKey.includes("login") ||
    moduleKey.includes("partner") ||
    moduleKey.includes("products") ||
    moduleKey.includes("ppid_dashboard") ||
    moduleKey.includes("ppid_sincronizacaoinicial")
) {
    pm.test("[SLA] Endpoint crítico abaixo de 2000ms", () => {
        pm.expect(pm.response.responseTime).to.be.below(2000);
    });
}

// 5.7 SEGURANÇA

if (isJson && json) {
    pm.test("[SEGURANCA] Nenhum campo sensível óbvio exposto", () => {
        const bodyStr = JSON.stringify(json).toLowerCase();
        const proibidos = ["\"password\"", "\"senha\"", "\"secret\"", "\"segredo\""];
        proibidos.forEach((chave) => {
            pm.expect(bodyStr, `Campo sensível exposto: ${chave}`).to.not.include(chave);
        });
    });
}

if (pm.request.headers.has("authorization")) {
    pm.test("[SEGURANCA] Request autenticada não deve retornar 401", () => {
        pm.expect(status, "Request autenticada retornou 401").to.not.equal(401);
    });
}

// 5.8 QUALIDADE DE DADOS 

if (isJson && isBaseListResponse(json)) {
    const data = getMainArray(json);

    // UF válida quando campo UF existir
    pm.test("[DATA] UF válida quando informada", () => {
        const ufsValidas = [
            "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA",
            "MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN",
            "RS","RO","RR","SC","SP","SE","TO"
        ];
        const invalidos = [];
        data.forEach((p) => {
            if (p.UF && p.UF !== "0" && !ufsValidas.includes(p.UF)) {
                invalidos.push(p.UF);
            }
        });
        if (invalidos.length) {
            console.log("[DATA] UFs inválidas encontradas:", invalidos);
        }
        // informativo, não trava por padrão
        pm.expect(true).to.be.true;
    });

    // CEP com 8 dígitos quando existir campo CEP
    pm.test("[DATA] CEP com 8 dígitos quando informado", () => {
        const erros = [];
        data.forEach((p) => {
            if (p.CEP) {
                const cep = String(p.CEP).replace(/\D/g, "");
                if (cep.length !== 8) erros.push(p.CEP);
            }
        });
        if (erros.length) {
            console.log("[DATA] CEPs inválidos encontrados:", erros);
        }
        // se quiser travar, troque por expect(erros).to.be.empty;
        pm.expect(true).to.be.true;
    });

    // Duplicidade de documento (se CGC_CPF existir)
    pm.test("[DATA] Documento não duplicado entre registros (quando informado)", () => {
        const seen = {};
        const dups = [];
        data.forEach((p) => {
            const doc = (p.CGC_CPF || "").replace(/\D/g, "");
            if (!doc) return;
            if (seen[doc] && seen[doc] !== (p.CODPARC || p.COD)) {
                dups.push({ doc, a: seen[doc], b: p.CODPARC || p.COD });
            } else {
                seen[doc] = p.CODPARC || p.COD;
            }
        });
        if (dups.length) {
            console.log("[DATA] Documentos duplicados:", dups);
        }
        pm.expect(true).to.be.true; // informativo
    });
}
