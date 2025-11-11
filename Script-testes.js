// =======================================================
// BACKEND VIDYA FORCE - TESTES GLOBAIS DINÂMICOS (v2)
// =======================================================

// =======================================================
// 1. HELPERS GERAIS
// =======================================================

const rawUrl = pm.request.url.toString();
const url = rawUrl.toLowerCase();
const method = pm.request.method;
const status = pm.response.code;
const contentType = (pm.response.headers.get("Content-Type") || "").toLowerCase();
const isJson = contentType.includes("application/json");
const requestName = (pm.info.requestName || "").toLowerCase();

// Tenta parsear JSON (sem quebrar se não for JSON)
let json = null;
if (isJson) {
    try {
        json = pm.response.json();
    } catch (e) {
        // JSON inválido será pego em testes de contrato mais abaixo.
    }
}

// Identifica se é request NEGATIVO pelo nome
const isNegativeCase =
    requestName.includes("[negativo]") ||
    requestName.includes("[error]") ||
    requestName.includes("[erro]") ||
    requestName.includes("[4xx]") ||
    requestName.includes("[5xx]");

// Segmentar path em minúsculas
const pathSegments = (pm.request.url.path || [])
    .filter(Boolean)
    .map(s => String(s).toLowerCase());

// Resolve chave de módulo automática
// - Se começar com ppid/, usa ppid_<segundo>
// - Senão, usa primeiro segmento (products, partner, user, etc)
function getModuleKey() {
    if (!pathSegments.length) return "root";
    if (pathSegments[0] === "ppid") {
        if (pathSegments.length > 1) {
            return "ppid_" + pathSegments[1];
        }
        return "ppid_root";
    }
    return pathSegments[0];
}

const moduleKey = getModuleKey();
const skipKey = `skip_${moduleKey}`;
const moduleSkip = pm.collectionVariables.get(skipKey) === "true";

// Helpers para respostas no padrão BaseList
function isBaseListResponse(body) {
    if (!body || typeof body !== "object") return false;
    const hasHasError = Object.prototype.hasOwnProperty.call(body, "hasError");
    const hasQtd =
        Object.prototype.hasOwnProperty.call(body, "qtdRegistros") ||
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

// Helper genérico: pelo menos 1 chave presente
function ensureAtLeastOneKey(obj, keys, msg) {
    const ok = keys.some(k => Object.prototype.hasOwnProperty.call(obj, k));
    pm.expect(ok, msg || `Deve possuir pelo menos um dos campos: ${keys.join(", ")}`).to.be.true;
}

// Helper: tipo esperado
function ensureFieldType(value, expectedTypes, msg) {
    const types = Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes];
    const actual = typeof value;
    const ok = types.includes(actual);
    pm.expect(ok, msg || `Tipo ${actual} não está entre os esperados: ${types.join(", ")}`).to.be.true;
}


// =======================================================
// 2. SMOKE GLOBAL (5xx)  - NÃO ABORTA A COLEÇÃO
// =======================================================

pm.test("[SMOKE-GLOBAL] Sem erro 5xx na API", () => {
    if (status >= 500 && !isNegativeCase) {
        console.log(`[#SMOKE-GLOBAL] Erro 5xx em ${rawUrl} (status: ${status})`);
    }
    pm.expect(status, "Resposta 5xx recebida").to.be.below(500);
});


// =======================================================
// 3. SMOKE POR MÓDULO + GATE
// =======================================================
//
// - Só avalia cenários não negativos.
// - Status não 2xx => smoke do módulo falha.
// - BaseList com hasError=true => smoke do módulo falha.
// - Ao falhar: seta skip_<modulo> = true.
// - Testes avançados para esse módulo são ignorados nas próximas requisições.
//

if (!isNegativeCase && !moduleSkip) {
    let smokeFailed = false;

    // Status deve ser 2xx
    if (String(status)[0] !== "2") {
        smokeFailed = true;
    }

    pm.test(`[SMOKE][${moduleKey}] Status 2xx esperado`, () => {
        pm.expect(
            String(status)[0],
            `Status inesperado no módulo ${moduleKey}: ${status} (${rawUrl})`
        ).to.eql("2");
    });

    // Se resposta no padrão BaseList, hasError deve ser false
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
        console.log(`[SMOKE][${moduleKey}] FALHOU. Marcando ${skipKey}=true. Testes avançados deste módulo serão ignorados nas próximas requisições.`);
    }
}

// Gate: se módulo já está marcado como skip, não roda mais nada avançado
if (moduleSkip && !isNegativeCase) {
    console.log(`[GATE][${moduleKey}] Smoke falhou anteriormente. Ignorando testes avançados para ${rawUrl}.`);
    return;
}


