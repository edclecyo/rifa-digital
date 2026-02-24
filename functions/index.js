/* ===============================
   🔧 INICIALIZAÇÃO
================================ */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { CloudTasksClient } = require('@google-cloud/tasks');
const { exigirKycNivel } = require("./financeiro/kyc");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { PassThrough } = require("stream");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const tasksClient = new CloudTasksClient();
// ===============================
// CONFIG MERCADO PAGO (TESTE)
// ===============================
const MP_ACCESS_TOKEN = "TEST-1979013561468328-120609-46c9306edddb678d5f2863a7ae8ccb79-114139372"; 
/* ===============================
   CONFIGURAÇÕES
================================ */
const SUPER_ADMIN_UID = "s7wrbiuWf0NQQOE82BFOnnWAW5n2";

/* ===============================
   CONFIGURAÇÕES DE RIFA
================================ */

const VALOR_CARTELA = 2.5;

const PERCENTUAL_PREMIO = 0.8;
const PERCENTUAL_DESPESAS = 0.1;
const PERCENTUAL_INDICACAO = 0.1;

const NUM_VENDA_SHARDS = 20;
const NUM_FINANCEIRO_SHARDS = 20;

const LIMITE_BATCH = 400;
const MAX_CARTELAS_RODADA = 12500;
const SECRET_SEED = "GLOBAL_RIFA_SECRET";

const MINI_PREMIOS = [
  { vendas: 200, premio: 50 },
  { vendas: 300, premio: 100 },
  { vendas: 500, premio: 250 },
  { vendas: 1000, premio: 500 },
];

const VENDAS_PREMIO_MAXIMO = 12500;
const PREMIO_MAXIMO = 5000;

/* ===============================
   exigirAdmin
================================ */
function exigirAdmin(context) {
  if (!context.auth || context.auth.uid !== SUPER_ADMIN_UID) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Acesso restrito ao admin'
    );
  }
}
/* ===============================
   adminForcarRollback (PRODUÇÃO)
================================ */
exports.adminForcarRollback = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {

    exigirAdmin(context);

    const { pedidoId, motivo } = data;

    if (!pedidoId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "pedidoId obrigatório"
      );
    }

    if (!motivo || typeof motivo !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Motivo obrigatório"
      );
    }

    const pedidoRef = db.collection("Pedidos").doc(pedidoId);

    const snap = await pedidoRef.get();

    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found");
    }

    const pedido = snap.data();

    /* ===============================
       🔒 Impede rollback inválido
    =============================== */

    if (pedido.rollbackExecutado) {
      return { success: true, jaExecutado: true };
    }

    if (pedido.status !== "CONCLUIDO" &&
        pedido.status !== "PROCESSANDO") {

      throw new functions.https.HttpsError(
        "failed-precondition",
        "Pedido não está em estado válido para rollback"
      );
    }

    /* ===============================
       EXECUTA ROLLBACK SEGURO
    =============================== */

    await rollbackPedidoFinanceiro({
      uid: pedido.uid,
      pedidoId,
      motivo: `Admin: ${motivo}`,
    });

    /* ===============================
       LOG ADMIN (AUDITORIA)
    =============================== */

    await db.collection("LogsAdmin").add({
      acao: "FORCAR_ROLLBACK",
      pedidoId,
      adminUid: context.auth.uid,
      motivo,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };

  });
