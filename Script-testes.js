// =======================================================
// BACKEND VIDYA FORCE - TESTES GLOBAIS DINÂMICOS (v3.4)
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
    if ((res.code >= 200 && res.code < 300) && !isJson && (u.includes('/viewpdf') || u.includes('/viewdanfe') || u.includes('/viewboleto'))) {
      pm.test('[BINARIO] Content-Type PDF', () => pm.expect(ct).to.include('application/pdf'));
      pm.test('[BINARIO] Tamanho > 1KB', () => pm.expect(res.responseSize).to.be.above(1024));
      pm.test('[BINARIO] Content-Disposition presente', () => {
        const cd = res.headers.get('Content-Disposition') || '';
        pm.expect(cd.length > 0, 'Content-Disposition ausente').to.be.true;
      });
    }

    // Imagens (produto/usuário)
    if ((res.code >= 200 && res.code < 300) && !isJson && u.includes('/imagem/')) {
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

    const vendor = CODVEND || 'default';
    const seenKey = `v3_seen_ids::getprices::${vendor}`;
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
  // Helper para clonar body (raw/urlencoded/form-data)
  function cloneBody(b) {
    if (!b) return undefined;
    if (b.mode === 'raw') return { mode: 'raw', raw: b.raw };
    if (b.mode === 'urlencoded') {
      try { return { mode: 'urlencoded', urlencoded: b.urlencoded.toJSON() }; } catch(e) { return { mode: 'urlencoded', urlencoded: b.urlencoded }; }
    }
    if (b.mode === 'formdata') {
      try { return { mode: 'formdata', formdata: b.formdata.toJSON() }; } catch(e) { return { mode: 'formdata', formdata: b.formdata }; }
    }
    return undefined;
  }

  // D.1) confirmarPedido duas vezes não deve passar “em silêncio”
  (function doubleConfirmGuard() {
    if (!url.includes('/ppid/confirmarpedido') || status < 200 || status >= 300) return;

    // Reenvia a mesma requisição 1x para checar idempotência/erro controlado
    const cloneReq = {
     url: rawUrl,
     method: req.method,
     header: (req.headers && typeof req.headers.toJSON === 'function')
        ? req.headers.toJSON() : [],
     body: cloneBody(req.body)
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
     body: cloneBody(req.body)
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
      const isAuthFlow = /\/login|\/newlogin|\/refresh|\/token/i.test(url);
      const bannedBase = ['"password":', '"senha":', '"secret":', '"secreto":'];
      const banned = isAuthFlow ? bannedBase : [...bannedBase, '"auth":', '"token":'];
      const hit = banned.some(b => asText.includes(b));
      pm.expect(hit, 'Campos sensíveis não deveriam voltar em claro').to.be.false;
    });
  })();


// =======================================================
// G) HEADER accessData obrigatório em rotas PPID
// =======================================================
(function requireAccessDataHeader(){
  if (!url.includes('/ppid/')) return;
  pm.test('[HEADERS] accessData presente em rotas PPID', () => {
    const has = pm.request.headers.has('accessData') && !!pm.request.headers.get('accessData');
    pm.expect(has, 'Header accessData ausente/vazio').to.be.true;
  });
})();

// Checks mínimos para mensagens e logística (seguros)
(function lightweightExtras(){
  if (isJson && url.includes('/ppid/message')) {
    const arr = getMainArray(json);
    pm.test('[MSG] Estrutura mínima de mensagens', () => {
      const ok = Array.isArray(arr);
      pm.expect(ok, 'Lista de mensagens deve ser array').to.be.true;
    });
  }
  if (isJson && url.includes('/ppid/solicitacoesentrega')) {
    const arr = getMainArray(json);
    pm.test('[LOG] Estrutura mínima de solicitações de entrega', () => {
      const ok = Array.isArray(arr);
      pm.expect(ok, 'Lista de solicitações deve ser array').to.be.true;
    });
  }
})();