// =======================================================
// 4. TESTES GENÉRICOS DE CONTRATO / SCHEMA
// =======================================================

if (isJson && json && typeof json === "object") {
    const bodyStr = JSON.stringify(json).toLowerCase();

    // 4.1 JSON não pode ser HTML disfarçado
    pm.test("[CONTRACT][GENERIC] Resposta JSON não contém HTML", () => {
        pm.expect(bodyStr).to.not.include("<html");
    });

    // 4.2 Convenção hasError
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

        pm.test("[CONTRACT][GENERIC] Sucesso não vaza stack/exception", () => {
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


// =======================================================
// 5. GENÉRICO: PADRÃO BASELIST
// =======================================================

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


// =======================================================
// 6. CONTRATOS POR MÓDULO / ENDPOINT
// =======================================================

// 6.1 AUTENTICAÇÃO / LOGIN (Login + newLogin)
if (isJson && (moduleKey === "ppid_login" || url.includes("/ppid/newlogin"))) {
    pm.test("[CONTRACT][LOGIN] Envelope padrão com hasError", () => {
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

            if (json.token) {
                ensureFieldType(json.token, "string", "Token de autenticação deve ser string");
            }
            if (json.expiraEm || json.expiresIn) {
                ensureFieldType(json.expiraEm || json.expiresIn, ["number", "string"], "Tempo de expiração inválido");
            }
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

// 6.2 DASHBOARD (/ppid/dashboard ou /ppid/dashboard-like)
if (isJson && url.includes("/ppid/dashboard")) {
    pm.test("[CONTRACT][DASHBOARD] Estrutura básica", () => {
        pm.expect(json).to.have.property("hasError");
        if (json.hasError === false) {
            pm.expect(
                json.data || json.resumo || json.cards || json.widgets,
                "Dashboard sem dados (data/resumo/cards/widgets)"
            ).to.exist;
        }
    });

    pm.test("[CONTRACT][DASHBOARD] Cards/resumos identificáveis (se existirem)", () => {
        if (json.hasError === false) {
            const blocos = [].concat(
                Array.isArray(json.data) ? json.data : [],
                Array.isArray(json.cards) ? json.cards : [],
                Array.isArray(json.widgets) ? json.widgets : []
            );
            blocos.forEach((card, i) => {
                if (!card || typeof card !== "object") return;
                ensureAtLeastOneKey(
                    card,
                    ["id", "identificador", "titulo", "label", "descricao"],
                    `[DASHBOARD] Card[${i}] sem identificador/título`
                );
                if (card.valor !== undefined || card.value !== undefined) {
                    ensureFieldType(
                        card.valor !== undefined ? card.valor : card.value,
                        ["number", "string"],
                        `[DASHBOARD] Card[${i}] valor inválido`
                    );
                }
            });
        }
    });
}

// 6.3 MENSAGENS (/ppid/message)
if (isJson && url.includes("/ppid/message")) {
    const data = getMainArray(json);

    pm.test("[CONTRACT][MENSAGENS] Envelope e itens básicos", () => {
        pm.expect(json).to.have.property("hasError");
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((m, i) => {
                ensureAtLeastOneKey(
                    m,
                    ["id", "idMsg", "message", "texto", "titulo"],
                    `[MENSAGENS] Item[${i}] sem campos mínimos`
                );
            });
        }
    });
}

// 6.4 PEDIDOS - LISTA (/ppid/orderlist)
if (isJson && url.includes("/ppid/orderlist")) {
    const data = getMainArray(json);

    pm.test("[CONTRACT][PEDIDOS][Lista] Campos essenciais por pedido", () => {
        data.forEach((p, i) => {
            // Identificador
            ensureAtLeastOneKey(
                p,
                ["nunota", "NUNOTA", "numero", "id"],
                `[PEDIDOS][Lista] Pedido[${i}] sem identificador`
            );

            // Parceiro
            ensureAtLeastOneKey(
                p,
                ["codParc", "CODPARC", "cliente", "idParceiro"],
                `[PEDIDOS][Lista] Pedido[${i}] sem referência de parceiro`
            );

            // Status / situação (se existir)
            if (
                p.status !== undefined || p.STATUS !== undefined ||
                p.situacao !== undefined || p.SITUACAO !== undefined
            ) {
                ensureAtLeastOneKey(
                    p,
                    ["status", "STATUS", "situacao", "SITUACAO"],
                    `[PEDIDOS][Lista] Pedido[${i}] status/situação vazio`
                );
            }

            // Data (se informada)
            if (p.data || p.DATA || p.dtEmissao || p.DTEMISSAO) {
                const d =
                    p.data || p.DATA ||
                    p.dtEmissao || p.DTEMISSAO;
                pm.expect(String(d).length, `[PEDIDOS][Lista] Pedido[${i}] com data vazia`).to.be.above(0);
            }

            // Totais (se presentes)
            if (p.total || p.TOTAL || p.valorTotal) {
                const total = p.total || p.TOTAL || p.valorTotal;
                ensureFieldType(total, ["number", "string"], `[PEDIDOS][Lista] Pedido[${i}] total inválido`);
            }
        });
    });
}

// 6.5 PEDIDOS - DETALHE (/ppid/orderdetails)
if (isJson && url.includes("/ppid/orderdetails")) {
    pm.test("[CONTRACT][PEDIDOS][Detalhe] Contém identificador do pedido", () => {
        ensureAtLeastOneKey(
            json,
            ["nunota", "NUNOTA", "numero", "id"],
            "[PEDIDOS][Detalhe] Sem identificador de pedido"
        );
    });

    pm.test("[CONTRACT][PEDIDOS][Detalhe] Possui itens (quando sucesso)", () => {
        if (json.hasError === false || String(status)[0] === "2") {
            const itens =
                (Array.isArray(json.itens) && json.itens) ||
                (Array.isArray(json.items) && json.items) ||
                (json.data && Array.isArray(json.data) && json.data) ||
                [];
            pm.expect(itens.length, "[PEDIDOS][Detalhe] Nenhum item retornado").to.be.above(0);
        }
    });
}

// 6.6 PEDIDOS - MUTAÇÃO (save, item, duplicar, confirmar, excluir, delete)
if (isJson && (
    url.includes("/ppid/ordersaveheaderclient") ||
    url.includes("/ppid/salvaritem") ||
    url.includes("/ppid/duplicar") ||
    url.includes("/ppid/confirmarpedido") ||
    url.includes("/ppid/excluiritempedido") ||
    url.includes("/ppid/orderdelete")
)) {
    pm.test("[CONTRACT][PEDIDOS][Mutação] Envelope possui hasError", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CONTRACT][PEDIDOS][Mutação] Sucesso retorna referência", () => {
        if (json.hasError === false && String(status)[0] === "2") {
            const hasId =
                json.nunota || json.NUNOTA || json.id || json.numero || json.success || json.sucesso;
            pm.expect(!!hasId, "Operação em pedido sem retorno mínimo (nunota/id/success)").to.be.true;
        }
    });

    pm.test("[CONTRACT][PEDIDOS][Mutação] Erro retorna mensagem", () => {
        if (json.hasError === true || status >= 400) {
            const msg =
                json.message ||
                json.mensagem ||
                json.error ||
                (Array.isArray(json.errors) && json.errors[0]);
            pm.expect(!!msg, "[PEDIDOS][Mutação] Erro sem mensagem").to.be.true;
        }
    });
}

// 6.7 PREÇOS / TABELAS
if (isJson && (
    url.includes("/ppid/getprices") ||
    url.includes("/ppid/gettableprices") ||
    url.includes("/ppid/pricedetails") ||
    url.includes("/ppid/precominimo")
)) {
    const data = getMainArray(json);

    pm.test("[CONTRACT][PRECOS] Envelope com hasError", () => {
        pm.expect(json).to.have.property("hasError");
    });

    pm.test("[CONTRACT][PRECOS] Itens com identificadores (quando lista)", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                if (p.codProd !== undefined || p.CODPROD !== undefined) {
                    pm.expect(p.codProd || p.CODPROD, `[PRECOS] Item[${i}] codProd vazio`).to.exist;
                }
                if (p.preco || p.PRECO || p.valor || p.precoLiquido) {
                    const preco = p.preco || p.PRECO || p.valor || p.precoLiquido;
                    ensureFieldType(preco, ["number", "string"], `[PRECOS] Item[${i}] preço inválido`);
                }
            });
        }
    });
}