/* ===============================
  criarSuperAdmin
================================ */
exports.criarSuperAdmin = functions
  .region('southamerica-east1')
  .https.onCall(async (_, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Usuário não autenticado'
      );
    }

    const uid = context.auth.uid;
    const email = context.auth.token.email;

    const bootstrapRef = db
      .collection('BootstrapSuperAdmin')
      .doc('config');

    const userRef = db
      .collection('UsuariosPrivado')
      .doc(uid);

    await db.runTransaction(async (tx) => {

      const bootstrapSnap = await tx.get(bootstrapRef);

      if (!bootstrapSnap.exists) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Documento bootstrap não encontrado'
        );
      }

      const bootstrap = bootstrapSnap.data();

      if (bootstrap.email !== email) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Usuário não autorizado para bootstrap'
        );
      }

      // 🔐 Promove usuário no Firestore
      tx.set(
        userRef,
        {
          email,
          role: 'superAdmin',
          isAdmin: true,
          adminCriadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 🔒 Fecha bootstrap
      tx.update(bootstrapRef, {
        ativo: false,
        email,
        uid,
        fechadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // ⭐ PARTE QUE FALTAVA
    await admin.auth().setCustomUserClaims(uid, { admin: true });

    return {
      ok: true,
      message: 'Super Admin criado com sucesso',
    };
  });
/* ===============================
  registrarLogin
================================ */
exports.registrarLogin = functions
  .region("southamerica-east1")
  .runWith({ timeoutSeconds: 10 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Usuário não autenticado"
      );
    }

    const uid = context.auth.uid;
    const deviceId = String(data?.deviceId || "").trim();
    const platform = String(data?.platform || "unknown");

    // 🔐 validação HARD
    if (!deviceId) {
      console.warn("⚠️ registrarLogin sem deviceId", { uid });
      return { ok: false, ignored: true };
    }

    const userPrivRef = db.collection("UsuariosPrivado").doc(uid);
    const deviceRef = userPrivRef.collection("Dispositivos").doc(deviceId);
    const auditoriaRef = db.collection("AuditoriaLogin").doc();

    // 🔎 conta dispositivos (fora da transaction, OK)
    const devicesSnap = await userPrivRef
      .collection("Dispositivos")
      .get();

    const totalDevices = devicesSnap.size;
    const deviceJaExiste = devicesSnap.docs.some(d => d.id === deviceId);

    // ⛔ regra antifraude ANTES da transaction
    if (!deviceJaExiste && totalDevices >= 3) {
      await userPrivRef.set({
        bloqueado: true,
        motivoBloqueio: "Múltiplos dispositivos",
        bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      throw new functions.https.HttpsError(
        "permission-denied",
        "Conta bloqueada por segurança"
      );
    }

    // 🔒 transaction SOMENTE para escrita
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userPrivRef);

      if (!userSnap.exists) {
        tx.set(userPrivRef, {
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          bloqueado: false,
          scoreAntifraude: 0,
        });
      }

      const deviceSnap = await tx.get(deviceRef);

      if (!deviceSnap.exists) {
        tx.set(deviceRef, {
          platform,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          ultimoLogin: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(deviceRef, {
          ultimoLogin: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      tx.set(auditoriaRef, {
        uid,
        deviceId,
        platform,
        totalDevices,
        tipo: "login",
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        ip: context.rawRequest?.ip || null,
      });
    });

    return { ok: true };
  });
 function gerarSeed(input) {
  return crypto
    .createHash("sha256")
    .update(input + SECRET_SEED)
    .digest("hex");
}

function gerarNumeros(seed) {
  let numeros = [];

  let hash = parseInt(seed.substring(0, 8), 16);

  while (numeros.length < NUMEROS_POR_CARTELA) {
    hash = (hash * 9301 + 49297) % 233280;

    const n = (hash % 60) + 1;

    if (!numeros.includes(n)) numeros.push(n);
  }

  return numeros;
}
function escolherShard(key) {
  const hash = crypto
    .createHash("sha256")
    .update(key + Date.now())
    .digest("hex");

  return parseInt(hash.substring(0, 8), 16) % NUM_SHARDS;
}
 exports.girarRoletaClound = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated");
    }

    const db = admin.firestore();
    const ref = db.collection("sistema").doc("financeiro");

    let premioIndex = 0;

    await db.runTransaction(async (transaction) => {

      const snap = await transaction.get(ref);
      let dados = snap.exists ? snap.data() : null;

      // 🔥 AUTO CRIA SE NÃO EXISTIR
      if (!dados) {
        dados = {
          blocoAtual: 1,
          cartelasBloco: 0,
          caixaPremio: 10000,
          cartelasGratisHoje: 0,
          vendasHoje: 0,
          dataControle: new Date().toISOString().slice(0, 10)
        };
        transaction.set(ref, dados);
      }

      const hoje = new Date().toISOString().slice(0, 10);

      let {
        blocoAtual = 1,
        cartelasBloco = 0,
        caixaPremio = 0,
        cartelasGratisHoje = 0,
        vendasHoje = 0,
        dataControle = hoje
      } = dados;

      // 🔄 RESET DIÁRIO AUTOMÁTICO
      if (dataControle !== hoje) {
        cartelasGratisHoje = 0;
        vendasHoje = 0;
        transaction.update(ref, {
          cartelasGratisHoje: 0,
          vendasHoje: 0,
          dataControle: hoje
        });
      }

      const blocos = {
        1: { meta: 200, premio: 50 },
        2: { meta: 300, premio: 100 },
        3: { meta: 500, premio: 250 },
        4: { meta: 1000, premio: 500 },
        5: { meta: 12000, premio: 5000 },
      };

      const bloco = blocos[blocoAtual];
      if (!bloco) return;

      // 🔒 ANTES DA META → SEMPRE NADA
      if (cartelasBloco < bloco.meta) {
        const indicesNada = [0, 2];
        premioIndex = indicesNada[Math.floor(Math.random() * indicesNada.length)];
        return;
      }

      // 🎯 TRAVA DE CAIXA INTELIGENTE
      const fatorCaixa = caixaPremio / bloco.premio;

      let probNada = 0.90;
      let probCartela = 0.08;
      let probDinheiro = 0.02;

      if (fatorCaixa < 1) {
        probNada = 0.97;
        probCartela = 0.03;
        probDinheiro = 0.00;
      } else if (fatorCaixa < 3) {
        probNada = 0.93;
        probCartela = 0.06;
        probDinheiro = 0.01;
      } else if (fatorCaixa > 5) {
        probNada = 0.85;
        probCartela = 0.10;
        probDinheiro = 0.05;
      }

      // 🎯 LIMITE DINÂMICO DE CARTELAS POR FLUXO
      let limiteCartelas = 10;

      if (vendasHoje < 100) {
        limiteCartelas = 3;
      } else if (vendasHoje < 300) {
        limiteCartelas = 6;
      }

      const chance = Math.random();

      if (chance < probNada) {

        const indicesNada = [0, 2];
        premioIndex = indicesNada[Math.floor(Math.random() * indicesNada.length)];

      } else if (chance < probNada + probCartela) {

        // 🔒 VERIFICA LIMITE DIÁRIO
        if (cartelasGratisHoje >= limiteCartelas) {

          const indicesNada = [0, 2];
          premioIndex = indicesNada[Math.floor(Math.random() * indicesNada.length)];

        } else {

          const indicesCartela = [1, 3, 5];
          premioIndex = indicesCartela[Math.floor(Math.random() * indicesCartela.length)];

          transaction.update(ref, {
            cartelasGratisHoje: cartelasGratisHoje + 1
          });

        }

      } else {

        // 💸 DINHEIRO (R$0,25)
        if (caixaPremio >= 0.25) {
          premioIndex = 4;

          transaction.update(ref, {
            caixaPremio: caixaPremio - 0.25
          });
        } else {
          const indicesNada = [0, 2];
          premioIndex = indicesNada[Math.floor(Math.random() * indicesNada.length)];
        }

      }

    });

    return { premioIndex };

  });
async function adquirirLock(nome, ttlMs = 30000) {

  const ref = db.collection("Locks").doc(nome);

  const now = Date.now();

  await db.runTransaction(async tx => {

    const snap = await tx.get(ref);

    if (snap.exists) {

      const data = snap.data();

      if (data.ativo &&
          data.expiraEm?.toMillis() > now) {
        throw new Error("LOCKED");
      }
    }

    tx.set(ref,{
      ativo:true,
      expiraEm: admin.firestore.Timestamp.fromMillis(
        now + ttlMs
      ),
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

  });

  return ref;
}

exports.criarCartelasAutomatico = functions
.region("southamerica-east1")
.https.onCall(async (_, context) => {

  if (!context.auth ||
     (context.auth.uid !== SUPER_ADMIN_UID &&
      !context.auth.token.admin)) {

    throw new functions.https.HttpsError(
      "permission-denied",
      "Acesso restrito"
    );
  }

  const lockRef = await adquirirLock("criarCartelas");

  try {

    const statusRef = db.collection("StatusSorteio").doc("geral");
    const statusSnap = await statusRef.get();
    const status = statusSnap.exists ? statusSnap.data() : {};

    const rodadaAtual = status.rodada || 1;
    const vendidas = status.cartelasVendidas || 0;

    if (vendidas >= MAX_CARTELAS_RODADA) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Rodada finalizada"
      );
    }

    const cartelasRef = db.collection("Cartelas");

    const existentesSnap = await cartelasRef
      .where("rodada","==",rodadaAtual)
      .select() // reduz payload
      .get();

    const existentes = new Set(
      existentesSnap.docs.map(d => d.id)
    );

    let batch = db.batch();
    let count = 0;
    let sequencial = existentes.size;

    const LIMITE_CRIACAO = 1500;
    const LIMITE_BATCH = 450; // margem segura abaixo de 500

    for (let i = 0; i < LIMITE_CRIACAO; i++) {

      sequencial++;

      const codigo =
        "codigo-" +
        sequencial.toString().padStart(5,"0");

      if (existentes.has(codigo)) continue;

      const numeros = new Set();
      while(numeros.size < 6){
        numeros.add(Math.floor(Math.random()*60)+1);
      }

      batch.set(cartelasRef.doc(codigo),{
        codigo,
        numeros:[...numeros],
        rodada: rodadaAtual,
        status:"disponivel",
        criadaEm: admin.firestore.FieldValue.serverTimestamp()
      });

      count++;

      if (count % LIMITE_BATCH === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    if (count % LIMITE_BATCH !== 0) {
      await batch.commit();
    }

    return { success:true, criadas:count };

  } catch (error) {

    console.error("CRIAR CARTELAS ERROR:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      error.message || "Erro interno"
    );

  } finally {

    await lockRef.set({
      ativo:false,
      finalizadoEm: admin.firestore.FieldValue.serverTimestamp()
    }, { merge:true });

  }

});
exports.checarPremios = functions
  .region("southamerica-east1")
  .https.onCall(async (_, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    const lockRef = await adquirirLock("checarPremios");

    try {

      const statusRef = db.collection("StatusSorteio").doc("geral");
      const statusSnap = await statusRef.get();
      const status = statusSnap.exists ? statusSnap.data() : {};

      const rodadaAtual = status.rodada || 1;
      const ultimaMetaProcessada = status.ultimaMetaProcessada || 0;
      const totalVendidas = status.cartelasVendidas || 0;

      const premiosParaDistribuir = [];

      // 🔹 Mini prêmios proporcionais
      for (const regra of REGRAS_PREMIOS) {

        const qtdPremios = Math.floor(totalVendidas / regra.limite);
        const qtdPrev = Math.floor(ultimaMetaProcessada / regra.limite);
        const vezes = qtdPremios - qtdPrev;

        for (let i = 0; i < vezes; i++) {
          premiosParaDistribuir.push({
            tipo: "mini",
            valor: regra.valor
          });
        }
      }

      // 🔹 Grande prêmio
      const grandePremioRef =
        db.collection("Rodadas").doc(`${rodadaAtual}_grandePremio`);

      const grandePremioSnap = await grandePremioRef.get();

      if (
        totalVendidas >= GRANDE_PREMIO.cartelas &&
        !grandePremioSnap.exists
      ) {
        premiosParaDistribuir.push({
          tipo: "grande",
          valor: GRANDE_PREMIO.valor
        });

        await grandePremioRef.set({
          entregue: true,
          criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // 🔹 Atualiza meta processada
      await statusRef.set({
        ultimaMetaProcessada: totalVendidas
      }, { merge: true });

      if (premiosParaDistribuir.length === 0) {
        return {
          success: true,
          rodada: rodadaAtual,
          premiosDistribuidos: []
        };
      }

      const BATCH_LIMIT = 450;
      let batch = db.batch();
      let opCount = 0;

      // 🎯 FUNÇÃO DE SORTEIO ESCALÁVEL
      async function sortearUid() {

        if (totalVendidas === 0) return null;

        const numeroSorteado =
          Math.floor(Math.random() * totalVendidas) + 1;

        const snap = await db.collection("Cartelas")
          .where("rodada", "==", rodadaAtual)
          .where("status", "==", "vendido")
          .where("numeroSequencial", "==", numeroSorteado)
          .limit(1)
          .get();

        if (snap.empty) return null;

        return snap.docs[0].data().uid;
      }

      // 🔹 Distribuição real
      for (const premio of premiosParaDistribuir) {

        const uidVencedor = await sortearUid();
        if (!uidVencedor) continue;

        const userRef =
          db.collection("UsuariosPrivado").doc(uidVencedor);

        batch.update(userRef, {
          premios: admin.firestore.FieldValue.increment(premio.valor)
        });

        const historicoRef =
          userRef.collection("HistoricoPremios").doc();

        batch.set(historicoRef, {
          rodada: rodadaAtual,
          tipo: premio.tipo,
          valor: premio.valor,
          criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        opCount += 2;

        if (opCount >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      return {
        success: true,
        rodada: rodadaAtual,
        premiosDistribuidos: premiosParaDistribuir
      };

    } catch (error) {

      console.error("Erro em checarPremios:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao checar prêmios"
      );

    } finally {

      await lockRef.set({
        ativo: false,
        finalizadoEm: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    }

  });
async function sortearVencedor(rodadaAtual, totalVendidas) {

  if (totalVendidas === 0) return null;

  const numeroSorteado =
    Math.floor(Math.random() * totalVendidas) + 1;

  const snap = await db.collection("Cartelas")
    .where("rodada", "==", rodadaAtual)
    .where("status", "==", "vendido")
    .where("numeroSequencial", "==", numeroSorteado)
    .limit(1)
    .get();

  if (snap.empty) return null;

  return snap.docs[0].data().uid;
}
/* ===============================
  adminAjustarSaldo (BLINDADO)
================================ */
exports.adminAjustarSaldo = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    exigirAdmin(context);

    const { uid, valor, motivo } = data;

    if (!uid || typeof uid !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'UID inválido'
      );
    }

    if (typeof valor !== 'number' || isNaN(valor) || valor === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Valor inválido'
      );
    }

    if (!motivo || motivo.length < 3) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Motivo obrigatório'
      );
    }

    const userRef = db.collection('UsuariosPrivado').doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);

      if (!userSnap.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Usuário não encontrado'
        );
      }

      tx.update(userRef, {
        saldo: admin.firestore.FieldValue.increment(valor),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(userRef.collection('LedgerFinanceiro').doc(), {
        tipo: 'ajuste_admin',
        valor,
        motivo,
        adminUid: context.auth.uid,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log global para auditoria
      tx.set(db.collection('AdminLogs').doc(), {
        acao: 'adminAjustarSaldo',
        alvoUid: uid,
        valor,
        motivo,
        adminUid: context.auth.uid,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  });
/* ===============================
  adminBloquearUsuario (BLINDADO)
================================ */
exports.adminBloquearUsuario = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    exigirAdmin(context);

    const { uid, bloqueado } = data;

    if (!uid || typeof uid !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'UID inválido'
      );
    }

    if (typeof bloqueado !== 'boolean') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Parâmetro bloqueado deve ser boolean'
      );
    }

    const userRef = db.collection('UsuariosPrivado').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Usuário não encontrado'
      );
    }

    await userRef.set(
      {
        bloqueado,
        bloqueadoEm: bloqueado
          ? admin.firestore.FieldValue.serverTimestamp()
          : null,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection('AdminLogs').add({
      acao: 'adminBloquearUsuario',
      alvoUid: uid,
      bloqueado,
      adminUid: context.auth.uid,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  });
/*
==================================================
workerProcessarCompra (CASINO ULTRA HARDENED)
==================================================
*/
exports.workerProcessarCompra = functions
.region("southamerica-east1")
.runWith({
  memory: "1GB",
  timeoutSeconds: 120
})
.https.onRequest(async (req, res) => {

  /*
  ==================================================
  RESPONSE SAFE GUARD
  ==================================================
  */

  const safeResponse = (obj) => {
    if (!res.headersSent)
      res.status(200).send(obj);
  };

  try {

    if (req.method !== "POST")
      return safeResponse({ success:false });

    const payload =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      uid,
      cartelas,
      compraId,
      purchaseToken
    } = payload;

    /*
    ==================================================
    HARD VALIDATION
    ==================================================
    */

    if (
      !uid ||
      !compraId ||
      !Array.isArray(cartelas)
    ) return safeResponse({ success:false });

    if (cartelas.length === 0 || cartelas.length > 50)
      return safeResponse({ success:false });

    /*
    ==================================================
    DISTRIBUTED LOCK (Nuclear Level)
    ==================================================
    */

    const lockRef =
      db.collection("Locks").doc(`worker_${compraId}`);

    const lockSnap = await lockRef.get();

    if (lockSnap.exists)
      return safeResponse({ success:true });

    await lockRef.set({
      ativo:true,
      createdAt:admin.firestore.FieldValue.serverTimestamp()
    });

    /*
    ==================================================
    IDEMPOTENCY TOKEN ENGINE
    ==================================================
    */

    let tokenRef = null;

    if (purchaseToken) {

      tokenRef =
        db.collection("PurchaseTokens").doc(purchaseToken);

      const tokenSnap = await tokenRef.get();

      if (tokenSnap.exists) {

        const tokenData = tokenSnap.data();

        if (tokenData.status === "SUCCESS")
          return safeResponse({ success:true });

        if (tokenData.status === "PROCESSING")
          return safeResponse({ success:true });
      }

      await tokenRef.set({
        status:"PROCESSING",
        uid,
        compraId,
        createdAt:admin.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }

    /*
    ==================================================
    FSM ORDER LOAD
    ==================================================
    */

    const pedidoRef =
      db.collection("pedidos").doc(compraId);

    const pedidoSnap = await pedidoRef.get();

    if (!pedidoSnap.exists)
      throw new Error("Pedido inexistente");

    const pedido = pedidoSnap.data();

    if (pedido.status === "pago")
      return safeResponse({ success:true });

    /*
    ==================================================
    TRANSACTION EXECUTION SAFE
    ==================================================
    */

    let vendidas = 0;

    await db.runTransaction(async (tx)=>{

      for (const id of cartelas.slice(0,50)) {

        const cRef =
          db.collection("cartelas").doc(String(id));

        const snap = await tx.get(cRef);

        if (!snap.exists) continue;

        const data = snap.data();

        if (data.status !== "disponivel") continue;

        tx.update(cRef,{
          status:"vendida",
          owner:uid,
          vendidaEm:admin.firestore.FieldValue.serverTimestamp(),
          compraId
        });

        vendidas++;
      }

      if (vendidas === 0)
        throw new Error("NO_VALID_CARTELA");

      tx.update(pedidoRef,{
        status:"pago",
        cartelasProcessadas:vendidas,
        processadoEm:admin.firestore.FieldValue.serverTimestamp()
      });

    }, { maxAttempts: 3 });

    /*
    ==================================================
    TOKEN FINALIZE
    ==================================================
    */

    if (tokenRef) {
      await tokenRef.set({
        status:"SUCCESS",
        finalizadoEm:admin.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }

    safeResponse({ success:true });

  } catch (err) {

    console.error("WORKER CASINO ERROR", {
      message:err.message,
      stack:err.stack
    });

    safeResponse({
      success:false,
      error:"worker_internal_safe"
    });

  } finally {

    try {
      const { compraId } = req.body || {};
      if (compraId) {
        await db.collection("Locks")
        .doc(`worker_${compraId}`)
        .delete()
        .catch(()=>{});
      }
    } catch(e){}
  }

});
exports.criarRodada = functions.https.onCall(async () => {

  const rodadaRef = db.collection("Rodadas").doc();

  await rodadaRef.set({
    status: "ativa",
    totalVendas: 0,
    totalArrecadado: 0,
    fundoPremio: 0,
    fundoDespesas: 0,
    fundoIndicacao: 0,
    premioLiberado: false,
    valorPremioAtual: 0,
    tipoPremio: null,
    sorteioProcessando: false,
    startedAt: admin.firestore.Timestamp.now(),
  });

  const batch = db.batch();

  for (let i = 0; i < NUM_VENDA_SHARDS; i++) {
    batch.set(
      rodadaRef.collection("VendaShards").doc(i.toString()),
      { count: 0 }
    );
  }

  for (let i = 0; i < NUM_FINANCEIRO_SHARDS; i++) {
    batch.set(
      rodadaRef.collection("FinanceiroShards").doc(i.toString()),
      {
        arrecadado: 0,
        premio: 0,
        despesas: 0,
        indicacao: 0,
      }
    );
  }

  await batch.commit();

  return { rodadaId: rodadaRef.id };
});

exports.criarCartelasCompra = functions
.region("southamerica-east1")
.https.onCall(async (data, context) => {

try{

if (!context.auth) {
 throw new functions.https.HttpsError("unauthenticated");
}

const uid = context.auth.uid;

const { rodadaId, pacoteQuantidade } = data;

if (!rodadaId || !pacoteQuantidade || pacoteQuantidade <= 0) {
 throw new functions.https.HttpsError("invalid-argument");
}

const rodadaRef = db.collection("Rodadas").doc(rodadaId);

const rodadaSnap = await rodadaRef.get();

if (!rodadaSnap.exists) {
 throw new functions.https.HttpsError("not-found","Rodada não existe");
}

if (rodadaSnap.data().status !== "ativa") {
 throw new functions.https.HttpsError("failed-precondition","Rodada encerrada");
}

const NUMEROS_POR_CARTELA = 6;

await db.runTransaction(async (tx)=>{

 for(let i=0;i<pacoteQuantidade;i++){

   const numeros = [];

   while(numeros.length < NUMEROS_POR_CARTELA){

     const n = Math.floor(Math.random()*60)+1;

     if(!numeros.includes(n)) numeros.push(n);

   }

   const cartelaRef = rodadaRef.collection("Cartelas").doc();

   tx.set(cartelaRef,{
     userId: uid,
     numeros,
     valor: 2.5,
     status:"vendida",
     createdAt: admin.firestore.Timestamp.now()
   });

 }

});

return { success:true };

}catch(err){

console.error("BUY ERROR",err);

throw new functions.https.HttpsError(
 "internal",
 "Falha ao processar compra"
);

}

});
/*
==================================================
comprarCartela (CASINO ULTRA DEFENSE VERSION)
==================================================
*/
exports.comprarCartela = functions
.region("southamerica-east1")
.runWith({
  memory: "512MB",
  timeoutSeconds: 120
})
.https.onCall(async (data, context) => {

  try {

    if (!context.auth)
      throw new functions.https.HttpsError("unauthenticated");

    if (!data)
      throw new functions.https.HttpsError("invalid-argument");

    const uid = context.auth.uid;

    const {
      rodadaId,
      quantidade,
      purchaseToken,
      ip,
      deviceId
    } = data;

    if (!rodadaId || !quantidade)
      throw new functions.https.HttpsError("invalid-argument");

    /*
    =====================================================
    SAFE ENV RESOLUTION
    =====================================================
    */

    const project =
      process.env.GCP_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      admin.instanceId().app.options.projectId;

    if (!project)
      throw new Error("PROJECT_ID_UNDEFINED");

    const workerUrl =
      process.env.WORKER_PROCESS_URL;

    if (!workerUrl)
      throw new Error("WORKER_URL_UNDEFINED");

    const location = "southamerica-east1";
    const queue = "casino-engine";

    if (!tasksClient)
      throw new Error("TASK_CLIENT_NOT_READY");

    /*
    =====================================================
    IDEMPOTENCY TOKEN GUARD
    =====================================================
    */

    if (purchaseToken) {

      const tokenRef =
        db.collection("PurchaseExecutionTokens").doc(purchaseToken);

      const allowed = await db.runTransaction(async tx => {

        const snap = await tx.get(tokenRef);

        if (snap.exists) {

          const status = snap.data().status;

          if (status === "DONE")
            return false;

          if (status === "PROCESSING")
            return false;
        }

        tx.set(tokenRef,{
          status:"PROCESSING",
          uid,
          createdAt:admin.firestore.FieldValue.serverTimestamp()
        }, { merge:true });

        return true;
      });

      if (!allowed)
        throw new functions.https.HttpsError(
          "failed-precondition",
          "replay_or_locked"
        );
    }

    /*
    =====================================================
    ANTI FRAUDE ADAPTATIVO
    =====================================================
    */

    const score = await calcularScoreAntifraude({
      uid,
      ip,
      deviceId,
      valor: quantidade * 2.5
    });

    if (score >= 70) {

      await bloquearUsuario(uid).catch(()=>{});

      throw new functions.https.HttpsError(
        "failed-precondition",
        "risk_block"
      );
    }

    /*
    =====================================================
    FSM ORDER ATOMIC CREATE
    =====================================================
    */

    const orderRef =
      db.collection("Orders").doc();

    await orderRef.set({
      uid,
      rodadaId,
      quantidade,
      status:"PENDING",
      processado:false,
      retryCount:0,
      createdAt:admin.firestore.FieldValue.serverTimestamp()
    });

    /*
    =====================================================
    QUEUE SAFE TRIGGER
    =====================================================
    */

    const parent = tasksClient.queuePath(
      project,
      location,
      queue
    );

    await tasksClient.createTask({
      parent,
      task:{
        httpRequest:{
          httpMethod:"POST",
          url: workerUrl,
          headers:{
            "Content-Type":"application/json"
          },
          body:Buffer.from(JSON.stringify({
            orderId: orderRef.id,
            uid
          })).toString("base64")
        }
      }
    });

    return {
      success:true,
      orderId:orderRef.id
    };

  } catch(error) {

    console.error("🔥 CHECKOUT BACKEND ERROR", {
      message:error.message,
      stack:error.stack,
      code:error.code
    });

    if (error instanceof functions.https.HttpsError)
      throw error;

    throw new functions.https.HttpsError(
      "internal",
      "checkout_error"
    );
  }

});
exports.atualizarContador = functions.https.onCall(async (data, context) => {

  const { rodadaId } = data;
  const rodadaRef = db.collection("Rodadas").doc(rodadaId);

  const shardsSnap = await rodadaRef.collection("CounterShards").get();

  let total = 0;
  shardsSnap.forEach(doc => {
    total += doc.data().count;
  });

  await rodadaRef.update({ totalVendas: total });

  // verifica mini prêmio
  const mini = MINI_PREMIOS.find(p => p.vendas === total);

  if (mini) {
    await rodadaRef.update({
      premioLiberado: true,
      valorPremioAtual: mini.premio,
      tipoPremio: "mini",
    });
  }

  if (total === VENDAS_PREMIO_MAXIMO) {
    await rodadaRef.update({
      premioLiberado: true,
      valorPremioAtual: PREMIO_MAXIMO,
      tipoPremio: "maximo",
    });
  }

  return { total };
});
/* =========================
   PROCESSAR SORTEIO
========================= */
exports.processarSorteio = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Não autenticado");
  }

  const { rodadaId } = data;
  const rodadaRef = db.collection("Rodadas").doc(rodadaId);

  await db.runTransaction(async (tx) => {
    const rodadaSnap = await tx.get(rodadaRef);

    if (!rodadaSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Rodada não encontrada");
    }

    const rodada = rodadaSnap.data();

    if (!rodada.premioLiberado) {
      throw new functions.https.HttpsError("failed-precondition", "Prêmio não liberado");
    }

    if (rodada.sorteioProcessando) {
      throw new functions.https.HttpsError("already-exists", "Sorteio em andamento");
    }

    tx.update(rodadaRef, { sorteioProcessando: true });

    const cartelasSnap = await rodadaRef.collection("Cartelas").get();

    if (cartelasSnap.empty) {
      throw new functions.https.HttpsError("failed-precondition", "Sem cartelas");
    }

    const total = cartelasSnap.size;
    const index = Math.floor(Math.random() * total);
    const vencedor = cartelasSnap.docs[index].data();

    /* ---- SALVA HISTÓRICO ---- */

    tx.set(db.collection("HistoricoPremios").doc(), {
      rodadaId,
      userId: vencedor.userId,
      valor: rodada.valorPremioAtual,
      tipo: rodada.tipoPremio,
      createdAt: admin.firestore.Timestamp.now(),
    });

    /* ---- SE FOR PRÊMIO MÁXIMO → RESET ---- */

    if (rodada.tipoPremio === "maximo") {
      tx.update(rodadaRef, {
        totalVendas: 0,
        totalArrecadado: 0,
        fundoPremio: 0,
        fundoDespesas: 0,
        fundoIndicacao: 0,
        premioLiberado: false,
        valorPremioAtual: 0,
        tipoPremio: null,
        sorteioProcessando: false,
        startedAt: admin.firestore.Timestamp.now(),
      });
    } else {
      tx.update(rodadaRef, {
        premioLiberado: false,
        valorPremioAtual: 0,
        tipoPremio: null,
        sorteioProcessando: false,
      });
    }
  });

  return { success: true };
});
exports.criarCheckout = functions
.region("southamerica-east1")
.runWith({
 timeoutSeconds: 60,
 memory: "512MB"
})
.https.onCall(async (data, context)=>{

try{

if(!context.auth)
 throw new functions.https.HttpsError("unauthenticated");

const uid = context.auth.uid;

const {
 cartelas = [],
 nomeComprador,
 purchaseToken
} = data;

/*
==================================================
VALIDAÇÃO FORTE
==================================================
*/

if(!Array.isArray(cartelas) || cartelas.length === 0)
 throw new functions.https.HttpsError("invalid-argument");

if(cartelas.length > 50)
 throw new functions.https.HttpsError("failed-precondition");

/*
==================================================
IDEMPOTENCY TOKEN LOCK
==================================================
*/

if(purchaseToken){

 const tokenRef =
 db.collection("PurchaseExecutionTokens")
 .doc(purchaseToken);

 const allowed = await db.runTransaction(async tx=>{

   const snap = await tx.get(tokenRef);

   if(snap.exists){

     const st = snap.data().status;

     if(st === "DONE")
       return false;

     if(st === "PROCESSING")
       return false;
   }

   tx.set(tokenRef,{
     status:"PROCESSING",
     uid,
     createdAt:admin.firestore.FieldValue.serverTimestamp()
   });

   return true;

 });

 if(!allowed)
   throw new functions.https.HttpsError(
     "failed-precondition",
     "replay_or_locked"
   );
}

/*
==================================================
GLOBAL LOCK DISTRIBUÍDO
==================================================
*/

const checkoutLockRef =
 db.collection("Locks")
 .doc(`checkout_${uid}`);

const lockSnap = await checkoutLockRef.get();

if(lockSnap.exists){
 throw new functions.https.HttpsError(
   "failed-precondition",
   "checkout_locked"
 );
}

await checkoutLockRef.set({
 ativo:true,
 startedAt:admin.firestore.FieldValue.serverTimestamp()
});

/*
==================================================
TRANSACTION CORE ENGINE
==================================================
*/

const VALOR_CARTELA = 2.5;

const total = cartelas.length * VALOR_CARTELA;

const userRef =
 db.collection("UsuariosPrivado").doc(uid);

const pedidoRef =
 db.collection("Pedidos").doc();

const rankingRef =
 db.collection("RankingCompradores").doc(uid);

const historicoUserRef =
 userRef.collection("HistoricoCartelas");

/*
==================================================
FSM TRANSACTION
==================================================
*/

await db.runTransaction(async(tx)=>{

 const userSnap = await tx.get(userRef);

 if(!userSnap.exists)
   throw new Error("USER_NOT_FOUND");

 const userData = userSnap.data() || {};

 const rankingSnap = await tx.get(rankingRef);

/*
==================================================
READ PHASE SAFE (ANTI RACE)
==================================================
*/

 const cartelaDocs = await Promise.all(
   cartelas.map(id =>
     tx.get(db.collection("Cartelas").doc(id))
   )
 );

 const cartelaDataList = [];

 for(let i=0;i<cartelaDocs.length;i++){

   const snap = cartelaDocs[i];

   if(!snap.exists)
     throw new Error(`CARTELA_NOT_FOUND_${cartelas[i]}`);

   const c = snap.data();

   if(
     c.status !== "reservada" ||
     c.reservadaPor !== uid
   ){
     throw new Error(`CARTELA_NOT_RESERVED_${cartelas[i]}`);
   }

   cartelaDataList.push({
     ref:snap.ref,
     data:c
   });

 }

/*
==================================================
SALDO DEBIT FSM (ATÔMICO LÓGICO)
==================================================
*/

let saldoDeposito =
 Number(userData.saldo || 0);

let saldoCompart =
 Number(userData?.compartilhamento?.saldo || 0);

let saldoPremios =
 Number(
   userData?.premios?.saldo ||
   userData?.premios || 0
 );

let restante = total;

const usar = (saldo)=>{
 const usado = Math.min(restante, saldo);
 restante -= usado;
 return saldo - usado;
};

saldoPremios = usar(saldoPremios);
saldoCompart = usar(saldoCompart);
saldoDeposito = usar(saldoDeposito);

if(restante > 0)
 throw new Error("INSUFFICIENT_BALANCE");

/*
==================================================
WRITE PHASE ISOLADA
==================================================
*/

tx.update(userRef,{
 saldo:saldoDeposito,
 "compartilhamento.saldo":saldoCompart,
 "premios.saldo":saldoPremios,
 atualizadoEm:admin.firestore.FieldValue.serverTimestamp()
});

/*
==================================================
CARTELAS COMMIT
==================================================
*/

const nomeFinal =
 nomeComprador ||
 userData.nome ||
 context.auth.token?.name ||
 "Usuário";

for(let i=0;i<cartelaDataList.length;i++){

 const { ref, data } = cartelaDataList[i];

 tx.update(ref,{
   status:"vendida",
   reservadaPor:null,
   reservaExpiraEm:null,
   vendidaPor:uid,
   nomeComprador:nomeFinal,
   vendidaEm:admin.firestore.FieldValue.serverTimestamp()
 });

 tx.set(historicoUserRef.doc(),{
   cartelaId:cartelas[i],
   numeros:data.numeros||[],
   valor:VALOR_CARTELA,
   rodada:data.rodada,
   compradoEm:admin.firestore.FieldValue.serverTimestamp()
 });

}

/*
==================================================
PEDIDO FSM STATE
==================================================
*/

tx.set(pedidoRef,{
 uid,
 nomeComprador:nomeFinal,
 cartelas,
 total,
 status:"pago",
 processado:false,
 criadoEm:admin.firestore.FieldValue.serverTimestamp()
});

/*
==================================================
RANKING AGGREGATE
==================================================
*/

if(!rankingSnap.exists){

 tx.set(rankingRef,{
   nome:nomeFinal,
   quantidade:cartelas.length,
   total,
   atualizadoEm:admin.firestore.FieldValue.serverTimestamp()
 });

}else{

 tx.update(rankingRef,{
   nome:nomeFinal,
   quantidade:admin.firestore.FieldValue.increment(cartelas.length),
   total:admin.firestore.FieldValue.increment(total),
   atualizadoEm:admin.firestore.FieldValue.serverTimestamp()
 });

}

});

/*
==================================================
RELEASE LOCK
==================================================
*/

await checkoutLockRef.delete();

return {
 sucesso:true,
 pedidoId:pedidoRef.id,
 total
};

}catch(error){

console.error("CHECKOUT ERROR",error);

throw new functions.https.HttpsError(
 "internal",
 error.message || "checkout_fail"
);

}

});
 /* ===============================
   calcularScoreAntifraude
================================ */
async function calcularScoreAntifraude({ uid, ip, deviceId, valor }) {

  let score = 0;

  const cincoMinutos = admin.firestore.Timestamp.fromMillis(
    Date.now() - 5 * 60 * 1000
  );

  const comprasRecentesSnap = await db.collection("Pedidos")
    .where("uid", "==", uid)
    .where("criadoEm", ">", cincoMinutos)
    .get();

  if (comprasRecentesSnap.size >= 3) {
    score += 25;
  }

  if (ip) {
    const ipSnap = await db.collection("AntifraudeEventos")
      .where("ip", "==", ip)
      .limit(10)
      .get();

    const uids = new Set(ipSnap.docs.map(d => d.data().uid));
    if (uids.size >= 3) score += 30;
  }

  if (deviceId) {
    const deviceSnap = await db.collection("AntifraudeEventos")
      .where("deviceId", "==", deviceId)
      .limit(5)
      .get();

    const uids = new Set(deviceSnap.docs.map(d => d.data().uid));
    if (uids.size >= 2) score += 35;
  }

  const userSnap = await db.doc(`UsuariosPrivado/${uid}`).get();

  let criadoEm = 0;

  if (userSnap.exists) {
    const userData = userSnap.data();
    if (userData?.criadoEm instanceof admin.firestore.Timestamp) {
      criadoEm = userData.criadoEm.toMillis();
    }
  }

  const contaNova = Date.now() - criadoEm < 24 * 60 * 60 * 1000;

  if (contaNova && valor > 50) {
    score += 40;
  }

  return Math.min(score, 100);
}
/* ===============================
   classificarRisco
================================ */
function classificarRisco(score) {
  if (score >= 70) return "ALTO";
  if (score >= 40) return "MEDIO";
  return "BAIXO";
}

/* ===============================
   aplicarBloqueioSeNecessario
================================ */
async function aplicarBloqueioSeNecessario(uid, risco) {
  if (risco !== "ALTO") return;

  await db.doc(`UsuariosPrivado/${uid}`).set({
    bloqueado: true,
    bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
    motivoBloqueio: "antifraude_automatico",
  }, { merge: true });

  console.log(`Usuário ${uid} bloqueado automaticamente por risco ALTO`);
}

/* ===============================
   registrarEventoAntifraude
================================ */
async function registrarEventoAntifraude({
  uid,
  ip,
  deviceId,
  score,
  risco,
  pedidoId,
}) {
  await db.collection("AntifraudeEventos").add({
    uid,
    ip: ip || null,
    deviceId: deviceId || null,
    score,
    risco,
    pedidoId,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Evento antifraude registrado: uid=${uid}, risco=${risco}, score=${score}`);
}

/* ===============================
   verificarAntifraude (ULTRA SAFE)
================================ */

async function verificarAntifraude({
  uid,
  pedidoId,
  ip = null,
  deviceId = null,
  valor = 0
}) {

  const JANELA_MS = 30 * 1000;
  const LIMITE_PEDIDOS = 3;

  let score = 0;

  /*
  ==================================================
  HISTÓRICO RECENTE DO USUÁRIO (O(1) LIMITADO)
  ==================================================
  */

  const pedidosSnap = await db
    .collection("Pedidos")
    .where("uid", "==", uid)
    .orderBy("criadoEm", "desc")
    .limit(5)
    .get();

  const agora = Date.now();

  const recentes = pedidosSnap.docs.filter(doc => {
    const t = doc.data().criadoEm?.toMillis?.();
    return t && agora - t < JANELA_MS;
  });

  /*
  ==================================================
  DETECÇÃO COMPRA RÁPIDA
  ==================================================
  */

  if (recentes.length >= LIMITE_PEDIDOS) {
    score += 60;
  }

  /*
  ==================================================
  FINGERPRINT IP ANALYSIS
  ==================================================
  */

  if (ip) {

    const ipSnap = await db.collection("AntifraudeEventos")
      .where("ip", "==", ip)
      .limit(10)
      .get();

    const uniqueUsers = new Set(
      ipSnap.docs.map(d => d.data().uid)
    );

    if (uniqueUsers.size >= 3) score += 25;
  }

  /*
  ==================================================
  DEVICE CROSS MATCH
  ==================================================
  */

  if (deviceId) {

    const deviceSnap = await db.collection("AntifraudeEventos")
      .where("deviceId", "==", deviceId)
      .limit(10)
      .get();

    const uniqueUsers = new Set(
      deviceSnap.docs.map(d => d.data().uid)
    );

    if (uniqueUsers.size >= 2) score += 35;
  }

  /*
  ==================================================
  CONTROLE DE VALOR SUSPEITO
  ==================================================
  */

  if (valor > 50) score += 30;

  /*
  ==================================================
  SCORE FINAL
  ==================================================
  */

  score = Math.min(score, 100);

  const permitido = score < 70;

  /*
  ==================================================
  AUDIT LOG IMMUTABLE
  ==================================================
  */

  await db.collection("AntifraudeEventos").add({
    uid,
    pedidoId,
    ip,
    deviceId,
    valor,
    score,
    risco: score >= 70 ? "ALTO" :
           score >= 40 ? "MEDIO" : "BAIXO",
    criadoEm: admin.firestore.FieldValue.serverTimestamp()
  });

  /*
  ==================================================
  BLOQUEIO AUTOMÁTICO
  ==================================================
  */

  if (score >= 85) {

    await db.doc(`UsuariosPrivado/${uid}`).set({
      bloqueado: true,
      bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
      motivoBloqueio: "antifraude_automatico",
      scoreAntifraude: score
    }, { merge: true });

  }

  return {
    permitido,
    score,
    motivo: permitido ? null : "RISK_SCORE_HIGH"
  };
}

exports.processOrder = async (req, res) => {

 try {

 const { orderId } = req.body;

 if (!orderId)
   return res.sendStatus(400);

/*
==================================================
ORDER LOCK
==================================================
*/

 const lockRef =
 db.collection("Locks").doc(`order_${orderId}`);

 const lock = await db.runTransaction(async tx => {

   const snap = await tx.get(lockRef);

   if(snap.exists)
     throw new Error("ORDER_ALREADY_LOCKED");

   tx.set(lockRef,{
     ativo:true,
     createdAt:admin.firestore.FieldValue.serverTimestamp()
   });

   return true;
 });

/*
==================================================
ORDER LOAD
==================================================
*/

 const orderRef =
 db.collection("Orders").doc(orderId);

 const orderSnap = await orderRef.get();

 if(!orderSnap.exists){
   return res.sendStatus(404);
 }

 const order = orderSnap.data();

 if(order.status !== "PENDING"){
   return res.sendStatus(200);
 }

/*
==================================================
MARK PROCESSING
==================================================
*/

 await orderRef.update({
   status:"PROCESSING",
   processingStartedAt:admin.firestore.FieldValue.serverTimestamp()
 });

/*
==================================================
ENTROPY SEED
==================================================
*/

 const baseSeed =
 crypto.createHash("sha256")
 .update(
   orderId +
   Date.now() +
   crypto.randomBytes(8).toString("hex")
 )
 .digest("hex");

/*
==================================================
SHARD DISTRIBUTION
==================================================
*/

 const shardId =
 String(crypto.randomInt(NUM_VENDA_SHARDS));

 const rodadaRef =
 db.collection("Rodadas").doc(order.rodadaId);

 const shardRef =
 rodadaRef.collection("VendaShards").doc(shardId);

 let batch = db.batch();
 let writeCounter = 0;

/*
==================================================
BATCH LOOP
==================================================
*/

 for(let i=0;i<order.quantidade;i++){

   const numeros = [];

   while(numeros.length < 6){
     const n = crypto.randomInt(1,61);

     if(!numeros.includes(n))
       numeros.push(n);
   }

   const cartelaRef =
   rodadaRef.collection("Cartelas").doc();

   batch.set(cartelaRef,{
     userId:order.uid,
     numeros,
     valor:2.5,
     status:"vendida",
     seed:baseSeed,
     orderId,
     createdAt:admin.firestore.FieldValue.serverTimestamp()
   });

   writeCounter++;

   if(writeCounter % 400 === 0){
     await batch.commit();
     batch = db.batch();
   }
 }

 await batch.commit();

/*
==================================================
SHARD COUNTER
==================================================
*/

 await shardRef.set({
   count:admin.firestore.FieldValue.increment(order.quantidade),
   updatedAt:admin.firestore.FieldValue.serverTimestamp()
 },{merge:true});

/*
==================================================
FINAL STATE
==================================================
*/

 await orderRef.update({
   status:"DONE",
   finishedAt:admin.firestore.FieldValue.serverTimestamp(),
   entropySeed:baseSeed
 });

 await lockRef.delete();

 res.send("OK");

 } catch(err){

 console.error("PROCESS ORDER ERROR", err);

 try{

   const { orderId } = req.body;

   if(orderId){

     await db.collection("Orders").doc(orderId)
     .update({
       status:"FAILED",
       errorAt:admin.firestore.FieldValue.serverTimestamp()
     });

   }

 }catch(e){}

 res.sendStatus(200);

 }

};
 /* ===============================
   atualizarMiniPremios (ULTRA SAFE)
================================ */
async function atualizarMiniPremios(tx, quantidadeCartelas) {

  const statusRef =
    db.collection("RifaStatus").doc("statusGeral");

  const snap = await tx.get(statusRef);

  let data = snap.exists
    ? snap.data()
    : {
        vendidasContador: 0,
        rodadaAtual: 1,
        ultimoPremioPago: null,
        processandoPremio: false
      };

  if (data.processandoPremio) {
    return null; // trava anti concorrência
  }

  data.vendidasContador =
    (data.vendidasContador || 0) + quantidadeCartelas;

  const etapas = [
    { vendidas: 200, premio: 50 },
    { vendidas: 300, premio: 100 },
    { vendidas: 500, premio: 250 },
    { vendidas: 1000, premio: 500 },
    { vendidas: 15000, premio: 5000 },
  ];

  let premioDisparado = null;

  for (let etapa of etapas) {

    const flagKey = `premio_${etapa.premio}_pago`;

    if (
      data.vendidasContador >= etapa.vendidas &&
      !data[flagKey]
    ) {

      data[flagKey] = true;
      premioDisparado = etapa.premio;
      break;
    }
  }

  if (premioDisparado === 5000) {

    data.vendidasContador = 0;
    data.rodadaAtual = (data.rodadaAtual || 1) + 1;

    for (let etapa of etapas) {
      data[`premio_${etapa.premio}_pago`] = false;
    }
  }

  if (premioDisparado) {
    data.processandoPremio = true;
    data.ultimoPremioPago = premioDisparado;
  }

  tx.set(statusRef, data, { merge: true });

  return premioDisparado;
}
 /* ===============================
   atualizarPremios (CASSINO SAFE)
================================ */
async function atualizarPremios(cartelasVendidas) {

  const rodadaRef =
    db.collection("Rifa").doc("RodadaAtual");

  let premioParaPagar = null;

  await db.runTransaction(async (tx) => {

    const snap = await tx.get(rodadaRef);

    let rodada = snap.exists
      ? snap.data()
      : {
          vendasAcumuladas: 0,
          rodadaAtual: 1,
          processandoPremio: false
        };

    if (rodada.processandoPremio) {
      return;
    }

    rodada.vendasAcumuladas =
      (rodada.vendasAcumuladas || 0) + cartelasVendidas;

    for (const mini of MINI_PREMIOS) {

      const flagKey = `mini_${mini.premio}`;

      if (
        rodada.vendasAcumuladas >= mini.vendas &&
        !rodada[flagKey]
      ) {

        rodada[flagKey] = true;
        rodada.processandoPremio = true;
        premioParaPagar = mini.premio;
        break;
      }
    }

    if (
      rodada.vendasAcumuladas >= VENDAS_PREMIO_MAXIMO &&
      !rodada.processandoPremio
    ) {

      rodada.processandoPremio = true;
      premioParaPagar = PREMIO_MAXIMO;

      rodada.vendasAcumuladas = 0;
      rodada.rodadaAtual += 1;

      for (const mini of MINI_PREMIOS) {
        rodada[`mini_${mini.premio}`] = false;
      }
    }

    tx.set(rodadaRef, rodada, { merge: true });

  });

  /*
  ===============================
  PAYOUT FORA DA TRANSACTION
  ===============================
  */

  if (premioParaPagar) {

    try {

      await pagarPremioSeguro(premioParaPagar);

      await rodadaRef.set({
        processandoPremio: false,
        ultimoPremioPago: premioParaPagar,
        pagoEm: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    } catch (err) {

      console.error("PAYOUT ERROR", err);

      await rodadaRef.set({
        processandoPremio: false
      }, { merge: true });

    }
  }
}
  /* ===============================
   congelarSaldo
================================ */
async function congelarSaldo(uid, valor) {
  await db.doc(`UsuariosPrivado/${uid}`).update({
    saldoCongelado: admin.firestore.FieldValue.increment(valor),
  });
}

 /* ===============================
   getFraudesRecentes
================================ */
exports.getFraudesRecentes = functions
.region("southamerica-east1")
.https.onCall(async (data, context) => {

  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuário não autenticado"
    );
  }

  try {

    const { limit = 50, startAfter = null } = data || {};

    const MAX_LIMIT = 100;

    const finalLimit = Math.min(
      Math.max(limit, 1),
      MAX_LIMIT
    );

    let query = db.collection("AntifraudeEventos")
      .orderBy("criadoEm", "desc")
      .limit(finalLimit);

    /*
    =====================================
    PAGINAÇÃO SEGURA
    =====================================
    */

    if (startAfter) {
      const cursorSnap = await db
        .collection("AntifraudeEventos")
        .doc(startAfter)
        .get();

      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snap = await query.get();

    const eventos = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      count: eventos.length,
      eventos
    };

  } catch (err) {

    console.error("GET FRAUDES ERROR", err);

    throw new functions.https.HttpsError(
      "internal",
      "Erro ao buscar eventos antifraude"
    );
  }
});

exports.criarPedido = functions
.region("southamerica-east1")
.https.onCall(async (data, context) => {

 try {

 if (!context.auth) {
   throw new functions.https.HttpsError(
     "unauthenticated",
     "Login necessário"
   );
 }

 const uid = context.auth.uid;

 const {
   cartelas = [],
   nomeComprador,
   purchaseToken
 } = data;

 if (!cartelas.length) {
   throw new functions.https.HttpsError(
     "invalid-argument",
     "Cartelas vazias"
   );
 }

/*
========================================
IDEMPOTENCY TOKEN SAFE
========================================
*/

 if(purchaseToken){

   const tokenRef =
   db.collection("PurchaseExecutionTokens")
   .doc(purchaseToken);

   const snap = await tokenRef.get();

   if(snap.exists){
     const status = snap.data().status;

     if(status === "DONE")
       return { ok:true };

     if(status === "PROCESSING")
       throw new functions.https.HttpsError(
         "failed-precondition",
         "pedido_em_processamento"
       );
   }

   await tokenRef.set({
     status:"PROCESSING",
     uid,
     createdAt:admin.firestore.FieldValue.serverTimestamp()
   });

 }

/*
========================================
CREATE ORDER FSM STATE
========================================
*/

 const compraRef =
 db.collection("Compras").doc();

 await compraRef.set({
   uid,
   cartelas,
   nomeComprador: nomeComprador || "Usuário",
   status:"pendente",
   processado:false,
   retryCount:0,
   criadaEm:admin.firestore.FieldValue.serverTimestamp()
 });

/*
========================================
QUEUE WORKER TRIGGER
========================================
*/

 try{

   await enqueueCompraTask({
     uid,
     cartelas,
     nomeComprador,
     compraId:compraRef.id
   });

 }catch(queueErr){

   console.error("QUEUE ERROR", queueErr);

   await compraRef.update({
     status:"QUEUE_FAILED"
   });

   throw new functions.https.HttpsError(
     "internal",
     "fila_execucao_falhou"
   );
 }

 return { ok:true };

} catch (error) {

  console.error("CRIAR PEDIDO ERROR FULL:", {
    message: error.message,
    code: error.code,
    stack: error.stack
  });

  if (error instanceof functions.https.HttpsError) {
    throw error;
  }

  throw new functions.https.HttpsError(
    "internal",
    error.message || "erro_interno"
  );
}
});
async function validarTokenSeguro(token){

 if(!token)
   return { permitido:false };

 const ref =
 db.collection("PurchaseExecutionTokens").doc(token);

 const result = await db.runTransaction(async tx=>{

   const snap = await tx.get(ref);

   if(snap.exists){

     const data = snap.data();

     if(data.status === "DONE"){
       return { permitido:false, replay:true };
     }

     if(data.status === "PROCESSING"){
       return { permitido:false, lock:true };
     }
   }

   tx.set(ref,{
     status:"PROCESSING",
     createdAt:admin.firestore.FieldValue.serverTimestamp()
   },{ merge:true });

   return { permitido:true };

 });

 return result;

}
exports.workerProcessarPedido =
functions.firestore
.document("Pedidos/{pedidoId}")
.onUpdate(async (change, context) => {

const pedidoId = context.params.pedidoId;

const lockRef =
db.collection("Locks").doc(`worker_${pedidoId}`);

const ledgerRef =
db.collection("ExecutionLedger").doc(pedidoId);

let lockAcquired = false;

try {

const after = change.after.data();
const before = change.before.data();

if(!after) return null;

/*
====================================
GUARD EXECUTION
====================================
*/

if(after.workerDone === true)
 return null;

if(after.status !== "pago")
 return null;

/*
====================================
REPLAY PROTECTION
====================================
*/

const ledgerSnap = await ledgerRef.get();

if(ledgerSnap.exists)
 return null;

/*
====================================
GLOBAL DISTRIBUTED LOCK
====================================
*/

await db.runTransaction(async tx => {

const lockSnap = await tx.get(lockRef);

if(lockSnap.exists){
 throw new Error("LOCKED_EXECUTION");
}

tx.set(lockRef,{
 startedAt:admin.firestore.FieldValue.serverTimestamp()
});

lockAcquired = true;

});

/*
====================================
KERNEL BATCH EXECUTION
====================================
*/

const batch = db.batch();

const cartelas =
(after.cartelas || []).slice(0,100);

let writeCount = 0;

/*
Entropy seed audit trail
*/

const entropySeed =
crypto.createHash("sha256")
.update(
pedidoId +
Date.now() +
crypto.randomBytes(16).toString("hex")
)
.digest("hex");

/*
Create Cartelas
*/

for(const codigo of cartelas){

if(writeCount >= MAX_BATCH_WRITE)
 break;

const cartelaRef =
db.collection("Cartelas").doc();

batch.set(cartelaRef,{
 uid: after.uid,
 pedidoId,
 valorUnitario: VALOR_CARTELA,
 fundoPremio: PREMIO_UNITARIO,
 rodada: after.rodada || 1,
 status:"vendida",
 entropySeed,
 createdAt:admin.firestore.FieldValue.serverTimestamp()
});

writeCount++;
}

/*
Ledger immutable audit
*/

batch.set(ledgerRef,{
 pedidoId,
 uid: after.uid,
 writes: writeCount,
 entropySeed,
 executedAt:admin.firestore.FieldValue.serverTimestamp()
});

/*
Mark source event done (SAFE FLAG)
*/

batch.update(change.after.ref,{
 workerDone:true,
 processado:true,
 processadoEm:admin.firestore.FieldValue.serverTimestamp()
});

await batch.commit();

}
catch(err){

console.error("CASINO WORKER ERROR",err);

try{

await db.collection("Pedidos")
.doc(pedidoId)
.update({
 workerError:true,
 workerErrorAt:admin.firestore.FieldValue.serverTimestamp()
});

}catch(e){}

}
finally{

if(lockAcquired){
 try{
 await lockRef.delete();
 }catch(e){}
}

}

});
// ===============================
// GERAR CÓDIGO DE COMPARTILHAMENTO SEGURO AO CRIAR USUÁRIO
// ===============================
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  const uid = user.uid;
  const agora = admin.firestore.Timestamp.now();
  const expira = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24*60*60*1000));

  // Criar missão diária
  const missaoRef = db.collection("MissoesAtivas").doc(uid);
  await missaoRef.set({
    meta: 3,
    atual: 0,
    recompensa: '1 cartela grátis',
    tipo: 'diaria',
    criadaEm: agora,
    expiraEm: expira,
  });

  // Gerar código sequencial de compartilhamento
  const contadorRef = db.collection("Contadores").doc("usuariosCompartilhamento");
  let codigo = "";

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(contadorRef);
    let proximo = snap.exists ? (snap.data().ultimo || 0) + 1 : 1;
    if (proximo > 1000000) throw new Error("Limite de códigos atingido (1 milhão)");

    tx.set(contadorRef, { ultimo: proximo }, { merge: true });

    codigo = `Rifa${String(proximo).padStart(6, "0")}`;
    const userRef = db.collection("UsuariosPrivado").doc(uid);
    tx.set(userRef, {
      compartilhamento: { codigo, criadoEm: admin.firestore.FieldValue.serverTimestamp(), saldo: 0 },
      saldo: 0,
      scoreAntifraude: 0,
      bloqueado: false,
    }, { merge: true });
  });

  console.log(`🆕 Usuário ${uid} criado | Código de compartilhamento: ${codigo}`);
});
// ===============================
// REGISTRAR INDICAÇÃO E BÔNUS DE COMPARTILHAMENTO
// ===============================
async function registrarCompartilhamentoAposCompra({ indicadoUid }) {
  const indicacaoRef = db.collection("Indicacoes").doc(indicadoUid);
  const hoje = new Date().toISOString().slice(0,10);

  await db.runTransaction(async (tx) => {
    const indicacaoSnap = await tx.get(indicacaoRef);
    if (!indicacaoSnap.exists) return;

    const { indicadorUid, pago } = indicacaoSnap.data();
    if (indicadorUid === indicadoUid || pago === true) return;

    const diarioRef = db.collection("IndicacoesDiarias").doc(`${indicadorUid}_${hoje}`);
    const diarioSnap = await tx.get(diarioRef);
    const totalHoje = diarioSnap.exists ? diarioSnap.data().totalHoje || 0 : 0;
    if (totalHoje >= 5) return;

    tx.update(db.collection("UsuariosPrivado").doc(indicadorUid), {
      saldo: admin.firestore.FieldValue.increment(0.25),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (totalHoje + 1 === 5) {
      tx.update(db.collection("UsuariosPrivado").doc(indicadorUid), {
        cartelas: admin.firestore.FieldValue.increment(1),
      });
    }

    tx.set(diarioRef, {
      indicadorUid,
      data: hoje,
      totalHoje: totalHoje + 1,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.update(indicacaoRef, { pago: true, pagoEm: admin.firestore.FieldValue.serverTimestamp(), valorPago: 0.25 });

    tx.set(db.collection("UsuariosPrivado").doc(indicadorUid).collection("LedgerFinanceiro").doc(), {
      tipo: "indicacao",
      valor: 0.25,
      cartelaExtra: totalHoje + 1 === 5 ? 1 : 0,
      indicadoUid,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
/* ===============================
   Cloud Function: Registrar Bônus e Consolidar Saldo
================================ */
exports.registrarBonusConsolidado = functions
  .runWith({ memory: "256MB", timeoutSeconds: 20 })
  .https.onCall(async (data, context) => {
    const { indicadoUid } = data;

    if (!indicadoUid) throw new functions.https.HttpsError(
      "invalid-argument",
      "IndicadoUid é obrigatório"
    );

    const indicacaoRef = db.collection("Indicacoes").doc(indicadoUid);
    const hoje = new Date().toISOString().slice(0, 10);

    try {
      await db.runTransaction(async (tx) => {
        const indicacaoSnap = await tx.get(indicacaoRef);
        if (!indicacaoSnap.exists) return;

        const indicacao = indicacaoSnap.data();
        const { indicadorUid, pago } = indicacao;

        // ⛔ Já pago ou autoindicação
        if (pago === true || indicadorUid === indicadoUid) return;

        // Checar limite diário
        const diarioRef = db
          .collection("IndicacoesDiarias")
          .doc(`${indicadorUid}_${hoje}`);
        const diarioSnap = await tx.get(diarioRef);
        const totalPagoHoje = diarioSnap.exists ? diarioSnap.data().totalPago || 0 : 0;
        if (totalPagoHoje >= 3) return;

        const valorBonus = 0.25; // R$0,25 por indicação

        const userRef = db.collection("UsuariosPrivado").doc(indicadorUid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error("Usuário não encontrado");

        const userData = userSnap.data();

        // Atualiza saldo compartilhamento
        const novoSaldoCompartilhamento = (userData.compartilhamento?.saldo || 0) + valorBonus;

        // Atualiza saldo consolidado (saldoDeposito + premios + compartilhamento)
        const saldoDisponivel =
          (userData.saldo || 0) +
          (userData.premios || 0) +
          novoSaldoCompartilhamento;

        // Atualiza dados do usuário
        tx.update(userRef, {
          "compartilhamento.saldo": novoSaldoCompartilhamento,
          saldoDisponivel,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Atualizar controle diário
        tx.set(
          diarioRef,
          {
            indicadorUid,
            data: hoje,
            totalPago: totalPagoHoje + 1,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Marcar indicação como paga
        tx.update(indicacaoRef, {
          pago: true,
          pagoEm: admin.firestore.FieldValue.serverTimestamp(),
          valorPago: valorBonus,
        });

        // Criar Ledger Financeiro
        const ledgerRef = userRef.collection("LedgerFinanceiro").doc();
        tx.set(ledgerRef, {
          tipo: "indicacao",
          valor: valorBonus,
          indicadoUid,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return { success: true, message: "Bônus registrado e saldo atualizado!" };
    } catch (err) {
      console.error(err);
      throw new functions.https.HttpsError(
        "internal",
        "Erro ao registrar bônus e consolidar saldo"
      );
    }
  });
exports.calcularSaldoDisponivel =
functions.region("southamerica-east1")
.https.onCall(async (_, context) => {

if(!context.auth){
 throw new functions.https.HttpsError(
   "unauthenticated"
 );
}

try{

const uid = context.auth.uid;

const userRef =
db.collection("UsuariosPrivado").doc(uid);

/*
====================================
READ SNAPSHOT SAFE
====================================
*/

const snap = await userRef.get();

if(!snap.exists){
 throw new functions.https.HttpsError(
   "not-found",
   "Usuário não encontrado"
 );
}

const data = snap.data() || {};

/*
====================================
NORMALIZE LEDGER VALUES
====================================
*/

const saldoDeposito =
isFinite(Number(data.saldo)) ?
Number(data.saldo) : 0;

const saldoCompart =
isFinite(Number(data?.compartilhamento?.saldo)) ?
Number(data?.compartilhamento?.saldo) : 0;

let saldoPremios = 0;

if(data.premios){

 if(typeof data.premios === "object"){
   saldoPremios =
   isFinite(Number(data.premios.saldo)) ?
   Number(data.premios.saldo) : 0;
 }
 else{
   saldoPremios =
   isFinite(Number(data.premios)) ?
   Number(data.premios) : 0;
 }

}

/*
====================================
TOTAL SAFE SUM (ANTI FLOAT CORRUPTION)
====================================
*/

const saldoDisponivel =
Math.trunc(
 (saldoDeposito +
 saldoCompart +
 saldoPremios) * 100
) / 100;

return {
 success:true,
 saldoDisponivel
};

}catch(err){

console.error("CALCULAR SALDO ERROR",err);

throw new functions.https.HttpsError(
 "internal",
 "saldo_kernel_error"
);

}

});
/* ===============================
   ATUALIZAR RANKING
================================ */
async function atualizarRankingUsuario(uid, cartelasCompradas) {
  if (!uid || !cartelasCompradas?.length) return;
  const quantidade = cartelasCompradas.length;
  const total = cartelasCompradas.reduce((sum, c) => sum + c.valor, 0);
  const userSnap = await db.collection("Usuarios").doc(uid).get();
  const nomeUsuario = userSnap.exists ? userSnap.data().nome || "Usuário" : "Usuário";

  await db.collection("RankingCompradores").doc(uid).set({
    userId: uid,
    nome: nomeUsuario,
    quantidade: admin.firestore.FieldValue.increment(quantidade),
    total: admin.firestore.FieldValue.increment(total),
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

/* ===============================
   ATUALIZAR STATUS GLOBAL
================================ */
async function atualizarStatusGlobal({ novasVendas = 0 }) {
  const ref = db.collection("StatusGlobal").doc("geral");
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? snap.data() : { totalCartelas: TOTAL_CARTELAS, cartelasVendidas:0, faturamento:0 };
    const cartelasVendidas = (atual.cartelasVendidas || 0) + novasVendas;
    const faturamento = cartelasVendidas * VALOR_CARTELA;
    tx.set(ref, { ...atual, cartelasVendidas, faturamento, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
  });
}
/* ===============================
   atualizarMissaoIndicacao
================================ */
async function atualizarMissaoIndicacao(uid) {
  const ref = db.collection('MissoesAtivas').doc(uid);

  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;

    const data = snap.data();
    if (data.atual >= data.meta) return;

    t.update(ref, {
      atual: admin.firestore.FieldValue.increment(1),
    });
  });
}

/* ===============================
   criarOuResetarMissao
================================ */
exports.criarOuResetarMissao = functions.auth.user().onCreate(async (user) => {
  const ref = db.collection('MissoesAtivas').doc(user.uid);

  const agora = admin.firestore.Timestamp.now();
  const expira = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );

  await ref.set({
    meta: 3,
    atual: 0,
    recompensa: '1 cartela grátis',
    tipo: 'diaria',
    criadaEm: agora,
    expiraEm: expira,
  });
});
/* ===============================
  atualizarRanking de Indicaçoes
================================ */
async function atualizarRanking(uid, nome) {
  const ref = db.collection('RankingIndicacoes').doc(uid);

  await ref.set(
    {
      nome,
      quantidade: admin.firestore.FieldValue.increment(1),
      atualizadoEm: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );
}
// ===============================
// SORTEIO DE MINI-PRÊMIOS E PRÊMIO MÁXIMO
// ===============================
exports.verificarSorteio = functions.firestore
  .document("Sorteios/ativo")
  .onUpdate(async (change) => {
    const depois = change.after.data();
    const cartelasVendidas = depois.cartelasVendidas;
    const controleRef = db.doc("Sorteios/controle");
    const controleSnap = await controleRef.get();
    const ultimo = controleSnap.exists ? controleSnap.data().ultimoMetaProcessada || 0 : 0;

    let premio = null;
    let meta = null;

    for (const m of METAS) {
      if (cartelasVendidas >= ultimo + m.cartelas) {
        premio = m.premio;
        meta = ultimo + m.cartelas;
        break;
      }
    }

    if (!premio) return;

    // Seleciona vencedor aleatório
    const cartelasSnap = await db.collection("Cartelas").get();
    if (cartelasSnap.empty) return;

    const vencedor = cartelasSnap.docs[Math.floor(Math.random() * cartelasSnap.docs.length)];
    const batch = db.batch();

    batch.set(db.collection("Premios").doc(), {
      uid: vencedor.data().uid,
      valor: premio,
      cartelasNoMomento: meta,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Atualiza controle
    batch.set(controleRef, { ultimoMetaProcessada: meta }, { merge: true });
    await batch.commit();

    // Se prêmio máximo atingido, zera tudo
    if (meta >= 10000) {
      await db.doc("Sorteios/ativo").update({ cartelasVendidas: 0, fundoPremio: 0 });
      await db.doc("Sorteios/controle").set({ ultimoMetaProcessada: 0 }, { merge: true });
    }
  });

/* ===============================
   ATUALIZAR STATUS SORTEIO (ESCALÁVEL)
================================ */
async function atualizarStatusSorteio(qtdVendidas) {

  const ref = db.collection("StatusSorteio").doc("geral");

  let sorteiosParaExecutar = [];
  let resetRodada = false;

  await db.runTransaction(async (tx) => {

    const snap = await tx.get(ref);

    const atual = snap.exists
      ? snap.data()
      : {
          rodada: 1,
          cartelasVendidas: 0,
          ultimaMetaProcessada: 0,
        };

    const rodadaAtual = atual.rodada || 1;

    const cartelasVendidas =
      (atual.cartelasVendidas || 0) + qtdVendidas;

    let ultimaMeta = atual.ultimaMetaProcessada || 0;

    let premioAtual = 0;
    let nivel = null;

    /* ================= MINI PRÊMIOS ================= */
    for (const meta of MINI_PREMIOS) {

      const qtdAntes = Math.floor(ultimaMeta / meta.vendas);
      const qtdAgora = Math.floor(cartelasVendidas / meta.vendas);

      const novosPremios = qtdAgora - qtdAntes;

      if (novosPremios > 0) {

        for (let i = 0; i < novosPremios; i++) {

          sorteiosParaExecutar.push({
            rodada: rodadaAtual,
            premio: meta.premio,
            nivel: `mini-${meta.vendas}`,
          });

        }

        ultimaMeta = meta.vendas * qtdAgora;
        premioAtual = meta.premio;
        nivel = `mini-${meta.vendas}`;
      }
    }

    /* ================= PRÊMIO MÁXIMO ================= */
    const qtdMaxAntes =
      Math.floor(ultimaMeta / VENDAS_PREMIO_MAXIMO);

    const qtdMaxAgora =
      Math.floor(cartelasVendidas / VENDAS_PREMIO_MAXIMO);

    if (qtdMaxAgora > qtdMaxAntes) {

      sorteiosParaExecutar.push({
        rodada: rodadaAtual,
        premio: PREMIO_MAXIMO,
        nivel: "maximo",
      });

      ultimaMeta = VENDAS_PREMIO_MAXIMO * qtdMaxAgora;
      premioAtual = PREMIO_MAXIMO;
      nivel = "maximo";

      resetRodada = true;
    }

    /* ================= ATUALIZA STATUS ================= */
    tx.set(
      ref,
      {
        rodada: rodadaAtual,
        cartelasVendidas,
        ultimaMetaProcessada: ultimaMeta,
        premioAtual,
        nivel,
        faltamCartelas: Math.max(
          VENDAS_PREMIO_MAXIMO - cartelasVendidas,
          0
        ),
        sorteioLiberado: sorteiosParaExecutar.length > 0,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  /* ================= EXECUTA SORTEIOS FORA DA TRANSACTION ================= */

  for (const sorteio of sorteiosParaExecutar) {

    await sortearPremio(
      sorteio.premio,
      sorteio.nivel,
      sorteio.rodada
    );

  }

  /* ================= RESET AUTOMÁTICO DA RODADA ================= */

  if (resetRodada) {

    await ref.update({
      rodada: admin.firestore.FieldValue.increment(1),
      cartelasVendidas: 0,
      ultimaMetaProcessada: 0,
      premioAtual: 0,
      nivel: null,
      faltamCartelas: VENDAS_PREMIO_MAXIMO,
      sorteioLiberado: false,
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

  }

}
/* ===============================
   getRankingSemanal (OTIMIZADO)
================================ */
exports.getRankingSemanal = functions
  .region("southamerica-east1")
  .https.onCall(async (_, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated");
    }

    const snap = await db.collection("Ranking")
      .orderBy("pontuacao", "desc")
      .limit(10)
      .get();

    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  });
/* ===============================
   getDashboardResumo (ROBUSTO)
================================ */
exports.getDashboardResumo = functions
  .region("southamerica-east1")
  .https.onCall(async (_, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated");
    }

    const hoje = new Date().toISOString().slice(0, 10);

    const [
      faturamentoSnap,
      usuariosSnap,
      cartelasSnap,
      fraudeSnap
    ] = await Promise.all([
      db.collection("FinanceiroResumo").doc(hoje).get(),
      db.collection("UsuariosResumo").doc(hoje).get(),
      db.collection("CartelasResumo").doc(hoje).get(),
      db.collection("FraudesIndicacao")
        .where("data", "==", hoje)
        .get(),
    ]);

    return {
      faturamentoHoje: faturamentoSnap.exists
        ? faturamentoSnap.data()?.total || 0
        : 0,

      usuariosAtivos: usuariosSnap.exists
        ? usuariosSnap.data()?.ativos || 0
        : 0,

      cartelasVendidasHoje: cartelasSnap.exists
        ? cartelasSnap.data()?.vendidas || 0
        : 0,

      indicacoesSuspeitas: fraudeSnap.size || 0,
    };
  });

async function sortearPremioUltra(premio, nivel, rodadaId) {

  const sorteioKey = `rodada_${rodadaId}_${nivel}`;
  const lockRef = db.collection("Locks").doc(sorteioKey);
  const statusRef = db.collection("StatusSorteio").doc(`rodada_${rodadaId}`);

  await db.runTransaction(async (tx) => {

    // 🔒 Lock
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) return;

    const statusSnap = await tx.get(statusRef);
    if (!statusSnap.exists) return;

    const totalVendidas = statusSnap.data().cartelasVendidas || 0;
    if (totalVendidas <= 0) return;

    // 🎲 Seed auditável
    const timestamp = Date.now().toString();
    const seed = `r:${rodadaId}|n:${nivel}|t:${timestamp}|tot:${totalVendidas}`;

    const hash = crypto
      .createHash("sha256")
      .update(seed)
      .digest("hex");

    const numeroSorteado =
      (parseInt(hash.substring(0, 13), 16) % totalVendidas) + 1;

    // 🔥 Acesso DIRETO por ID (O(1))
    const cartelaRef =
      db.collection("Cartelas")
        .doc(`${rodadaId}_${numeroSorteado}`);

    const cartelaSnap = await tx.get(cartelaRef);
    if (!cartelaSnap.exists) return;

    const data = cartelaSnap.data();

    // 🏆 Salva ganhador
    tx.set(db.collection("Ganhadores").doc(), {
      uid: data.uid,
      valor: premio,
      rodada: rodadaId,
      nivel,
      numeroSorteado,
      seed,
      hash,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 📜 Registro público
    tx.set(db.collection("Sorteios").doc(sorteioKey), {
      rodadaId,
      premio,
      nivel,
      numeroSorteado,
      seed,
      hash,
      totalVendidas,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔒 Lock final
    tx.set(lockRef, {
      executado: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

  });

}
/* ===============================
  verificarDepositosPendentes
================================ */
exports.verificarDepositosPendentes = functions.pubsub
  .schedule('every 1 minutes')
  .timeZone('America/Sao_Paulo')
  .onRun(async () => {
    console.log('⏱ Verificando depósitos pendentes...');

    try {
      const depositosSnap = await db
        .collectionGroup('Depositos')
        .where('status', '==', 'pendente')
        .limit(50)
        .get();

      if (depositosSnap.empty) {
        console.log('✅ Nenhum depósito pendente');
        return null;
      }

      for (const depDoc of depositosSnap.docs) {
        const dep = depDoc.data();

        const userRef = depDoc.ref.parent.parent;
        if (!userRef) continue;

        const uid = userRef.id;
        const valor = Number(dep.valor || 0);

        if (!uid || valor <= 0) continue;

        const saldoRef = db.collection('UsuariosPrivado').doc(uid);

        await db.runTransaction(async (tx) => {
          const saldoSnap = await tx.get(saldoRef);
          const saldoAtual = saldoSnap.exists
            ? saldoSnap.data().saldo || 0
            : 0;

          tx.set(
            saldoRef,
            {
              saldo: saldoAtual + valor,
              atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          tx.update(depDoc.ref, {
            status: 'confirmado',
            confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          tx.set(
            saldoRef.collection('HistoricoFinanceiro').doc(),
            {
              tipo: 'deposito',
              valor,
              origem: 'pix',
              criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            }
          );
        });

        console.log(`💰 Depósito confirmado | UID: ${uid} | Valor: ${valor}`);
      }

      return null;
    } catch (err) {
      console.error('❌ Erro verificarDepositosPendentes:', err);
      return null;
    }
  });
 exports.comprarComSaldo =
functions.region("southamerica-east1")
.https.onCall(async (data, context) => {

try {

/*
==================================
AUTH GUARD
==================================
*/

if (!context.auth) {
 throw new functions.https.HttpsError(
   "unauthenticated"
 );
}

const uid = context.auth.uid;

const { cartelas, nomeComprador } = data;

/*
==================================
VALIDATION SAFE
==================================
*/

if (!Array.isArray(cartelas) || cartelas.length === 0) {
 throw new functions.https.HttpsError(
   "invalid-argument",
   "Cartelas inválidas"
 );
}

if (!nomeComprador || typeof nomeComprador !== "string") {
 throw new functions.https.HttpsError(
   "invalid-argument",
   "Nome inválido"
 );
}

/*
==================================
USER LOAD SAFE
==================================
*/

const userRef =
db.collection("UsuariosPrivado").doc(uid);

const userSnap = await userRef.get();

if (!userSnap.exists){
 throw new functions.https.HttpsError(
   "not-found"
 );
}

const userData = userSnap.data() || {};

/*
==================================
KYC CHECK
==================================
*/

if((userData.kycNivel || 0) < 2){
 throw new functions.https.HttpsError(
   "failed-precondition",
   "KYC insuficiente"
 );
}

/*
==================================
PRICE SNAPSHOT
==================================
*/

const statusSnap =
await db.collection("StatusSorteio")
.doc("geral")
.get();

const precoUnitario =
Number(statusSnap.data()?.precoCartela || 0);

if(precoUnitario <= 0){
 throw new functions.https.HttpsError(
   "failed-precondition",
   "Preço inválido"
 );
}

const valorTotal =
precoUnitario * cartelas.length;

/*
==================================
BALANCE CHECK SAFE
==================================
*/

if(Number(userData.saldo || 0) < valorTotal){
 throw new functions.https.HttpsError(
   "failed-precondition",
   "Saldo insuficiente"
 );
}

/*
==================================
FSM ORDER CREATE
==================================
*/

const pedidoRef =
db.collection("Pedidos").doc();

await pedidoRef.set({
 uid,
 nomeComprador,
 cartelas,
 quantidade: cartelas.length,
 precoUnitario,
 valorTotal,
 status:"CRIADO",
 rollbackExecutado:false,
 criadoEm:admin.firestore.FieldValue.serverTimestamp()
});

/*
==================================
QUEUE SAFE PUSH
==================================
*/

const project = process.env.GCP_PROJECT;
const location = "southamerica-east1";
const queue = "compras-cartelas";

const parent =
tasksClient.queuePath(
 project,
 location,
 queue
);

await tasksClient.createTask({

 parent,

 task:{
   httpRequest:{
     httpMethod:"POST",

     url:`https://${location}-${project}.cloudfunctions.net/workerProcessarCompra`,

     headers:{
       "Content-Type":"application/json"
     },

     body:Buffer.from(JSON.stringify({
       pedidoId:pedidoRef.id
     })).toString("base64")
   }
 }

});

return {
 ok:true,
 pedidoId:pedidoRef.id
};

} catch(error){

console.error("COMPRAR SALDO ERROR",error);

if(error instanceof functions.https.HttpsError){
 throw error;
}

throw new functions.https.HttpsError(
 "internal",
 "checkout_kernel_failure"
);

}

});
// ===============================
// CRIAR PIX DE DEPÓSITO
// ===============================
const axios = require("axios");

 exports.criarPixDeposito = functions
  .region("southamerica-east1")
  .https.onCall(async ({ valor }, context) => {
    // 🔒 Verifica autenticação
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Usuário não autenticado");
    }

    // 💰 Validação de valor
    if (!valor || valor < 5) {
      throw new functions.https.HttpsError("invalid-argument", "Valor mínimo R$5");
    }

    const uid = context.auth.uid;

    // 🆔 Gera TXID único
    const txid = `PIX_${uid}_${Date.now()}`;

    // 📄 Referência do depósito
    const depRef = db
      .collection("UsuariosPrivado")
      .doc(uid)
      .collection("Depositos")
      .doc(txid);

    // 💾 Salva como pendente ANTES de criar o PIX
    await depRef.set({
      uid,
      valor,
      txid,
      status: "pendente",
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      // 🧾 Cria pagamento PIX no Mercado Pago
      const response = await axios.post(
        "https://api.mercadopago.com/v1/payments",
        {
          transaction_amount: Number(valor),
          description: "Depósito de saldo",
          payment_method_id: "pix",
          external_reference: txid, // ← essencial para webhook/simulação
          payer: {
            email: "teste@email.com",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data;

      // 🔎 Extrai dados do QR Code com segurança
      const transactionData =
        data?.point_of_interaction?.transaction_data || {};

      return {
        txid,
        qrCode: transactionData.qr_code_base64 || null,
        copiaCola: transactionData.qr_code || null,
      };
    } catch (error) {
      console.error("Erro ao criar PIX:", error.response?.data || error);

      // ❌ Marca como erro no Firestore
      await depRef.update({
        status: "erro",
        erro: error.message,
      });

      throw new functions.https.HttpsError(
        "internal",
        "Falha ao gerar PIX no provedor"
      );
    }
  });

  
/* ===============================
   simularPagamentoPix (ULTRA SAFE)
================================ */
exports.simularPagamentoPix = functions
  .region("southamerica-east1")
  .runWith({
    memory: "256MB",
    timeoutSeconds: 60
  })
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não logado"
      );
    }

    const { txid } = data;

    if (!txid || typeof txid !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "TXID inválido"
      );
    }

    const uid = context.auth.uid;

    const depRef = db
      .collection("UsuariosPrivado")
      .doc(uid)
      .collection("Depositos")
      .doc(txid);

    const userRef =
      db.collection("UsuariosPrivado").doc(uid);

    await db.runTransaction(async (tx) => {

      const depSnap = await tx.get(depRef);

      if (!depSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Pagamento não encontrado"
        );
      }

      const deposito = depSnap.data();

      if (deposito.uid && deposito.uid !== uid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Depósito não pertence ao usuário"
        );
      }

      if (typeof deposito.valor !== "number" || deposito.valor <= 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Valor inválido"
        );
      }

      if (deposito.status === "confirmado") {
        return;
      }

      if (deposito.status !== "pendente") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Depósito não pode ser confirmado"
        );
      }

      /*
      ===============================
      MARCA COMO PROCESSANDO (LOCK)
      ===============================
      */

      tx.update(depRef, {
        status: "processando",
        processandoEm: admin.firestore.FieldValue.serverTimestamp()
      });

      /*
      ===============================
      ATUALIZA SALDO
      ===============================
      */

      tx.update(userRef, {
        saldo: admin.firestore.FieldValue.increment(deposito.valor),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      });

      /*
      ===============================
      CONFIRMA DEPÓSITO
      ===============================
      */

      tx.update(depRef, {
        status: "confirmado",
        confirmadoEm: admin.firestore.FieldValue.serverTimestamp()
      });

      /*
      ===============================
      LEDGER FINANCEIRO
      ===============================
      */

      tx.set(userRef.collection("LedgerFinanceiro").doc(), {
        tipo: "deposito_pix_teste",
        valor: deposito.valor,
        txid,
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
      });

      /*
      ===============================
      LOG GLOBAL (AUDITORIA)
      ===============================
      */

      tx.set(db.collection("FinanceiroLogs").doc(), {
        tipo: "deposito_pix_teste",
        uid,
        valor: deposito.valor,
        txid,
        criadoEm: admin.firestore.FieldValue.serverTimestamp()
      });

    });

    return { ok: true };
  });

  // ===============================