// H) AUTH — JWT claims mínimos (apenas em fluxos de autenticação)
(function jwtClaims(){
  if (!(isJson && /\/login|\/newlogin|\/refresh|\/token/i.test(url))) return;
  const tok = (json && (json.token || json.accessToken || (json.data && json.data.token))) || '';
  if (!tok || tok.split('.').length < 2) return;
  function parseJwt(t){
    const p = t.split('.');
    const seg = (p[1]||'');
    if (!seg) return null;
    const b64 = seg.replace(/-/g,'+').replace(/_/g,'/').padEnd((seg.length + 3) & ~3, '=');
    try { return JSON.parse(atob(b64)); } catch(e){ return null; }
  }
  const claims = parseJwt(tok);
  pm.test('[AUTH] JWT possui exp >= 5min', () => {
    pm.expect(!!(claims && claims.exp), 'exp ausente').to.be.true;
    if (claims && claims.exp){
      const now = Math.floor(Date.now()/1000);
      pm.expect(claims.exp - now, 'exp muito próximo').to.be.above(300);
    }
  });
})();


// I) OBS — Correlation/Trace ID presente (qualquer resposta)
(function correlationId(){
  const corr = res.headers.get('X-Request-ID') || res.headers.get('X-Correlation-ID') || res.headers.get('traceparent');
  pm.test('[OBS] Correlation/Trace ID presente', () => pm.expect(!!corr).to.be.true);
})();


// J) RATE — Cabeçalhos de rate limit coerentes (opcional)
(function rateHeaders(){
  const lim = res.headers.get('RateLimit-Limit') || res.headers.get('X-RateLimit-Limit');
  const rem = res.headers.get('RateLimit-Remaining') || res.headers.get('X-RateLimit-Remaining');
  if (!lim && !rem) return; // só valida se existirem
  pm.test('[RATE] Remaining <= Limit', () => {
    pm.expect(Number(rem)).to.be.at.most(Number(lim));
  });
})();


// K) TIME — Timestamps em ISO 8601 (UTC) quando houver campos de data
(function isoUtc(){
  if (!isJson) return;
  const txt = JSON.stringify(json);
  const hasDateFields = /(\bdata\b|\bdate\b|\bdtemissao\b|\bcreated\b|\bupdated\b|\btimestamp\b)/i.test(txt);
  if (!hasDateFields) return;
  const iso = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/;
  pm.test('[TIME] Campos de data em ISO 8601 (UTC)', () => {
    pm.expect(iso.test(txt), 'Formato de data não está em ISO 8601 (UTC)').to.be.true;
  });
})();