// 6.8 PRODUTOS
if (isJson && moduleKey === "products") {
    const data = getMainArray(json);
    pm.test("[CONTRACT][PRODUTOS] Lista/Detalhe com identificador e nome", () => {
        const arr = Array.isArray(data) && data.length ? data : [json];
        arr.forEach((p, i) => {
            if (!p || typeof p !== "object") return;
            ensureAtLeastOneKey(
                p,
                ["codProd", "CODPROD", "id", "codigo"],
                `[PRODUTOS] Registro[${i}] sem identificador`
            );
            if (p.descricao || p.DESCRICAO || p.nome || p.NOME) {
                const desc = p.descricao || p.DESCRICAO || p.nome || p.NOME;
                pm.expect(String(desc).length, `[PRODUTOS] Registro[${i}] descrição/nome vazio`).to.be.above(0);
            }
        });
    });
}

// 6.9 PARCEIROS / CLIENTES
if (isJson && moduleKey === "partner") {
    const data = getMainArray(json);

    pm.test("[CONTRACT][PARCEIROS] Envelope (quando aplicável)", () => {
        if (isBaseListResponse(json) || "hasError" in json) {
            pm.expect(json).to.have.property("hasError");
        }
    });

    pm.test("[CONTRACT][PARCEIROS] Campos-chave por parceiro", () => {
        if (Array.isArray(data) && data.length > 0) {
            data.forEach((p, i) => {
                ensureAtLeastOneKey(
                    p,
                    ["codParc", "CODPARC"],
                    `[PARCEIROS] Item[${i}] sem codParc`
                );
                if (p.CGC_CPF || p.CNPJ || p.cnpj || p.cpf) {
                    const doc = (p.CGC_CPF || p.CNPJ || p.cnpj || p.cpf || "").toString().replace(/\D/g, "");
                    if (doc) {
                        pm.expect([11, 14], `[PARCEIROS] Item[${i}] documento com tamanho inválido`).to.include(doc.length);
                    }
                }
            });
        }
    });
}