// WEBHOOK PIX (CONFIRMA DEPÓSITO)
// ===============================
exports.webhookPix = functions
  .region("southamerica-east1")
  .https.onRequest(async (req, res) => {
    try {
      const { data } = req.body;

      if (!data?.id) return res.sendStatus(200);
 // ===============================
      const pagamento = await axios.get(
        `https://api.mercadopago.com/v1/payments/${data.id}`,
        {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        }
      );

      const pay = pagamento.data;

      if (pay.status !== "approved") return res.sendStatus(200);

      const txid = pay.external_reference;
      const valor = pay.transaction_amount;

      const snap = await db
        .collectionGroup("Depositos")
        .where("txid", "==", txid)
        .limit(1)
        .get();

      if (snap.empty) return res.sendStatus(404);

      const depDoc = snap.docs[0];
      const deposito = depDoc.data();

      if (deposito.status === "confirmado") return res.sendStatus(200);

      const uid = depDoc.ref.parent.parent.id;
      const saldoRef = db.collection("UsuariosPrivado").doc(uid);

      await db.runTransaction(async (tx) => {
        tx.update(saldoRef, {
          saldo: admin.firestore.FieldValue.increment(valor),
        });

        tx.update(depDoc.ref, {
          status: "confirmado",
          confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(saldoRef.collection("LedgerFinanceiro").doc(), {
          tipo: "deposito_pix",
          valor,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.sendStatus(200);
    } catch (error) {
      console.error("Erro webhook:", error);
      return res.sendStatus(500);
    }
  });


 // ===============================
// SOLICITAR SAQUE PIX
// ===============================
exports.solicitarSaquePix = functions
  .region("southamerica-east1")
  .https.onCall(async ({ valor, chavePix }, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated");

    if (!valor || valor < 10) {
      throw new functions.https.HttpsError("invalid-argument", "Valor mínimo R$10");
    }

    const uid = context.auth.uid;
    const userRef = db.collection("UsuariosPrivado").doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const saldo = userSnap.data().saldo || 0;

      if (saldo < valor) {
        throw new functions.https.HttpsError("failed-precondition", "Saldo insuficiente");
      }

      tx.update(userRef, { saldo: saldo - valor });

      tx.set(userRef.collection("Saques").doc(), {
        valor,
        chavePix,
        status: "pendente",
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(userRef.collection("LedgerFinanceiro").doc(), {
        tipo: "saque_pix",
        valor: -valor,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { ok: true };
  });


// ===============================
// PROCESSAR SAQUES AUTOMÁTICOS
// ===============================
exports.processarSaquesPix = functions
  .region("southamerica-east1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async () => {
    const snap = await db.collectionGroup("Saques").where("status", "==", "pendente").get();

    for (const doc of snap.docs) {
      const saque = doc.data();

      try {
        await axios.post(
          "https://api.mercadopago.com/v1/transfers",
          {
            amount: saque.valor,
            description: "Saque via PIX",
            external_reference: doc.id,
            pix_key: saque.chavePix,
          },
          {
            headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
          }
        );

        await doc.ref.update({
          status: "pago",
          pagoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error("Erro ao pagar saque:", error.message);
      }
    }

    return null;
  });


// ===============================
// 🔌 MOCK DE ENVIO PIX (SUBSTITUIR PELO BANCO REAL)
// ===============================
async function enviarPixBanco({ valor, chavePix, identificador }) {
  // ⚠️ AQUI você integra com:
  // - Mercado Pago
  // - Gerencianet
  // - Asaas
  // - Banco Inter
  // - Banco do Brasil

  // Simulação de sucesso
  return {
    ok: true,
    txid: "PIX_" + identificador,
  };
}

 /* ===============================
    avaliarRiscoAntifraude
  ================================ */
async function avaliarRiscoAntifraude({ uid, pedidoId, ip, deviceId }) {
  let score = 0;

  const pedidosRecentes = await db.collection("Pedidos")
    .where("uid", "==", uid)
    .orderBy("criadoEm", "desc")
    .limit(5)
    .get();

  if (pedidosRecentes.size >= 3) score += 30;

  if (ip) {
    const ipSnap = await db.collection("AntifraudeEventos")
      .where("ip", "==", ip)
      .limit(3)
      .get();
    if (ipSnap.size >= 2) score += 25;
  }

  if (deviceId) score += 20;

  let nivel = "NORMAL";
  if (score >= 70) nivel = "RISCO_ALTO";
  else if (score >= 40) nivel = "SUSPEITO";

  await db.collection("AntifraudeScore").doc(uid).set({
    uid,
    score,
    nivel,
    atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (nivel === "RISCO_ALTO") {
    await db.collection("UsuariosPrivado").doc(uid).set({
      bloqueado: true,
      bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { score, nivel };
}
   /* ===============================
    registrarEventoAntifraude
  ================================ */
  async function registrarEventoAntifraude(payload) {
  await db.collection("AntifraudeEventos").add({
    ...payload,
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });
}
 /* ===============================
    calcularScoreIndicaca
  ================================ */
async function calcularScoreIndicacao({ indicadorUid, indicadoUid, ip, deviceId }) {
  let score = 0;

  // ⚠️ Mesmo IP
  if (await mesmoIP(indicadorUid, indicadoUid, ip)) score += 30;

  // ⚠️ Mesmo device
  if (await mesmoDevice(indicadorUid, indicadoUid, deviceId)) score += 40;

  // ⚠️ Muitas indicações recentes
  if (await excessoIndicacoes(indicadorUid)) score += 20;

  // ⚠️ Conta nova
  if (await contaNova(indicadorUid)) score += 10;

  return score;
   }
  
// ==============================
// Função interna: cria ou atualiza ConfigLGPD
// ==============================
async function criarOuAtualizarConfigLGPD() {
  const ref = db.collection("ConfigLGPD").doc("ATUAL");
  const snap = await ref.get();
  const agora = admin.firestore.FieldValue.serverTimestamp();

  if (!snap.exists) {
    await ref.set({
      versao: String(VERSAO_ATUAL),
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    });

    return { versao: String(VERSAO_ATUAL) };
  }

  const dados = snap.data();

  if (String(dados.versao) !== String(VERSAO_ATUAL)) {
    await ref.update({
      versao: String(VERSAO_ATUAL),
      atualizadoEm: agora,
    });

    return { versao: String(VERSAO_ATUAL) };
  }

  return { versao: String(dados.versao) };
}
// ==============================
// 🔐 inicializarConfigLGPD
// ==============================
exports.inicializarConfigLGPD = functions
  .region("southamerica-east1")
  .https.onCall(async () => {
    try {
      return await criarOuAtualizarConfigLGPD();
    } catch (err) {
      console.error("❌ inicializarConfigLGPD:", err);
      throw new functions.https.HttpsError(
        "internal",
        "Erro ao inicializar ConfigLGPD"
      );
    }
  });
// ==============================
// 🔐 GARANTIA AUTOMÁTICA NO DEPLOY
// ==============================
exports.garantirConfigLGPD = functions
  .region("southamerica-east1")
  .runWith({ timeoutSeconds: 60 })
  .pubsub.schedule("every 24 hours")
  .onRun(async () => {
    try {
      const r = await criarOuAtualizarConfigLGPD();
      console.log("🛡️ garantirConfigLGPD:", r.status);
    } catch (err) {
      console.error("❌ garantirConfigLGPD:", err);
    }
  });
  // ==============================
// 👤 AO CRIAR USUÁRIO → GARANTE LGPD
// ==============================
exports.onUserCreateGarantirLGPD = functions
  .region("southamerica-east1")
  .auth.user()
  .onCreate(async () => {
    try {
      const r = await criarOuAtualizarConfigLGPD();
      console.log("👤 LGPD onCreate:", r.status);
    } catch (err) {
      console.error("❌ LGPD onCreate:", err);
    }
  });

/* ===============================
   registrarAceiteLgpd (COMPLETA)
================================ */
exports.registrarAceiteLgpd = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    try {
      const uid = context.auth.uid;
      const agora = admin.firestore.FieldValue.serverTimestamp();

      // ==============================
      // Lê Configuração LGPD
      // ==============================
      const configRef = db.collection("ConfigLGPD").doc("ATUAL");
      const configSnap = await configRef.get();

      if (!configSnap.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Configuração LGPD não encontrada."
        );
      }

      const config = configSnap.data();
      if (!config?.ativo) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Termo LGPD desativado"
        );
      }

      const versao = String(config.versao || "1.0");
      const origem = String(data?.origem || "desconhecida");
      const device = String(data?.device || "unknown");

      // ==============================
      // IP e User-Agent
      // ==============================
      const ip =
        context.rawRequest?.headers["x-forwarded-for"] ||
        context.rawRequest?.ip ||
        "0.0.0.0";

      const userAgent =
        context.rawRequest?.headers["user-agent"] || "unknown";

      // ==============================
      // Referência do usuário privado
      // ==============================
      const userRef = db.doc(`UsuariosPrivado/${uid}`);
      const userSnap = await userRef.get();

      const email = userSnap.exists
        ? userSnap.data()?.email || "desconhecido"
        : "desconhecido";

      // ⛔ Já aceitou a mesma versão
      if (
        userSnap.exists &&
        userSnap.data()?.consentimentoLGPD?.aceito === true &&
        userSnap.data()?.consentimentoLGPD?.versao === versao
      ) {
        return { status: "already_accepted", versao };
      }

      // ==============================
      // Hash de auditoria
      // ==============================
      const hash = crypto
        .createHash("sha256")
        .update(`${uid}|${versao}|${Date.now()}|${ip}|${device}`)
        .digest("hex");

      // ==============================
      // Auditoria LGPD
      // ==============================
      await db.collection("AuditoriaLGPD").add({
        uid,
        email,
        versao,
        origem,
        device,
        ip,
        userAgent,
        aceitoEm: agora,
        hash,
      });

    // ==============================
      // Salva consentimento no usuário
      // ==============================
      await userRef.set({
        consentimentoLGPD: {
          aceito: true,
          versao,
          dataAceite: agora,
          origem,
          device,
          ip,
          userAgent,
          hashAuditoria: hash,
        },
      }, { merge: true });

      return { status: "accepted", versao, hash };

    } catch (err) {
      console.error("❌ registrarAceiteLgpd:", err);
      throw new functions.https.HttpsError(
        "internal",
        "Erro ao registrar aceite LGPD"
      );
    }
  });


 /* ===============================
   gerarPdfLegal (LGPD)
================================ */
exports.gerarPdfLegal = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    const uid = context.auth.uid;

    /* ===============================
       BUSCA USUÁRIO
    ================================ */
    const userRef = db.collection("UsuariosPrivado").doc(uid);
const userSnap = await userRef.get();

if (!userSnap.exists || userSnap.data()?.lgpd?.aceito !== true) {
  throw new functions.https.HttpsError(
    "failed-precondition",
    "LGPD não aceita"
  );
}

const lgpd = userSnap.data().lgpd;
const versaoTermo = lgpd.versao || "1.0";

    /* ===============================
       PREPARAÇÃO PDF
    ================================ */
    const pdfDoc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = new PassThrough();
    pdfDoc.pipe(stream);

    /* ===============================
       CABEÇALHO
    ================================ */
    pdfDoc
      .fontSize(18)
      .text("TERMO DE CONSENTIMENTO LGPD", { align: "center" })
      .moveDown(1);

    pdfDoc
      .fontSize(11)
      .text(`Versão do termo: ${versaoTermo}`, { align: "center" })
      .moveDown(2);

    pdfDoc
      .fontSize(12)
      .text(
        "Este documento comprova o consentimento expresso do titular para o tratamento de dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
        { align: "justify" }
      )
      .moveDown(2);

    /* ===============================
       DADOS DO TITULAR
    ================================ */
    pdfDoc.fontSize(12);
    pdfDoc.text(`Nome: ${user.nome || "Não informado"}`);
    pdfDoc.text(`Email: ${user.email || "Não informado"}`);
    pdfDoc.text(`UID: ${uid}`);

    const aceiteEm = user.consentimentoLGPD.aceitoEm?.toDate
      ? user.consentimentoLGPD.aceitoEm.toDate().toLocaleString("pt-BR")
      : "Data indisponível";

    pdfDoc.text(`Data do aceite: ${aceiteEm}`);
    pdfDoc.text(`Endereço IP: ${user.consentimentoLGPD.ip || "Não informado"}`);
    pdfDoc.text(
      `Dispositivo: ${user.consentimentoLGPD.device || "Não informado"}`
    );

    pdfDoc.moveDown(2);

    /* ===============================
       TEXTO LEGAL
    ================================ */
    pdfDoc.fontSize(11).text(
      `
O titular declara ciência e concordância com a coleta, armazenamento,
tratamento e eventual compartilhamento de seus dados pessoais, estritamente
para fins operacionais, de segurança, antifraude, financeiros e cumprimento
de obrigações legais e regulatórias.

Os dados não serão comercializados, nem utilizados para finalidades diversas
das aqui descritas, exceto quando exigido por autoridade legal competente.

Este consentimento poderá ser revogado a qualquer momento, respeitadas as
obrigações legais aplicáveis.
      `,
      { align: "justify" }
    );

    pdfDoc.moveDown(3);

    /* ===============================
       ASSINATURA DIGITAL
    ================================ */
    const assinaturaDigital = `${uid.substring(0, 8)}-${Date.now()}`;

    pdfDoc.fontSize(11).text(`Assinatura digital: ${assinaturaDigital}`);
    pdfDoc.moveDown(1);

    pdfDoc.text(
      "Documento gerado automaticamente pelo sistema, com validade jurídica.",
      { align: "center" }
    );

    pdfDoc.end();

    /* ===============================
       COLETA PDF + HASH
    ================================ */
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      stream.on("end", async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);

          const hash = crypto
            .createHash("sha256")
            .update(pdfBuffer)
            .digest("hex");

          /* ===============================
             SALVAR NO STORAGE
          ================================ */
          const bucket = admin.storage().bucket();
          const filePath = `lgpd/${uid}/termo-v${versaoTermo}-${Date.now()}.pdf`;

          await bucket.file(filePath).save(pdfBuffer, {
            contentType: "application/pdf",
            metadata: {
              metadata: {
                uid,
                versao: versaoTermo,
                hash,
              },
            },
          });

          /* ===============================
             REGISTRO HISTÓRICO
          ================================ */
          await db.collection("HistoricoLGPD").add({
            uid,
            versao: versaoTermo,
            hashPdf: hash,
            storagePath: filePath,
            ip: user.consentimentoLGPD.ip || null,
            device: user.consentimentoLGPD.device || null,
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });

          resolve({
            base64: pdfBuffer.toString("base64"), // mantém compatibilidade
            hash,
            versao: versaoTermo,
            nomeArquivo: `termo-lgpd-${uid}.pdf`,
            mimeType: "application/pdf",
          });
        } catch (err) {
          console.error("Erro PDF LGPD:", err);
          reject(
            new functions.https.HttpsError(
              "internal",
              "Erro ao gerar documento LGPD"
            )
          );
        }
      });

      stream.on("error", (err) => {
        console.error("Stream PDF:", err);
        reject(
          new functions.https.HttpsError(
            "internal",
            "Erro no stream do PDF"
          )
        );
      });
    });
  });