// L) HTTP — Content-Type adequado para corpo JSON
(function jsonContentType(){
  const ct = (res.headers.get('Content-Type') || '').toLowerCase();
  let looksJson = false;
  try {
    const t = pm.response.text().trim();
    looksJson = (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
  } catch(_) {}
  if (looksJson && !ct.includes('application/json')) {
    pm.test('[HTTP] Content-Type deve ser application/json quando o corpo é JSON', () => {
      pm.expect(ct).to.include('application/json');
    });
  }
})();


// M) SEC — Flags de cookies (Secure/HttpOnly) quando o servidor define cookies
(function cookieFlags(){
  const setc = res.headers.get('Set-Cookie') || '';
  if (!setc) return;
  const lc = setc.toLowerCase();
  pm.test('[SEC] Cookies com Secure/HttpOnly', () => {
    pm.expect(lc.includes('secure')).to.be.true;
    pm.expect(lc.includes('httponly')).to.be.true;
  });
})();


// N) MONEY — Consistência: soma dos itens ≈ total (tolerância 0,05)
(function moneyConsistency(){
  if (!isJson) return;
  if (!(/\/ppid\/orderdetails|\/ppid\/pedido/i.test(url))) return;
  const itens = json && (json.itens || json.items || (Array.isArray(json.data) && json.data[0] && json.data[0].itens));
  if (!Array.isArray(itens) || !itens.length) return;
  const total = Number(json.total || json.valorTotal || json.totalLiquido || json.totalliquido || 0);
  if (!isFinite(total) || total <= 0) return;
  const sum = itens.reduce((acc, it) => {
    const sub = Number(it.subtotal || it.valor || it.total || (Number(it.preco || it.precoUnit || it.price) * Number(it.qtd || it.quantidade || it.qty || 1)) || 0);
    return acc + (isFinite(sub) ? sub : 0);
  }, 0);
  pm.test('[MONEY] Soma de itens ≈ total', () => {
    pm.expect(Math.abs(sum - total)).to.be.below(0.05);
  });
})();


// O) SCHEMA — Conjunto de chaves estável (robusto, com normalização e try/catch)
(function schemaStableKeys(){
  try {
    const res = pm.response;
    const req = pm.request;

    // Reaproveita helpers se existirem; caso contrário, auto-detecta
    let _isJson = (typeof isJson !== 'undefined') ? isJson : false;
    let _json = (typeof json !== 'undefined') ? json : null;

    if (!_isJson) {
        const ct = (res.headers.get('Content-Type') || '').toLowerCase();
        _isJson = ct.includes('json'); // simples e seguro
    }

    if (!_json && _isJson) {
      try { _json = res.json(); } catch(_e) { /* noop */ }
    }
    if (!_isJson || !_json || typeof _json !== 'object') return;

    // Normaliza path: usa segmentos do Postman, remove barra final, lower-case
    const segs = (req && req.url && Array.isArray(req.url.path) ? req.url.path : []).filter(Boolean).map(String);
    const pathKey = ('/' + segs.join('/')).replace(/\/+$/,'').toLowerCase(); // ex.: "/ppid/getprices"

    // Amostra de chaves (prioriza primeiro item do array)
    const pickSample = (j) => Array.isArray(j) ? j[0] : (Array.isArray(j.data) ? j.data[0] : j);
    const sample = pickSample(_json);
    if (!sample || typeof sample !== 'object') return;

    const toKeySet = (o) => Object.keys(o || {}).sort().join(',');
    const actual = toKeySet(sample);

    // Mapa de schemas explícitos por endpoint (ordenado para comparação)
    const SCHEMA_KEYS = {
      '/ppid/getprices': toKeySet({ codProd:1, codTab:1, nomeTab:1, nuTab:1, preco:1, precoFlex:1 }),
      // Adicione outros endpoints aqui, se quiser validação estrita
    };

    const expected = SCHEMA_KEYS[pathKey];

    if (expected) {
      // Validação estrita pelo mapa
      pm.test('[SCHEMA] Conjunto de chaves estável', function(){
        pm.expect(actual).to.eql(expected);
      });

      // Checagem de uniformidade de itens no array
      const arr = Array.isArray(_json?.data) ? _json.data : (Array.isArray(_json) ? _json : []);
      if (Array.isArray(arr) && arr.length) {
        const divergente = arr.find(it => toKeySet(it) !== expected);
        pm.test('[SCHEMA] Todos os itens seguem o mesmo conjunto de chaves', function(){
          pm.expect(divergente, 'Itens divergentes no conjunto de chaves').to.be.undefined;
        });
      }
      return; // Já validado por mapa
    }

    // Baseline por endpoint (robusto) — ignora baselines antigos gravados como 'erro'
    const baseKey = `v3_schema::${req.method}::${pathKey}`;
    const prevRaw = pm.collectionVariables.get(baseKey);
    const prev = (typeof prevRaw === 'string' && prevRaw.toLowerCase() === 'erro') ? null : prevRaw;

    if (prev) {
      pm.test('[SCHEMA] Conjunto de chaves estável (baseline)', function(){
        pm.expect(actual).to.eql(prev);
      });
    } else {
      pm.collectionVariables.set(baseKey, actual);
      pm.test('[SCHEMA] Baseline inicial registrada', function(){
        pm.expect(true).to.be.true;
      });
    }
  } catch(err) {
    // Não derruba o runner por erro de script; registra de forma controlada
    pm.test('[SCHEMA] Erro de script (tratado)', function(){
      pm.expect.fail(String(err && err.message || err));
    });
  }
})();

// P) CACHE — Presença de ETag/Last-Modified em GET 2xx (revalidação opcional)
(function cacheHeaders(){
  if (!(status >= 200 && status < 300)) return;
  if (req.method !== 'GET') return;
  const etag = res.headers.get('ETag');
  const lm   = res.headers.get('Last-Modified');
  pm.test('[CACHE] ETag ou Last-Modified presente em GET', () => {
    pm.expect(!!etag || !!lm).to.be.true;
  });
})();


// Q) SLA — Coleta tempos para percentis (p95/p99) em request de relatório
(function slaCollect(){
  const k='v3_metrics::times';
  try {
    const arr = JSON.parse(pm.collectionVariables.get(k) || '[]');
    arr.push(pm.response.responseTime);
    pm.collectionVariables.set(k, JSON.stringify(arr.slice(-1000)));
  } catch(_) { /* ignorar */ }
})();


// R) PAGE — Sanidade de pageSize e retorno array em endpoints paginados
(function paginationBoundaries(){
  if (!(isJson && /\/getprices|\/gettableprices|\/orderlist|\/partner\/list/i.test(url))) return;
  const qp = req.url.query ? req.url.query.toObject() : {};
  const size = Number(qp.pageSize || qp.take || qp.limit || 0);
  if (size) {
    pm.test('[PAGE] pageSize dentro do intervalo 1..200', () => pm.expect(size).to.be.within(1,200));
  }
  const arr = getMainArray(json);
  pm.test('[PAGE] Retorno é array em endpoints paginados', () => pm.expect(Array.isArray(arr)).to.be.true);
})();


// S) UPLOAD — Nome de arquivo seguro após upload (quando o backend ecoa filename)
(function uploadFilenameSafety(){
  if (!(isJson && /\/saveattachment/i.test(url))) return;
  const name = (json && (json.fileName || json.filename || (json.data && json.data.fileName)));
  if (!name) return;
  pm.test('[UPLOAD] Nome de arquivo sem path traversal', () => {
    pm.expect(name).to.not.match(/[\\/]/);
    pm.expect(name).to.not.include('..');
    pm.expect(String(name).length).to.be.within(1, 255);
  });
})();

})(); // fim do ADD-ON v3