// 6.10 USUÁRIOS / VENDEDORES
if (isJson && moduleKey === "user") {
    pm.test("[CONTRACT][USUARIO] Estrutura mínima", () => {
        const data = Array.isArray(json) ? json : getMainArray(json);
        const arr = Array.isArray(data) && data.length ? data : [json];

        arr.forEach((u, i) => {
            if (!u || typeof u !== "object") return;
            ensureAtLeastOneKey(
                u,
                ["nome", "name", "usuario", "login"],
                `[USUARIO] Registro[${i}] sem identificação`
            );
        });
    });
}

// 6.11 CONFIGURAÇÕES / VERSÃO MÍNIMA
if (isJson && url.includes("/user/versaominima")) {
    pm.test("[CONTRACT][CONFIG] versaoMinima presente", () => {
        pm.expect(json).to.have.property("versaoMinima");
    });
}

// 6.12 LOGÍSTICA / FRETE / FERIADOS (quando JSON)
if (isJson && (
    url.includes("/tabelafrete") ||
    url.includes("/regrasentregas") ||
    url.includes("/feriados")
)) {
    pm.test("[CONTRACT][LOGISTICA] Estrutura válida", () => {
        if (!isBaseListResponse(json)) {
            pm.expect(
                Array.isArray(json) || Array.isArray(json.data) || typeof json === "object",
                "[LOGISTICA] Estrutura inesperada"
            ).to.be.true;
        }
    });
}

// 6.13 DOCUMENTOS (viewDanfe, viewBoleto, viewPdf) - quando retornam JSON de erro
if (isJson && (
    url.includes("viewdanfe") ||
    url.includes("viewboleto") ||
    url.includes("viewpdf")
)) {
    pm.test("[CONTRACT][DOCS] Erros padronizados em consultas de documentos", () => {
        if (status >= 400 || json.hasError === true) {
            const msg =
                json.message ||
                json.mensagem ||
                json.error ||
                json.errors;
            pm.expect(!!msg, "[DOCS] Erro em documento sem mensagem").to.be.true;
        }
    });
}


// =======================================================
// 7. FUNCIONAIS (REGRAS DE NEGÓCIO LEVES)
// =======================================================
//
// Aplicados principalmente em respostas BaseList, sem travar endpoints
// que não usam esses campos.
//

if (isJson && isBaseListResponse(json)) {
    const data = getMainArray(json);

    // 7.1 Documento x TIPPESSOA
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

    // 7.2 TEMCOMODATO x QTDCOMODATO
    pm.test("[FUNCIONAL] TEMCOMODATO coerente com QTDCOMODATO (se existir)", () => {
        const inconsistentes = [];
        data.forEach((p) => {
            if (p.TEMCOMODATO === undefined && p.QTDCOMODATO === undefined) return;
            const qtd = Number(p.QTDCOMODATO || 0);
            if (p.TEMCOMODATO === "S" && !(qtd > 0)) {
                inconsistentes.push(p.CODPARC || p.COD || JSON.stringify(p));
            }
            if (p.TEMCOMODATO === "N" && qtd > 0) {
                inconsistentes.push(p.CODPARC || p.COD || JSON.stringify(p));
            }
        });
        if (inconsistentes.length) {
            console.log("[FUNCIONAL] Inconsistências TEMCOMODATO/QTDCOMODATO:", inconsistentes);
        }
        pm.expect(true).to.be.true; // informativo (não quebra por padrão)
    });
}


