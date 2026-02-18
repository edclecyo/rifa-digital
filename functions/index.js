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

admin.initializeApp();
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
const TOTAL_CARTELAS = 1600;
const NUMEROS_POR_CARTELA = 6;
const LIMITE_BATCH = 500;
const TEMPO_RESERVA_MS = 15 * 60 * 1000; // 15 minutos
const VALOR_CARTELA = 2.5;

// Versão inicial da configuração LGPD
const VERSAO_INICIAL = "1.0";
const VERSAO_ATUAL = "1.0";

const REGRAS_PREMIOS = [
  { limite: 200, valor: 50 },
  { limite: 300, valor: 100 },
  { limite: 500, valor: 250 },
  { limite: 1000, valor: 500 },
];

const GRANDE_PREMIO = { cartelas: 10000, valor: 5000 };

/* ===============================
   METAS
================================ */
const METAS = [
  { cartelas: 100, premio: 100, nivel: "vermelho" },
  { cartelas: 500, premio: 500, nivel: "verde" },
  { cartelas: 1000, premio: 1000, nivel: "dourado" },
];
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
  adminForcarRollback
================================ */
exports.adminForcarRollback = functions.https.onCall(
  async ({ pedidoId, motivo }, context) => {
    exigirAdmin(context);

    const pedidoRef = db.collection('Pedidos').doc(pedidoId);
    const snap = await pedidoRef.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found');

    const pedido = snap.data();
    if (pedido.status === 'ROLLBACK_EXECUTADO') return;

    await rollbackPedidoFinanceiro({
      uid: pedido.uid,
      pedidoId,
      motivo: motivo || 'Admin',
    });

    return { success: true };
  }
);
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
exports.checarPremios = functions
  .region("southamerica-east1")
  .https.onCall(async (_, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Usuário não autenticado"
      );
    }

    const lockRef = db.collection("Locks").doc("checarPremios");
    const lockSnap = await lockRef.get();
    if (lockSnap.exists && lockSnap.data().ativo) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Função já está em execução"
      );
    }

    await lockRef.set({
      ativo: true,
      iniciadoEm: admin.firestore.FieldValue.serverTimestamp(),
      uid: context.auth.uid,
    });

    try {
      // 🔹 Status atual da rodada
      const statusRef = db.collection("StatusSorteio").doc("geral");
      const statusSnap = await statusRef.get();
      const rodadaAtual = statusSnap.exists ? statusSnap.data().rodada || 1 : 1;
      const ultimaMetaProcessada = statusSnap.exists ? statusSnap.data().ultimaMetaProcessada || 0 : 0;

      // 🔹 Total de cartelas vendidas nesta rodada
      const cartelasSnap = await db
        .collection("Cartelas")
        .where("rodada", "==", rodadaAtual)
        .where("status", "==", "vendido")
        .get();
      const totalVendidas = cartelasSnap.size;

      // 🔹 Mini prêmios proporcionais
      const premiosParaDistribuir = [];
      for (const regra of REGRAS_PREMIOS) {
        const qtdPremios = Math.floor(totalVendidas / regra.limite);
        const qtdPrev = Math.floor(ultimaMetaProcessada / regra.limite);
        const vezes = qtdPremios - qtdPrev;

        for (let i = 0; i < vezes; i++) {
          premiosParaDistribuir.push({ tipo: "mini", valor: regra.valor, limite: regra.limite });
        }
      }

      // 🔹 Grande prêmio proporcional (só dispara quando atingido)
      const grandePremioRef = db.collection("Rodadas").doc(`${rodadaAtual}_grandePremio`);
      const grandePremioSnap = await grandePremioRef.get();
      if (totalVendidas >= GRANDE_PREMIO.cartelas && !grandePremioSnap.exists) {
        premiosParaDistribuir.push({ tipo: "grande", valor: GRANDE_PREMIO.valor });
        await grandePremioRef.set({ entregue: true });
      }

      // Atualiza última meta processada
      await statusRef.update({ ultimaMetaProcessada: totalVendidas });

      // 🔹 Distribuição de prêmios por batch para escalabilidade
      const usuariosSnap = await db.collection("UsuariosPrivado").get();
      const usuarios = usuariosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const batchSize = 500; // limite do Firestore
      let batch = db.batch();
      let count = 0;

      for (const premio of premiosParaDistribuir) {
        if (usuarios.length === 0) break;

        // Sorteia usuário proporcionalmente às suas cartelas vendidas
        const vencedorIndex = Math.floor(Math.random() * usuarios.length);
        const vencedor = usuarios[vencedorIndex];

        const userRef = db.collection("UsuariosPrivado").doc(vencedor.id);
        const novoSaldo = (vencedor.premios || 0) + premio.valor;
        batch.set(userRef, { premios: novoSaldo }, { merge: true });

        // Histórico individual
        const historicoRef = userRef.collection("HistoricoPremios").doc();
        batch.set(historicoRef, {
          rodada: rodadaAtual,
          tipo: premio.tipo,
          valor: premio.valor,
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Opcional: remover vencedor do array para evitar repetição
        // usuarios.splice(vencedorIndex, 1);

        count++;
        if (count % batchSize === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      // Commit final
      if (count % batchSize !== 0) {
        await batch.commit();
      }

      return { success: true, rodada: rodadaAtual, premiosDistribuidos: premiosParaDistribuir };

    } catch (error) {
      console.error("Erro em checarPremios:", error);
      throw new functions.https.HttpsError("internal", error.message || "Erro ao checar prêmios");
    } finally {
      // 🔓 Libera lock
      await lockRef.set(
        { ativo: false, finalizadoEm: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
  });

/* ===============================
  adminAjustarSaldo
================================ */
exports.adminAjustarSaldo = functions.https.onCall(
  async ({ uid, valor, motivo }, context) => {
    exigirAdmin(context);

    const ref = db.collection('UsuariosPrivado').doc(uid);

    await db.runTransaction(async tx => {
      tx.update(ref, {
        saldo: admin.firestore.FieldValue.increment(valor),
      });

      tx.set(ref.collection('LedgerFinanceiro').doc(), {
        tipo: 'ajuste_admin',
        valor,
        motivo,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { success: true };
  }
);
/* ===============================
  adminBloquearUsuario
================================ */
exports.adminBloquearUsuario = functions.https.onCall(
  async ({ uid, bloqueado }, context) => {
    exigirAdmin(context);

    await db.collection('UsuariosPrivado').doc(uid).set({
      bloqueado,
      bloqueadoEm: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true };
  }
);
/* ===============================
   ENQUEUE COMPRA (Cloud Tasks)
================================ */
async function enqueueCompraTask({ uid, cartelas, nomeComprador, compraId }) {
  const project = process.env.GCP_PROJECT;
  const location = 'southamerica-east1';
  const queue = 'compras-cartelas';
  const url = `https://${location}-${project}.cloudfunctions.net/workerProcessarCompra`;

  const payload = { uid, cartelas, nomeComprador, compraId };

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    },
  };

  const parent = tasksClient.queuePath(project, location, queue);
  await tasksClient.createTask({ parent, task });
}

exports.processarFila = onDocumentCreated("fila/{id}", async (event) => {
  const id = event.params.id;

  await db.runTransaction(async (t) => {
    const pedidoRef = db.collection("pedidos").doc(id);
    const pedido = await t.get(pedidoRef);

    if (!pedido.exists) return;

    const { cartelas, userId } = pedido.data();

    for (const n of cartelas) {
      const cRef = db.collection("cartelas").doc(String(n));
      const cDoc = await t.get(cRef);

      if (!cDoc.exists || !cDoc.data().disponivel) {
        t.update(pedidoRef, { status: "erro" });
        return;
      }

      t.update(cRef, { disponivel: false, owner: userId });
    }

    t.update(pedidoRef, { status: "pago" });
  });
});

/* ===============================
   CRIAR CARTELAS AUTOMÁTICO
================================ */
exports.criarCartelasAutomatico = functions
  .region("southamerica-east1")
  .https.onCall(async (_, context) => {
    /* ===============================
       🔐 VERIFICA AUTENTICAÇÃO / ADMIN
    =============================== */
    if (
      !context.auth ||
      (context.auth.uid !== SUPER_ADMIN_UID &&
        context.auth.token.admin !== true)
    ) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Acesso negado"
      );
    }

    /* ===============================
       🔒 LOCK GLOBAL ANTI-DUPLICAÇÃO
    =============================== */
    const lockRef = db.collection("Locks").doc("criarCartelas");

    const lockSnap = await lockRef.get();
    if (lockSnap.exists && lockSnap.data().ativo === true) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Geração já está em andamento"
      );
    }

    await lockRef.set({
      ativo: true,
      iniciadoEm: admin.firestore.FieldValue.serverTimestamp(),
      uid: context.auth.uid,
    });

    try {
      /* ===============================
         📊 STATUS DA RODADA
      =============================== */
      const statusRef = db.collection("StatusSorteio").doc("geral");
      const statusSnap = await statusRef.get();

      const rodadaAtual = statusSnap.exists
        ? statusSnap.data().rodada || 1
        : 1;

      /* ===============================
         🎟️ CARTELAS EXISTENTES
      =============================== */
      const cartelasRef = db.collection("Cartelas");

      const existentesSnap = await cartelasRef
        .where("rodada", "==", rodadaAtual)
        .get();

      const existentes = existentesSnap.docs.map((d) => d.id);

      if (existentes.length >= TOTAL_CARTELAS) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Limite de cartelas atingido"
        );
      }

      /* ===============================
         🏗️ CRIAÇÃO EM BATCH
      =============================== */
      let batch = db.batch();
      let count = 0;
      const codigosUsados = new Set(existentes);

      for (let i = 1; i <= TOTAL_CARTELAS; i++) {
        const id = `C${i.toString().padStart(4, "0")}`;
        if (codigosUsados.has(id)) continue;

        const numeros = [];
        while (numeros.length < NUMEROS_POR_CARTELA) {
          const n = Math.floor(Math.random() * 60) + 1;
          if (!numeros.includes(n)) numeros.push(n);
        }

        batch.set(cartelasRef.doc(id), {
          codigo: i,
          numeros,
          rodada: rodadaAtual,
          status: "disponivel",
          reservadaPor: null,
          reservaExpiraEm: null,
          nomeComprador: "",
          criadaEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        codigosUsados.add(id);
        count++;

        if (count % LIMITE_BATCH === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      // 🔐 evita commit vazio
      if (count % LIMITE_BATCH !== 0) {
        await batch.commit();
      }

      /* ===============================
         🔔 ATUALIZA STATUS DO SORTEIO
      =============================== */
      await atualizarStatusSorteio(0);

      const statusAtualSnap = await statusRef.get();
      const statusAtual = statusAtualSnap.exists ? statusAtualSnap.data() : {};

      /* ===============================
         🎯 METAS / SORTEIOS AUTOMÁTICOS
      =============================== */
      for (const meta of METAS) {
        if (
          statusAtual.cartelasVendidas >= meta.cartelas &&
          (statusAtual.ultimaMetaProcessada || 0) < meta.cartelas
        ) {
          await sortearPremio(meta.premio, meta.nivel, rodadaAtual);

          await statusRef.update({
            ultimaMetaProcessada: meta.cartelas,
          });
        }
      }

      /* ===============================
         ✅ RETORNO
      =============================== */
      return {
        success: true,
        rodada: rodadaAtual,
        criadas: count,
      };
    } catch (error) {
      console.error("❌ Erro criarCartelasAutomatico:", error);

      throw new functions.https.HttpsError(
        "internal",
        error.message || "Erro ao criar cartelas"
      );
    } finally {
      /* ===============================
         🔓 LIBERA LOCK GLOBAL
      =============================== */
      await lockRef.set(
        {
          ativo: false,
          finalizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
/* ===============================
   reservarCartelas
================================ */
exports.reservarCartelas = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login necessário");
    }

    const uid = context.auth.uid;
    const { cartelas, acao } = data;

    if (!Array.isArray(cartelas) || cartelas.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Cartelas inválidas");
    }

    if (cartelas.length > 20) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Máximo de 20 cartelas por reserva"
      );
    }

    const agora = Date.now();
    const expiraEm = new Date(agora + 5 * 60 * 1000); // ⏱️ 5 minutos

    const reservaRef = db.collection("Reservas").doc();

    await db.runTransaction(async (tx) => {
      const cartelaRefs = cartelas.map((id) =>
        db.collection("Cartelas").doc(id)
      );

      const snaps = await Promise.all(cartelaRefs.map((ref) => tx.get(ref)));

      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];

        if (!snap.exists) {
          throw new functions.https.HttpsError(
            "not-found",
            `Cartela ${cartelas[i]} não existe`
          );
        }

        const c = snap.data();

        // 🚫 já vendida
        if (c.status === "vendida") {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `Cartela ${cartelas[i]} já vendida`
          );
        }

        // =====================================================
        // 🔄 CANCELAR RESERVA (clicou novamente na própria)
        // =====================================================
        if (acao === "cancelar") {
          if (c.reservadaPor === uid) {
            tx.update(cartelaRefs[i], {
              status: "disponivel",
              reservadaPor: null,
              reservaExpiraEm: null,
            });
          }

          continue;
        }

        // =====================================================
        // 🟡 RESERVAR
        // =====================================================

        // ⏳ reservada por outro usuário ainda válida
        if (
          c.status === "reservada" &&
          c.reservaExpiraEm?.toMillis() > agora &&
          c.reservadaPor !== uid
        ) {
          throw new functions.https.HttpsError(
            "aborted",
            `Cartela ${cartelas[i]} já reservada`
          );
        }

        // 🔐 trava cartela
        tx.update(cartelaRefs[i], {
          status: "reservada",
          reservadaPor: uid,
          reservaExpiraEm: expiraEm,
        });
      }

      // cria reserva SOMENTE se ação for reservar
      if (acao !== "cancelar") {
        tx.set(reservaRef, {
          uid,
          cartelas,
          status: "ativa",
          criadaEm: admin.firestore.FieldValue.serverTimestamp(),
          expiraEm,
        });
      }
    });

    return {
      ok: true,
      expiraEm,
    };
  });

/* ===============================
   limparReservasExpiradas
================================ */
exports.limparReservasExpiradas = functions
  .region("southamerica-east1")
  .pubsub.schedule("* * * * *")
  .onRun(async () => {
    const agora = new Date();

    const snap = await db
      .collection("Reservas")
      .where("status", "==", "ativa")
      .where("expiraEm", "<=", agora)
      .get();

    if (snap.empty) return null;

    const batch = db.batch();

    for (const docSnap of snap.docs) {
      const reserva = docSnap.data();

      for (const id of reserva.cartelas) {
        const ref = db.collection("Cartelas").doc(id);

        batch.update(ref, {
          status: "disponivel",
          reservadaPor: null,
          reservaExpiraEm: null,
        });
      }

      batch.update(docSnap.ref, {
        status: "expirada",
      });
    }

    await batch.commit();

    console.log(`🧹 Reservas expiradas limpas: ${snap.size}`);

    return null;
  });


exports.criarCheckout = functions
  .region("southamerica-east1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login necessário");
    }

    const uid = context.auth.uid;
    const { cartelas = [], nomeComprador } = data;

    if (!Array.isArray(cartelas) || cartelas.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Cartelas inválidas");
    }

    if (cartelas.length > 50) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Limite de 50 cartelas por compra"
      );
    }

    const VALOR_CARTELA = 2.5;
    const total = cartelas.length * VALOR_CARTELA;

    const userRef = db.collection("UsuariosPrivado").doc(uid);
    const pedidoRef = db.collection("Pedidos").doc();
    const rankingRef = db.collection("RankingCompradores").doc(uid);
    const historicoUserRef = userRef.collection("HistoricoCartelas");

    await db.runTransaction(async (tx) => {
      /* ================= TODOS OS READS PRIMEIRO ================= */

      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Usuário não encontrado");
      }

      const rankingSnap = await tx.get(rankingRef);

      const cartelaRefs = cartelas.map((id) => db.collection("Cartelas").doc(id));
      const cartelaSnaps = [];

      for (let i = 0; i < cartelaRefs.length; i++) {
        const snap = await tx.get(cartelaRefs[i]);

        if (!snap.exists) {
          throw new functions.https.HttpsError("not-found", `Cartela ${cartelas[i]} não existe`);
        }

        const c = snap.data();

        if (c.status !== "reservada" || c.reservadaPor !== uid) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            `Cartela ${cartelas[i]} não reservada por você`
          );
        }

        cartelaSnaps.push({ ref: cartelaRefs[i], data: c });
      }

      /* ================= VALIDAÇÃO DE SALDO ================= */

      const userData = userSnap.data() || {};

      let saldoDeposito = Number(userData.saldo || 0);
      let saldoCompart = Number(userData?.compartilhamento?.saldo || 0);

      let saldoPremios = 0;
      if (typeof userData.premios === "number") saldoPremios = userData.premios;
      else if (typeof userData.premios?.saldo === "number") saldoPremios = userData.premios.saldo;

      const saldoTotal = saldoDeposito + saldoCompart + saldoPremios;

      if (saldoTotal < total) {
        throw new functions.https.HttpsError("failed-precondition", "Saldo insuficiente");
      }

      /* ================= CÁLCULO DE DÉBITO ================= */

      let restante = total;

      const usar = (saldo) => {
        const usado = Math.min(restante, saldo);
        restante -= usado;
        return saldo - usado;
      };

      saldoPremios = usar(saldoPremios);
      saldoCompart = usar(saldoCompart);
      saldoDeposito = usar(saldoDeposito);

      const nomeFinal =
        nomeComprador ||
        userData.nome ||
        context.auth.token.name ||
        "Usuário";

      /* ================= WRITES (SÓ AGORA) ================= */

      tx.update(userRef, {
        saldo: saldoDeposito,
        "compartilhamento.saldo": saldoCompart,
        "premios.saldo": saldoPremios,
      });

      cartelaSnaps.forEach(({ ref, data }, i) => {
        tx.update(ref, {
          status: "vendida",
          reservadaPor: null,
          reservaExpiraEm: null,
          vendidaPor: uid,
          nomeComprador: nomeFinal,
          vendidaEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(historicoUserRef.doc(), {
          cartelaId: cartelas[i],
          numeros: data.numeros || [],
          valor: VALOR_CARTELA,
          rodada: data.rodada,
          compradaEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      tx.set(pedidoRef, {
        uid,
        nomeComprador: nomeFinal,
        cartelas,
        total,
        status: "pago",
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (!rankingSnap.exists) {
        tx.set(rankingRef, {
          nome: nomeFinal,
          quantidade: cartelas.length,
          total,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(rankingRef, {
          nome: nomeFinal,
          quantidade: admin.firestore.FieldValue.increment(cartelas.length),
          total: admin.firestore.FieldValue.increment(total),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    return {
      sucesso: true,
      pedidoId: pedidoRef.id,
      total,
    };
  });
 /* ===============================
     calcularScoreAntifraude
  =============================== */
async function calcularScoreAntifraude({ uid, ip, deviceId, valor }) {
  let score = 0;

  /* ===============================
     MUITAS COMPRAS RÁPIDAS
  =============================== */
  const comprasRecentes = await db.collection("Pedidos")
    .where("uid", "==", uid)
    .where("criadoEm", ">", Date.now() - 5 * 60 * 1000) // 5 min
    .get();

  if (comprasRecentes.size >= 3) score += 25;

  /* ===============================
     MESMO IP EM VÁRIAS CONTAS
  =============================== */
  if (ip) {
    const ipSnap = await db.collection("AntifraudeEventos")
      .where("ip", "==", ip)
      .limit(10)
      .get();

    const uids = new Set(ipSnap.docs.map(d => d.data().uid));
    if (uids.size >= 3) score += 30;
  }

  /* ===============================
     MESMO DEVICE
  =============================== */
  if (deviceId) {
    const deviceSnap = await db.collection("AntifraudeEventos")
      .where("deviceId", "==", deviceId)
      .limit(5)
      .get();

    const uids = new Set(deviceSnap.docs.map(d => d.data().uid));
    if (uids.size >= 2) score += 35;
  }

  /* ===============================
     CONTA NOVA COM VALOR ALTO
  =============================== */
  const userSnap = await db.doc(`UsuariosPrivado/${uid}`).get();
  const criadoEm = userSnap.data()?.criadoEm?.toMillis?.() || 0;

  const contaNova = Date.now() - criadoEm < 24 * 60 * 60 * 1000;

  if (contaNova && valor > 50) score += 40;

  return score;
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
}
/* ===============================
   verificarAntifraude
================================ */
async function verificarAntifraude({
  uid,
  pedidoId,
  ip = null,
  deviceId = null,
}) {
  const JANELA_MS = 30 * 1000; // 30 segundos
  const LIMITE_PEDIDOS = 3;

  // 🔎 Últimos pedidos do usuário
  const pedidosSnap = await db
    .collection("Pedidos")
    .where("uid", "==", uid)
    .orderBy("criadoEm", "desc")
    .limit(5)
    .get();

  if (pedidosSnap.empty) return true;

  const agora = Date.now();

  const recentes = pedidosSnap.docs.filter(doc => {
    const criadoEm = doc.data().criadoEm?.toMillis?.();
    return criadoEm && agora - criadoEm < JANELA_MS;
  });

  // 🧠 Regra antifraude: compras muito rápidas
  if (recentes.length >= LIMITE_PEDIDOS) {
    const eventoRef = db.collection("AntifraudeEventos").doc();

    // 🔒 Evento antifraude imutável
    await eventoRef.set({
      uid,
      pedidoId,
      tipo: "COMPRA_RAPIDA",
      severidade: "MEDIA",
      score: 60,
      janelaMs: JANELA_MS,
      totalPedidos: recentes.length,
      ip,
      deviceId,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      permitido: false,
      motivo: "COMPRA_RAPIDA",
      severidade: "MEDIA",
    };
  }

  return { permitido: true };
}
/* ===============================
   WORKER COMPRA (Cloud Tasks)
================================ */
exports.workerProcessarCompra = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 60 })
  .https.onRequest(async (req, res) => {
    try {
      const { compraId } = req.body;
      if (!compraId) return res.sendStatus(400);

      const pedidoRef = db.collection("Pedidos").doc(compraId);

      await db.runTransaction(async (tx) => {
        const pedidoSnap = await tx.get(pedidoRef);
        if (!pedidoSnap.exists) throw new Error("Pedido não encontrado");

        const pedido = pedidoSnap.data();

        // 🔒 IDEMPOTÊNCIA
        if (pedido.status === "processado") return;

        const { uid, cartelas, valorTotal } = pedido;

        const userRef = db.collection("UsuariosPrivado").doc(uid);
        const saldoSnap = await tx.get(userRef);
const score = await calcularScoreAntifraude({
  uid,
  ip: req.headers["x-forwarded-for"],
  deviceId: req.headers["x-device-id"],
  valor: valorTotal,
});

const risco = classificarRisco(score);

await registrarEventoAntifraude({
  uid,
  ip: req.headers["x-forwarded-for"],
  deviceId: req.headers["x-device-id"],
  score,
  risco,
  pedidoId: compraId,
});

/* ===============================
   RISCO ALTO → CANCELA COMPRA
=============================== */
if (risco === "ALTO") {
  tx.update(pedidoRef, {
    status: "bloqueado_antifraude",
    scoreAntifraude: score,
  });

  await aplicarBloqueioSeNecessario(uid, risco);
  return;
}
        const saldoAtual = saldoSnap.data()?.saldo || 0;

        // 💸 saldo insuficiente → rollback
        if (saldoAtual < valorTotal) {
          tx.update(pedidoRef, {
            status: "falhou",
            motivo: "saldo_insuficiente",
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
          });
          return;
        }

        // 🔒 RESERVA DAS CARTELAS (anti-duplicação global)
        for (const numero of cartelas) {
          const cartelaRef = db.collection("Cartelas").doc(String(numero));
          const cartelaSnap = await tx.get(cartelaRef);

          if (!cartelaSnap.exists || cartelaSnap.data().status === "vendida") {
            tx.update(pedidoRef, {
              status: "falhou",
              motivo: "cartela_indisponivel",
              atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });
            return;
          }

          tx.update(cartelaRef, {
            status: "vendida",
            uid,
            pedidoId: compraId,
            vendidoEm: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 💰 LEDGER NEGATIVO (imutável)
        tx.set(userRef.collection("LedgerFinanceiro").doc(), {
          tipo: "compra_cartelas",
          valor: -valorTotal,
          referencia: compraId,
          status: "confirmado",
          criadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 💰 ATUALIZA SALDO DERIVADO
        tx.update(userRef, {
          saldo: admin.firestore.FieldValue.increment(-valorTotal),
        });

        // 📦 FINALIZA PEDIDO
        tx.update(pedidoRef, {
          status: "processado",
          processadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ workerProcessarCompra:", err);

      /**
       * MUITO IMPORTANTE:
       * retornar 500 faz a Cloud Tasks tentar novamente
       * → retry automático seguro
       */
      return res.sendStatus(500);
    }
  });
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
exports.getFraudesRecentes = functions.https.onCall(async () => {
  const snap = await db.collection("AntifraudeEventos")
    .orderBy("criadoEm", "desc")
    .limit(50)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

/* ===============================
   PROCESSAR COMPRA
================================ */
async function processarCompra({ uid, cartelas, nomeComprador }) {
  const agora = admin.firestore.Timestamp.now();
  const historicoRef = db.collection('Usuarios').doc(uid).collection('HistoricoCartelas');
  const cartelasCompradas = [];
  const CHUNK_SIZE = 500;

  // Divide em chunks para não estourar batch
  for (let i = 0; i < cartelas.length; i += CHUNK_SIZE) {
    const chunk = cartelas.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    const refs = chunk.map(id => db.collection('Cartelas').doc(id));
    const snaps = await db.getAll(...refs);

    for (let j = 0; j < snaps.length; j++) {
      const snap = snaps[j];
      const cartelaId = chunk[j];
      if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Cartela inexistente');

      const c = snap.data();
      if (c.status !== 'reservada' || c.reservadaPor !== uid ||
          (c.reservaExpiraEm && c.reservaExpiraEm.toMillis() < Date.now())
      ) throw new functions.https.HttpsError('failed-precondition', 'Cartela inválida ou reserva expirada');

      batch.update(refs[j], {
        status: 'vendida',
        vendidaPara: uid,
        vendidaEm: agora,
        nomeComprador,
        reservadaPor: null,
        reservaExpiraEm: null,
      });

      batch.set(historicoRef.doc(cartelaId), {
        codigo: c.codigo,
        numeros: c.numeros,
        rodada: c.rodada,
        valor: VALOR_CARTELA,
        status: 'vendida',
        compradaEm: agora,
        userNome: nomeComprador,
      });

      cartelasCompradas.push({ id: cartelaId, valor: VALOR_CARTELA });
    }

    await batch.commit();
  }

  return cartelasCompradas;
}
/* ===============================
   criarPedido
================================ */
exports.criarPedido = functions
  .region("southamerica-east1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login necessário");
    }

    const { cartelas = [], nomeComprador } = data;
    const uid = context.auth.uid;

    if (!cartelas.length) {
      throw new functions.https.HttpsError("invalid-argument", "Cartelas vazias");
    }

    const compraRef = db.collection("Compras").doc();

    await compraRef.set({
      uid,
      cartelas,
      nomeComprador: nomeComprador || "Usuário",
      status: "pendente",
      criadaEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // envia para fila
    await enqueueCompraTask({
      uid,
      cartelas,
      nomeComprador,
      compraId: compraRef.id,
    });

    return { ok: true };
  });

/* ===============================
   workerProcessarPedid
================================ */
exports.workerProcessarPedido = functions.firestore
  .document("Pedidos/{pedidoId}")
  .onUpdate(async (change, context) => {
    const depois = change.after.data();
    const pedidoId = context.params.pedidoId;

    if (depois.status !== "pago" || depois.processado) return;

    const {
      VALOR_CARTELA,
      FUNDO_PREMIO,
      VALOR_INDICACAO,
      CUSTO_APP,
      LUCRO_PLATAFORMA,
    } = require("./financeiro.config");

    const batch = db.batch();

    // 🔹 Criar cartela
    const cartelaRef = db.collection("Cartelas").doc();
    batch.set(cartelaRef, {
      uid: depois.uid,
      pedidoId,
      valorUnitario: VALOR_CARTELA,
      fundoPremio: FUNDO_PREMIO,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔹 Financeiro
    const financeiroRef = db.collection("Financeiro").doc();
    batch.set(financeiroRef, {
      uid: depois.uid,
      pedidoId,
      entrada: VALOR_CARTELA,
      premio: FUNDO_PREMIO,
      indicacao: VALOR_INDICACAO,
      custoApp: CUSTO_APP,
      lucroPlataforma: LUCRO_PLATAFORMA,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 🔹 Atualizar sorteio
    batch.update(db.doc("Sorteios/ativo"), {
      cartelasVendidas: admin.firestore.FieldValue.increment(1),
      fundoPremio: admin.firestore.FieldValue.increment(FUNDO_PREMIO),
    });

    // 🔹 Marcar pedido como processado
    batch.update(change.after.ref, { processado: true });

    await batch.commit();
  });
/* ===============================
   AO CRIAR USUÁRIO → MISSÃO + CÓDIGO COMPARTILHAMENTO SEGURO
================================ */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  const uid = user.uid;
  const agora = admin.firestore.Timestamp.now();
  const expira = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000) // +24h
  );

  // -------------------------------
  // 1️⃣ Criar missão diária
  // -------------------------------
  const missaoRef = db.collection('MissoesAtivas').doc(uid);
  await missaoRef.set({
    meta: 3,
    atual: 0,
    recompensa: '1 cartela grátis',
    tipo: 'diaria',
    criadaEm: agora,
    expiraEm: expira,
  });

  // -------------------------------
  // 2️⃣ Gerar código sequencial de compartilhamento de forma segura
  // -------------------------------
  const contadorRef = db.collection("Contadores").doc("usuariosCompartilhamento");
  let codigo = "";

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(contadorRef);
    let proximo = 1;

    if (snap.exists) {
      proximo = (snap.data().ultimo || 0) + 1;
    }

    if (proximo > 1000000) {
      throw new Error("Limite de códigos atingido (1 milhão)");
    }

    // Atualiza contador
    tx.set(contadorRef, { ultimo: proximo }, { merge: true });

    // Gera código formatado
    codigo = `Rifa${String(proximo).padStart(6, "0")}`;

    // Salva no usuário
    const userRef = db.collection("UsuariosPrivado").doc(uid);
    tx.set(userRef, {
      compartilhamento: {
        codigo,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      saldo: 0,
      scoreAntifraude: 0,
      bloqueado: false,
    }, { merge: true });
  });

  console.log(`🆕 Usuário ${uid} criado | Código de compartilhamento: ${codigo}`);
});
/* ===============================
   registrarCompartilhamentoAposCompra
================================ */
async function registrarCompartilhamentoAposCompra({ indicadoUid }) {
  const indicacaoRef = db.collection("Indicacoes").doc(indicadoUid);
  const hoje = new Date().toISOString().slice(0, 10);

  await db.runTransaction(async (tx) => {
    const indicacaoSnap = await tx.get(indicacaoRef);
    if (!indicacaoSnap.exists) return; // sem indicação

    const indicacao = indicacaoSnap.data();

    // 🔒 Já paga → idempotência
    if (indicacao.pago === true) return;

    const { indicadorUid } = indicacao;

    // 🔒 Anti auto-indicação
    if (indicadorUid === indicadoUid) return;

    const diarioRef = db
      .collection("IndicacoesDiarias")
      .doc(`${indicadorUid}_${hoje}`);

    const diarioSnap = await tx.get(diarioRef);
    const totalPagoHoje = diarioSnap.exists
      ? diarioSnap.data().totalPago || 0
      : 0;

    // ⛔ Limite diário: 3
    if (totalPagoHoje >= 3) return;

    // 💰 Credita saldo
    tx.update(
      db.collection("UsuariosPrivado").doc(indicadorUid),
      {
        saldo: admin.firestore.FieldValue.increment(0.25),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    // 📊 Atualiza controle diário
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

    // 🔐 Marca indicação como paga (NUNCA mais paga)
    tx.update(indicacaoRef, {
      pago: true,
      pagoEm: admin.firestore.FieldValue.serverTimestamp(),
      valorPago: 0.25,
    });

    // 📜 Ledger imutável
    tx.set(
      db
        .collection("UsuariosPrivado")
        .doc(indicadorUid)
        .collection("LedgerFinanceiro")
        .doc(),
      {
        tipo: "indicacao",
        valor: 0.25,
        indicadoUid,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }
    );
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
  exports.calcularSaldoDisponivel = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const uid = context.auth.uid;

  // Pega dados privados do usuário
  const userRef = db.collection("UsuariosPrivado").doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Usuário não encontrado.");
  }

  const userData = userSnap.data();

  // Saldo de depósito
  const saldoDeposito = userData.saldo || 0;

  // Saldo de compartilhamento
  const saldoCompartilhamento = (userData.compartilhamento?.saldo || 0);

  // Saldo de prêmios
  const saldoPremios = (userData.premios?.saldo || 0);

  // Calcula saldo disponível total
  const saldoDisponivel = saldoDeposito + saldoCompartilhamento + saldoPremios;

  return { saldoDisponivel };
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
/* ===============================
   verificarSorteio
================================ */
exports.verificarSorteio = functions.firestore
  .document("Sorteios/ativo")
  .onUpdate(async (change) => {
    const depois = change.after.data();
    const cartelas = depois.cartelasVendidas;

    const controleRef = db.doc("Sorteios/controle");
    const controleSnap = await controleRef.get();

    const ultimo = controleSnap.exists ? controleSnap.data().ultimoSorteioEm : 0;

    let premio = null;
    let limite = null;

    if (cartelas >= ultimo + 500) {
      premio = 500;
      limite = ultimo + 500;
    } else if (cartelas >= ultimo + 100) {
      premio = 100;
      limite = ultimo + 100;
    }

    if (!premio) return;

    const cartelasSnap = await db
      .collection("Cartelas")
      .where("criadoEm", "<=", admin.firestore.Timestamp.fromMillis(Date.now()))
      .get();

    if (cartelasSnap.empty) return;

    const vencedor =
      cartelasSnap.docs[Math.floor(Math.random() * cartelasSnap.docs.length)];

    const batch = db.batch();

    batch.set(db.collection("Premios").doc(), {
      uid: vencedor.data().uid,
      valor: premio,
      cartelasNoMomento: limite,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.set(controleRef, { ultimoSorteioEm: limite }, { merge: true });

    await batch.commit();
  });

/* ===============================
   ATUALIZAR STATUS SORTEIO
================================ */
async function atualizarStatusSorteio(qtdVendidas) {
  const ref = db.collection("StatusSorteio").doc("geral");

  let sorteioParaExecutar = null;

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const atual = snap.exists
      ? snap.data()
      : { rodada: 1, cartelasVendidas: 0, ultimaMetaProcessada: 0 };

    const cartelasVendidas = (atual.cartelasVendidas || 0) + qtdVendidas;

    let nivelSorteio = null;
    let premioSorteio = 0;
    let ultimaMeta = atual.ultimaMetaProcessada || 0;

    for (const meta of METAS) {
      if (cartelasVendidas >= meta.cartelas && ultimaMeta < meta.cartelas) {
        nivelSorteio = meta.nivel;
        premioSorteio = meta.premio;
        ultimaMeta = meta.cartelas;

        // 🔒 Guarda decisão para fora da transaction
        sorteioParaExecutar = {
          rodada: atual.rodada,
          premio: premioSorteio,
          nivel: nivelSorteio,
        };
        break;
      }
    }

    tx.set(
      ref,
      {
        rodada: atual.rodada,
        cartelasVendidas,
        metaAtual: ultimaMeta,
        nivel: nivelSorteio,
        premioAtual: premioSorteio,
        sorteioLiberado: !!sorteioParaExecutar,
        ultimaMetaProcessada: ultimaMeta,
        faltamCartelas: TOTAL_CARTELAS - cartelasVendidas,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  // 🚀 EXECUTA FORA DA TRANSACTION (correto)
  if (sorteioParaExecutar) {
    await sortearPremio(
      sorteioParaExecutar.premio,
      sorteioParaExecutar.nivel,
      sorteioParaExecutar.rodada
    );
  }
}
/* ===============================
   getRankingSemanal
================================ */
exports.getRankingSemanal = functions.https.onCall(async () => {
  return db.collection("Ranking")
    .orderBy("pontuacao", "desc")
    .limit(10)
    .get();
});
/* ===============================
   getDashboardResumo
================================ */
exports.getDashboardResumo = functions
  .region('southamerica-east1')
  .https.onCall(async (_, context) => {

    // 🔐 Apenas admin (ou você pode liberar user)
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated');
    }

    const hoje = new Date().toISOString().slice(0, 10);

    const [
      faturamentoSnap,
      usuariosSnap,
      cartelasSnap,
      fraudeSnap
    ] = await Promise.all([
      db.collection('FinanceiroResumo').doc(hoje).get(),
      db.collection('UsuariosResumo').doc(hoje).get(),
      db.collection('CartelasResumo').doc(hoje).get(),
      db.collection('FraudesIndicacao')
        .where('data', '==', hoje)
        .get(),
    ]);

    return {
      faturamentoHoje: faturamentoSnap.exists ? faturamentoSnap.data().total : 0,
      usuariosAtivos: usuariosSnap.exists ? usuariosSnap.data().ativos : 0,
      cartelasVendidasHoje: cartelasSnap.exists ? cartelasSnap.data().vendidas : 0,
      indicacoesSuspeitas: fraudeSnap.size,
    };
  });
/* ===============================
   SORTEIO AUTOMÁTICO SEGURO + AUDITÁVEL
================================ */
async function sortearPremioSeguro(premio, nivel, rodadaId) {
  const sorteioKey = `rodada_${rodadaId}_${nivel}`;
  const lockRef = db.collection("Locks").doc(sorteioKey);

  await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) return; // 🔒 já sorteado

    /* ===============================
       TOTAL DE CARTELAS VENDIDAS
    =============================== */
    const rodadaRef = db.collection("Rodadas").doc(String(rodadaId));
    const rodadaSnap = await tx.get(rodadaRef);

    const totalVendidas = rodadaSnap.data()?.vendidas || 0;
    if (totalVendidas === 0) return;

    /* ===============================
       GERADOR AUDITÁVEL (SEED + HASH)
    =============================== */
    const timestamp = new Date().toISOString();
    const seed = `rodada:${rodadaId}|nivel:${nivel}|data:${timestamp}`;

    const hash = crypto.createHash("sha256").update(seed).digest("hex");

    const indice = parseInt(hash.substring(0, 8), 16) % totalVendidas;

    /* ===============================
       BUSCA CARTELA PELO ÍNDICE
    =============================== */
    const snap = await tx.get(
      db.collection("Cartelas")
        .where("rodada", "==", rodadaId)
        .where("status", "==", "vendida")
        .orderBy("vendidaEm")
        .limit(indice + 1)
    );

    if (snap.empty) return;

    const vencedora = snap.docs[indice];
    const cartelaData = vencedora.data();

    /* ===============================
       🏆 SALVA GANHADOR OFICIAL
    =============================== */
    const ganhadorRef = db.collection("Ganhadores").doc();

    tx.set(ganhadorRef, {
      uid: cartelaData.uid,
      nome: cartelaData.nomeComprador,
      foto: cartelaData.foto || null,
      valor: premio,
      cartela: vencedora.id,
      rodada: rodadaId,
      nivel,

      seed,   // transparência pública
      hash,   // verificável
      indice, // posição sorteada

      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* ===============================
       REGISTRA SORTEIO
    =============================== */
    tx.set(db.collection("Sorteios").doc(sorteioKey), {
      rodadaId,
      cartelaId: vencedora.id,
      premio,
      nivel,

      seed,
      hash,
      indice,

      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* ===============================
       LOCK DE SEGURANÇA
    =============================== */
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
  /* ===============================
   API — COMPRAR COM SALDO
================================ */
exports.comprarComSaldo = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated");

  const uid = context.auth.uid;
  const { cartelas, nomeComprador } = data;

  if (!Array.isArray(cartelas) || cartelas.length === 0) {
    throw new functions.https.HttpsError("invalid-argument");
  }

  // 🔐 KYC
  const userPrivado = await db.doc(`UsuariosPrivado/${uid}`).get();
  if ((userPrivado.data()?.kycNivel || 0) < 2) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "KYC insuficiente"
    );
  }

  // 🧾 cria pedido (PADRÃO ÚNICO)
  const pedidoRef = db.collection("Pedidos").doc();
  await pedidoRef.set({
    uid,
    nomeComprador,
    cartelas,
    status: "pendente",
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  });

  // ⚡ enqueue Cloud Task
  const project = process.env.GCP_PROJECT;
  const location = "us-central1";
  const queue = "compras-cartelas";

  const parent = tasksClient.queuePath(project, location, queue);

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: `https://${location}-${project}.cloudfunctions.net/workerProcessarCompra`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify({ compraId: pedidoRef.id })).toString("base64"),
    },
  };

  await tasksClient.createTask({ parent, task });

  return { ok: true, pedidoId: pedidoRef.id };
});

 /* ===============================
     rollbackPedidoFinanceiro
  ================================ */
async function rollbackPedidoFinanceiro({ uid, pedidoId, motivo }) {
  const saldoRef = db.collection('UsuariosPrivado').doc(uid);
  const pedidoRef = db.collection('Pedidos').doc(pedidoId);

  await db.runTransaction(async (tx) => {
    const pedidoSnap = await tx.get(pedidoRef);
    if (!pedidoSnap.exists) return;

    const pedido = pedidoSnap.data();

    // 🔒 Evita rollback duplo
    if (pedido.rollbackExecutado) return;

    const valor = pedido.valorTotal;

    // ➕ Devolve saldo
    tx.update(saldoRef, {
      saldo: admin.firestore.FieldValue.increment(valor),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 📊 Ledger reverso
    tx.set(
      saldoRef.collection('LedgerFinanceiro').doc(),
      {
        tipo: 'rollback',
        origem: 'pedido',
        valor,
        referencia: pedidoId,
        motivo,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      }
    );

    // 🧠 Atualiza FSM
    tx.update(pedidoRef, {
      status: 'ROLLBACK_EXECUTADO',
      rollbackExecutado: true,
      rollbackMotivo: motivo,
      rollbackEm: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
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

  
exports.simularPagamentoPix = functions
  .region("southamerica-east1")
  .https.onCall(async ({ txid }, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Usuário não logado");
    }

    if (!txid) {
      throw new functions.https.HttpsError("invalid-argument", "TXID não informado");
    }

    const uid = context.auth.uid;

    const depRef = db
      .collection("UsuariosPrivado")
      .doc(uid)
      .collection("Depositos")
      .doc(txid);

    const depSnap = await depRef.get();

    if (!depSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Pagamento não encontrado");
    }

    const deposito = depSnap.data();

    if (deposito.status === "confirmado") {
      return { ok: true }; // já pago
    }

    const userRef = db.collection("UsuariosPrivado").doc(uid);

    await db.runTransaction(async (tx) => {

      tx.update(userRef, {
        saldo: admin.firestore.FieldValue.increment(deposito.valor),
      });

      tx.update(depRef, {
        status: "confirmado",
        confirmadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(userRef.collection("LedgerFinanceiro").doc(), {
        tipo: "deposito_pix_teste",
        valor: deposito.valor,
        criadoEm: admin.firestore.FieldValue.serverTimestamp(),
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