// =====================================================
//  Vidya Force — Collection ▸ Tests  (Patch V3.2.1)
//  Incrementos sobre v2+v3: reset-once + testes estáveis
//  Observação: não remove asserts existentes do v2/v3.
// =====================================================

// ===============================
// [V3.2.1] Bootstrap — reset-once por rodada
// Limpa resíduos que reduzem a contagem de testes entre runs,
// sem apagar credenciais/baseUrl. Executa apenas uma vez no run.
// ===============================
(function v311_bootstrap(){
  try {
    if (pm.collectionVariables.get('v311_bootstrap_done')) return;

    // Gera run_id único para dados idempotentes
    var runId = Date.now().toString(36) + '-' + (Math.random().toString(36).slice(2,8));
    pm.collectionVariables.set('run_id', runId);

    // Limpa prefixes de variáveis de teste (mas preserva credenciais e config)
    var scopes = [pm.collectionVariables, pm.environment, pm.globals];
    var patterns = [
      /^skip_/i,
      /^v3_/i,                // v3_seen_ids::..., v3_seen_pages::..., v3_* caches auxiliares
      /^seen_/i,
      /^idempotency_/i,
      /^page(_|-)?state/i,
      /^run_/i,
      /^tmp_/i,
      /^last_/i
    ];

    scopes.forEach(function(scope){
      var obj = {};
      try { obj = scope && scope.toObject ? (scope.toObject() || {}) : {}; } catch(e){}
      Object.keys(obj).forEach(function(k){
        if (patterns.some(function(rx){ return rx.test(k); })) {
          try { scope.unset(k); } catch(e){}
        }
      });
    });

    pm.collectionVariables.set('v311_bootstrap_done', '1');
    console.info('[V3.1.1] bootstrap: limpeza leve aplicada; run_id=', runId);
  } catch(e) { /* silencioso */ }
})();

// ===============================
// [V3.2.1] Binários — testes sempre-registrados (aplicam só quando 2xx não-JSON)
// Mantém contagem estável de testes entre runs.
// ===============================
(function v311_stableBinary(){
  try {
    var code = pm.response.code || 0;
    var is2xx = code >= 200 && code < 300;
    var ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();
    var isJson = ct.includes('application/json');

    // Helper de tamanho robusto
    function bodySize(){
      try { var s = pm.response.size && pm.response.size(); if (s && typeof s.body === 'number') return s.body; } catch(_){}
      return (typeof pm.response.responseSize === 'number') ? pm.response.responseSize : 0;
    }

    pm.test('[BIN] PDF válido (assinatura %PDF- + tamanho)', function(){
      var ok = is2xx && !isJson && ct.includes('application/pdf');
      if (!ok) return pm.expect(true, 'N/A').to.be.true;
      var head = '';
      try { head = (pm.response.text() || '').slice(0,5); } catch(_){}
      pm.expect(head.startsWith('%PDF-'), 'PDF sem assinatura %PDF-').to.be.true;
      pm.expect(bodySize(), 'PDF muito pequeno').to.be.above(1024);
    });

    pm.test('[BIN] Imagem com MIME e tamanho mínimo', function(){
      var ok = is2xx && !isJson && /image\/(png|jpe?g|webp)/.test(ct);
      if (!ok) return pm.expect(true, 'N/A').to.be.true;
      pm.expect(bodySize(), 'Imagem muito pequena').to.be.above(512);
    });
  } catch(e) { /* silencioso */ }
})();