// =======================================================
// 8. NEGATIVOS (STATUS 4xx/5xx COM JSON)
// =======================================================

if (isJson && status >= 400) {
    pm.test("[NEGATIVO] Estrutura mínima de erro em respostas 4xx/5xx", () => {
        const hasMensagem =
            json.hasError === true ||
            json.message ||
            json.mensagem ||
            json.error ||
            json.errors;
        pm.expect(
            hasMensagem,
            "Erro sem indicação clara (hasError/message/mensagem/error/errors)"
        ).to.exist;
    });
}


// =======================================================
// 9. FLUXOS / E2E (LOGIN, PEDIDO)
// =======================================================

// 9.1 Após login bem-sucedido, salva dados úteis
if (isJson && moduleKey === "ppid_login" && status === 200 && json.hasError === false) {
    pm.test("[FLOW] Login popula variáveis para chamadas seguintes", () => {
        if (json.token) {
            pm.environment.set("bearerToken", json.token);
        }
        if (json.codVend || json.usuario || json.userId) {
            pm.environment.set("currentUser", json.codVend || json.usuario || json.userId);
        }
        pm.expect(true).to.be.true;
    });
}

// 9.2 Qualquer resposta de pedido que exponha nunota/id reaproveita para próximos testes
if (isJson && /ppid_order/.test(moduleKey) && String(status)[0] === "2") {
    pm.test("[FLOW] Captura nunota/id de pedido quando presente", () => {
        const nunota =
            json.nunota || json.NUNOTA ||
            (Array.isArray(json.data) && json.data[0] && (json.data[0].nunota || json.data[0].NUNOTA)) ||
            json.id || json.numero || null;
        if (nunota) {
            pm.environment.set("nunota", String(nunota));
        }
        pm.expect(true).to.be.true;
    });
}


// =======================================================
// 10. SLA / PERFORMANCE
// =======================================================

pm.test("[SLA] Tempo de resposta abaixo de 5000ms (global)", () => {
    pm.expect(pm.response.responseTime).to.be.below(5000);
});

// Mais rígido para endpoints mais críticos
if (
    moduleKey.includes("login") ||
    moduleKey.includes("ppid_dashboard") ||
    moduleKey.includes("ppid_sincronizacaoinicial") ||
    moduleKey.includes("products") ||
    moduleKey.includes("partner")
) {
    pm.test("[SLA] Endpoint crítico abaixo de 2000ms", () => {
        pm.expect(pm.response.responseTime).to.be.below(2000);
    });
}


// =======================================================
// 11. SEGURANÇA
// =======================================================

if (isJson && json) {
    pm.test("[SEGURANCA] Nenhum campo sensível óbvio exposto", () => {
        const bodyStr = JSON.stringify(json).toLowerCase();
        const proibidos = ['"password"', '"senha"', '"secret"', '"segredo"'];
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


// =======================================================
// 12. QUALIDADE DE DADOS (INFORMATIVO)
// =======================================================
//
// Executa apenas quando a resposta segue BaseList.
//

if (isJson && isBaseListResponse(json)) {
    const data = getMainArray(json);

    // 12.1 UF válida
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
        pm.expect(true).to.be.true;
    });

    // 12.2 CEP com 8 dígitos
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
        pm.expect(true).to.be.true;
    });

    // 12.3 Documento não duplicado (CGC_CPF entre parceiros)
    pm.test("[DATA] Documento não duplicado entre registros (quando informado)", () => {
        const seen = {};
        const dups = [];
        data.forEach((p) => {
            const doc = (p.CGC_CPF || "").replace(/\D/g, "");
            if (!doc) return;
            const chaveParc = p.CODPARC || p.COD;
            if (seen[doc] && seen[doc] !== chaveParc) {
                dups.push({ doc, a: seen[doc], b: chaveParc });
            } else if (chaveParc) {
                seen[doc] = chaveParc;
            }
        });
        if (dups.length) {
            console.log("[DATA] Documentos duplicados:", dups);
        }
        pm.expect(true).to.be.true;
    });
}


// =======================================================
// BACKEND VIDYA FORCE - ADD-ON TESTS (v3)
// Complementa o seu v2 com:
// - Validação de BINÁRIOS (PDF/DANFE/BOLETO/IMAGENS)
// - Paginação entre páginas (sem repetir itens)
// - Invariantes cross-endpoints (anexo->list, foto->imagem, parceiro->list)
// - Idempotência/negativos padronizados em mutações críticas
// - Pequenas proteções de segurança e consistência
// =======================================================
(function V3_ADDON() {
  // ---------- Contexto local seguro (não conflita com v2) ----------
  const req = pm.request;
  const res = pm.response;

  const rawUrl = req.url.toString();
  const url = rawUrl.toLowerCase();
  const status = res.code;
  const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
  const isJson = contentType.includes('application/json');

  let json = null;
  if (isJson) {
    try { json = res.json(); } catch (_) { /* deixa o v2 apontar JSON inválido */ }
  }

  const requestName = (pm.info.requestName || '').toLowerCase();
  const isNegativeCase =
    requestName.includes('[negativo]') ||
    requestName.includes('[error]')    ||
    requestName.includes('[erro]')     ||
    requestName.includes('[4xx]')      ||
    requestName.includes('[5xx]')      ||
    requestName.includes('[sem auth]') ||
    requestName.includes('[sem accessdata]');

  const pathSegments = (req.url.path || []).filter(Boolean).map(s => String(s).toLowerCase());

  function getModuleKey() {
    if (!pathSegments.length) return 'root';
    if (pathSegments[0] === 'ppid') {
      if (pathSegments[1]) return 'ppid_' + pathSegments[1];
      return 'ppid_root';
    }
    return pathSegments[0];
  }
  const moduleKey = getModuleKey();

  // Helpers rápidos
  function getMainArray(body) {
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    return [];
  }
  function ensureFieldType(value, types) {
    const t = Array.isArray(types) ? types : [types];
    const isOk = t.some(tt => typeof value === tt || (tt === 'array' && Array.isArray(value)));
    pm.expect(isOk, `Tipo inesperado. Esperado: ${t.join('/')}; Recebido: ${typeof value}`).to.be.true;
  }
  function getBaseUrl() {
    const c = pm.collectionVariables.get('baseUrl');
    if (c) return c;
    const u = req.url;
    const proto = (u.protocol || 'http');
    const host = Array.isArray(u.host) ? u.host.join('.') : (u.host || 'localhost');
    const port = u.port ? `:${u.port}` : '';
    return `${proto}://${host}${port}`;
  }
  const BASE = getBaseUrl();
  const AUTH = (pm.environment.get('auth_token') || pm.collectionVariables.get('auth_token')) ? `Basic ${pm.environment.get('auth_token') || pm.collectionVariables.get('auth_token')}` : undefined;
  const CODVEND = pm.environment.get('codVend') || pm.collectionVariables.get('codVend') || '1';

  // =======================================================
  // A) BINÁRIOS (PDF / DANFE / BOLETO / IMAGENS)
  // =======================================================
  (function binaryChecks() {
    const ct = contentType;
    const u = url;

    // PDF-like
    if (u.includes('/viewpdf') || u.includes('/viewdanfe') || u.includes('/viewboleto')) {
      pm.test('[BINARIO] Content-Type PDF', () => pm.expect(ct).to.include('application/pdf'));
      pm.test('[BINARIO] Tamanho > 1KB', () => pm.expect(res.responseSize).to.be.above(1024));
      pm.test('[BINARIO] Content-Disposition presente', () => {
        const cd = res.headers.get('Content-Disposition') || '';
        pm.expect(cd.length > 0, 'Content-Disposition ausente').to.be.true;
      });
    }

    // Imagens (produto/usuário)
    if (u.includes('/imagem/')) {
      pm.test('[BINARIO] Content-Type imagem', () =>
        pm.expect(ct).to.match(/image\/(png|jpe?g|webp)/));
      pm.test('[BINARIO] Tamanho > 512B', () => pm.expect(res.responseSize).to.be.above(512));
    }
  })();

  // =======================================================
  // B) PAGINAÇÃO (ex.: /ppid/getPrices?page=N)
  //    - Garante que itens não se repetem entre páginas na MESMA execução
  // =======================================================
  (function paginationChecks() {
    if (!isJson || !url.includes('/ppid/getprices')) return;
    const data = getMainArray(json);
    const q = req.url.query || [];
    const qPage = q.find(x => x.key === 'page');
    const page = qPage ? Number(qPage.value) : undefined;

    if (!Array.isArray(data)) return;

    // Extrai um "id" chave por item (tente cobrir cenários comuns)
    const ids = Array.from(new Set(
      data.map(it =>
        it.id || it.Id || it.ID ||
        it.codProd || it.CODPROD || it.codprod ||
        it.codigo || it.CODIGO || it.sku || it.SKU
      ).filter(Boolean).map(String)
    ));

    const seenKey = `v3_seen_ids::getprices`;
    const seenRaw = pm.environment.get(seenKey) || '';
    const seen = new Set(seenRaw ? seenRaw.split(',') : []);

    const dups = ids.filter(id => seen.has(String(id)));
    pm.test('[PAG] Itens não se repetem entre páginas (até aqui)', () => {
      pm.expect(dups.length, `Repetidos entre páginas: ${dups.join(',')}`).to.eql(0);
    });

    // Atualiza conjunto visto
    const merged = new Set([...seen, ...ids]);
    pm.environment.set(seenKey, Array.from(merged).join(','));

    // Coerência com a query
    if (page !== undefined && json.page !== undefined) {
      pm.test('[PAG] "page" coerente entre query e resposta', () => {
        pm.expect(Number(json.page)).to.eql(Number(page));
      });
    }
  })();

  // =======================================================
  // C) INVARIANTES CROSS-ENDPOINTS
  // =======================================================
  // C.1) Parceiro: após /partner/save, o parceiro deve aparecer no /partner/list
  (function partnerSaveAppearsOnList() {
    if (!isJson || status < 200 || status >= 300) return;
    if (!url.includes('/partner/save')) return;

    // Tenta identificar um campo que possamos pesquisar (CNPJ/CPF ou nome)
    let body = {};
    try {
      if (req.body && req.body.mode === 'raw' && req.body.raw) body = JSON.parse(req.body.raw);
    } catch (_) {}

    const doc = (body.cgc_cpf || body.cnpj || body.CGC_CPF || '').toString().replace(/\D/g, '');
    const nome = body.nomeParc || body.razaoSocial || body.nome || '';

    pm.sendRequest({
      url: `${BASE}/partner/list?codVend=${CODVEND}`,
      method: 'GET',
      header: [
        AUTH ? { key: 'Authorization', value: AUTH } : null,
        { key: 'accessData', value: pm.environment.get('accessData') || pm.collectionVariables.get('accessData') || '' },
      ].filter(Boolean)
    }, (err, r) => {
      pm.test('[CROSS] /partner/save reflete em /partner/list', () => {
        pm.expect(err).to.eql(null);
        pm.expect(r.code).to.be.within(200, 299);
        try {
          const j = r.json();
          const arr = Array.isArray(j) ? j : getMainArray(j);
          const ok = arr.some(p => {
            const d = (p.CGC_CPF || p.cgc_cpf || '').toString().replace(/\D/g, '');
            const n = (p.NOMEPARC || p.nomeParc || p.NOME || p.nome || '').toString().toLowerCase();
            return (doc && d === doc) || (nome && n.includes(nome.toLowerCase()));
          });
          pm.expect(ok, 'Parceiro salvo não localizado em /partner/list').to.be.true;
        } catch (_) {
          pm.expect.fail('Resposta de /partner/list não é JSON válido');
        }
      });
    });
  })();

  // C.2) Pedido: após salvar anexo => /ppid/{nunota}/listAttachment deve aumentar
  (function orderAttachmentIncreasesList() {
    if (status < 200 || status >= 300) return;
    const m = rawUrl.match(/\/ppid\/(\d+)\/saveattachment/i);
    if (!m) return;
    const nunota = m[1];

    pm.sendRequest({
      url: `${BASE}/ppid/${nunota}/listAttachment?codVend=${CODVEND}`,
      method: 'GET',
      header: [
        AUTH ? { key: 'Authorization', value: AUTH } : null,
        { key: 'accessData', value: pm.environment.get('accessData') || pm.collectionVariables.get('accessData') || '' },
      ].filter(Boolean)
    }, (err, r) => {
      pm.test('[CROSS] Anexo refletiu em listAttachment', () => {
        pm.expect(err).to.eql(null);
        pm.expect(r.code).to.be.within(200, 299);
        try {
          const j = r.json();
          const arr = getMainArray(j);
          pm.expect(Array.isArray(arr) && arr.length > 0, 'Nenhum anexo listado após upload').to.be.true;
        } catch (_) {
          pm.expect.fail('Resposta de listAttachment não é JSON válido');
        }
      });
    });
  })();

  // C.3) Usuário: após changePhoto => /user/{id}/imagem deve retornar imagem válida
  (function userChangePhotoThenImage() {
    if (status < 200 || status >= 300) return;
    const m = rawUrl.match(/\/user\/(\d+)\/changephoto/i);
    if (!m) return;
    const uid = m[1];

    pm.sendRequest({
      url: `${BASE}/user/${uid}/imagem`,
      method: 'GET',
      header: [
        AUTH ? { key: 'Authorization', value: AUTH } : null,
        { key: 'accessData', value: pm.environment.get('accessData') || pm.collectionVariables.get('accessData') || '' },
      ].filter(Boolean)
    }, (err, r) => {
      pm.test('[CROSS] changePhoto refletiu em imagem', () => {
        pm.expect(err).to.eql(null);
        pm.expect(r.code).to.be.within(200, 299);
        const ct = (r.headers.get('Content-Type') || '').toLowerCase();
        pm.expect(ct).to.match(/image\/(png|jpe?g|webp)/);
        pm.expect(r.responseSize).to.be.above(512);
      });
    });
  })();

  // =======================================================
  // D) IDEMPOTÊNCIA E NEGATIVOS PADRONIZADOS EM MUTAÇÕES
  // =======================================================
  // D.1) confirmarPedido duas vezes não deve passar “em silêncio”
  (function doubleConfirmGuard() {
    if (!url.includes('/ppid/confirmarpedido') || status < 200 || status >= 300) return;

    // Reenvia a mesma requisição 1x para checar idempotência/erro controlado
    const cloneReq = {
     url: rawUrl,
     method: req.method,
     header: (req.headers && typeof req.headers.toJSON === 'function')
        ? req.headers.toJSON() : [],
     body: req.body ? { mode: req.body.mode, raw: req.body.raw } : undefined
    };

    pm.sendRequest(cloneReq, (err, r) => {
      pm.test('[IDEMP] confirmarPedido 2ª vez deve retornar erro controlado', () => {
        pm.expect(err).to.eql(null);
        const ok = r.code >= 400 || (function () {
          try { const j = r.json(); return j.hasError === true; } catch { return false; }
        })();
        pm.expect(ok, 'Confirmar 2x voltou sucesso — esperar erro controlado').to.be.true;
      });
    });
  })();

  // D.2) excluirItemPedido duas vezes => erro controlado
  (function doubleDeleteItem() {
    if (!url.includes('/ppid/excluiritempedido') || status < 200 || status >= 300) return;

    const cloneReq = {
     url: rawUrl,
     method: req.method,
     header: (req.headers && typeof req.headers.toJSON === 'function')
        ? req.headers.toJSON() : [],
     body: req.body ? { mode: req.body.mode, raw: req.body.raw } : undefined
};

    pm.sendRequest(cloneReq, (err, r) => {
      pm.test('[IDEMP] excluirItemPedido 2ª vez deve retornar erro controlado', () => {
        pm.expect(err).to.eql(null);
        const ok = r.code >= 400 || (function () {
          try { const j = r.json(); return j.hasError === true; } catch { return false; }
        })();
        pm.expect(ok, 'Excluir 2x voltou sucesso — esperar erro controlado').to.be.true;
      });
    });
  })();

  // =======================================================
  // E) NEGATIVOS ORQUESTRADOS PELO NOME DO REQUEST
  //     (crie clones com sufixos como [NEGATIVO][SEM AUTH], etc.)
  // =======================================================
  (function negativeConventions() {
    if (!isNegativeCase) return;

    // Sugestões de expectativas por sufixo no nome:
    if (requestName.includes('[sem auth]')) {
      pm.test('[NEG] Sem Authorization deve responder 401/403', () => {
        pm.expect([401, 403]).to.include(status);
      });
    }
    if (requestName.includes('[sem accessdata]')) {
      pm.test('[NEG] Sem accessData deve responder 401/403/400', () => {
        pm.expect([400, 401, 403]).to.include(status);
      });
    }
    if (requestName.includes('[id inexistente]') || requestName.includes('[inexistente]')) {
      pm.test('[NEG] Recurso inexistente => 404/400', () => {
        pm.expect([404, 400]).to.include(status);
      });
    }
    // Sempre que for erro, exige mensagem clara no JSON (se JSON)
    if (isJson && (status >= 400)) {
      pm.test('[NEG] Erro JSON tem mensagem', () => {
        const m = (json && (json.message || json.mensagem || json.error)) || null;
        pm.expect(!!m, 'Erro sem mensagem clara').to.be.true;
      });
    }
  })();

  // =======================================================
  // F) SEGURANÇA ADICIONAL (hardening leve)
  // =======================================================
  (function extraSecurity() {
    if (!isJson || !json) return;
    const asText = JSON.stringify(json).toLowerCase();

    pm.test('[SEC] Resposta não devolve segredo/senha/token em claro', () => {
      const banned = ['"password":', '"senha":', '"secret":', '"secreto":', '"auth":', '"token":'];
      const hit = banned.some(b => asText.includes(b));
      pm.expect(hit, 'Campos sensíveis não deveriam voltar em claro').to.be.false;
    });
  })();

})(); // fim do ADD-ON v3