// ===============================
// [V3.2.1] Paginação — teste sempre existe; aplica quando há page na query/JSON
// ===============================
(function v311_stablePagination(){
  try {
    var url = pm.request.url.toString();
    var qMatch = url.match(/(?:\?|&)page=(\d+)/i);
    var ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();
    pm.test('[PAG] Coerência query.page vs body.page (quando disponível)', function(){
      if (!qMatch || !ct.includes('application/json')) {
        return pm.expect(true, 'N/A').to.be.true;
      }
      var qPage = Number(qMatch[1]);
      var j = pm.response.json();
      var bodyPage = (j && (j.page !== undefined ? j.page : j.pagina));
      if (bodyPage !== undefined) pm.expect(Number(bodyPage)).to.eql(Number(qPage));
      else pm.expect(true, 'Body.page ausente (tolerado)').to.be.true;
    });
  } catch(e) { /* silencioso */ }
})();

// ===============================
// [V3.2.1] Headers por domínio — /ppid/ exige accessData
// ===============================
(function v311_domainHeaders(){
  try {
    var u = pm.request.url.toString().toLowerCase();
    pm.test('[HEADERS] /ppid/ exige accessData não-vazio', function(){
      if (u.indexOf('/ppid/') === -1) return pm.expect(true, 'N/A').to.be.true;
      var hv = pm.request.headers.get('accessData');
      pm.expect(!!hv, 'accessData ausente/vazio').to.be.true;
    });
  } catch(e) { /* silencioso */ }
})();

// ===============================
// [V3.2.1] SLA leve — operações críticas
// ===============================
(function v311_sla(){
  try {
    var url = pm.request.url.toString();
    var crit = [/\/ppid\/.+\/view(pdf|danfe|boleto)/i, /\/partner\/save/i];
    pm.test('[SLA] Operação crítica < 3000ms (se aplicável)', function(){
      if (!crit.some(function(r){ return r.test(url); })) return pm.expect(true, 'N/A').to.be.true;
      var t = pm.response.responseTime;
      pm.expect(t, 'SLA alto: ' + t + 'ms').to.be.below(3000);
    });
  } catch(e) { /* silencioso */ }
})();

// ===============================
// [V3.2.1] Negativos — guarda genérica, sempre registrada
// ===============================
(function v311_negativesGuard(){
  try {
    var name = (pm.info.requestName || '').toLowerCase();
    var isNeg = /\[(negativo|4xx|5xx|sem auth|sem accessdata|id inexistente|page out of range)\]/i.test(name);
    pm.test('[NEG] Respostas negativas retornam 4xx (se marcado por sufixo)', function(){
      if (!isNeg) return pm.expect(true, 'N/A').to.be.true;
      pm.expect(pm.response.code, 'Era esperado 4xx').to.be.within(400, 499);
    });

    var ct = (pm.response.headers.get('Content-Type') || '').toLowerCase();
    pm.test('[NEG] Erro JSON possui mensagem (se aplicável)', function(){
      if (!isNeg || !ct.includes('application/json')) return pm.expect(true, 'N/A').to.be.true;
      var j = pm.response.json();
      var m = j && (j.message || j.mensagem || j.error || j.errors);
      pm.expect(!!m, 'Erro sem mensagem clara').to.be.true;
    });
  } catch(e) { /* silencioso */ }
})();

// ===============================
// [V3.2.1] Notas
// - Estes blocos são incrementais. Se a suíte já tinha testes equivalentes,
//   a contagem permanecerá estável porque os guards produzem "N/A" ao invés de não registrar testes.
// - O bootstrap não remove credenciais/config (baseUrl, username, password, accessData).
// - Para máxima previsibilidade, execute sempre um request "00 – [RESET]" no início do Runner.
// ===============================

