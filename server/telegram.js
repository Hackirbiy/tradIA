// Private-chat access only. Tokens stay in the server environment.
export function telegramReply(message, chatId, snapshot, halt) {
  if (
    !message ||
    message.chat?.type !== "private" ||
    String(message.chat.id) !== String(chatId) ||
    String(message.from?.id) !== String(chatId)
  )
    return null;
  const command = message.text?.trim().split(/\s/)[0]?.split("@")[0];
  if (!["/start", "/help", "/statut", "/juge", "/stop"].includes(command))
    return null;
  if (command === "/start" || command === "/help")
    return "Aurum · XAUUSD\n/statut — compte et protection\n/juge — dernier verdict\n/stop — bloquer les nouvelles entrées MT4";
  if (command === "/stop") {
    if (!halt) return "Pont MT4 non configuré.";
    halt();
    return "Circuit breaker MT4 déclenché. Nouvelles entrées bloquées ; un ordre déjà livré peut avoir été exécuté. Les positions restent protégées par leur SL/TP.";
  }
  const state = snapshot();
  if (state.identity) {
    const f = state.feed,
      d = state.analysis?.decision,
      p = state.analysis?.plan;
    if (command === "/statut")
      return `Aurum · MT4 ${f?.account.demo ? "DÉMO BROKER" : "TERMINAL"}\nFlux : ${state.connected ? "connecté" : "périmé / indisponible"}\nEquity : ${f?.account.equity ?? "—"} ${f?.account.currency || ""}\nPositions : ${f?.positions.length ?? "—"}\nJuge : ${state.armed ? "armé" : "désarmé"}\nCircuit breaker : ${state.halted ? "déclenché" : "surveillance"}\nPerte journalière : ${state.dailyLoss?.toFixed(2) ?? "—"} %`;
    return `XAUUSD · MT4 · ${state.analysis?.engine || "aucune analyse"}\nFlux : ${state.connected ? "connecté" : "périmé / indisponible"}\n${d?.action || "HOLD"} · Confluence ${d?.score?.toFixed(1) ?? "—"} %\nBUY ${d?.buy ?? 0} / SELL ${d?.sell ?? 0} / HOLD ${d?.hold ?? 6}\n${p ? `SL ${p.stop} · TP ${p.target} · R:R 1:${p.rr.toFixed(2)}` : "Aucun plan exécuté"}\n${state.analysis?.execution.reason || ""}`;
  }
  if (command === "/statut")
    return `Aurum · SIMULATION\nSolde : ${state.balance.toFixed(2)} USD\nPositions virtuelles : ${state.orders.filter((o) => o.status === "open").length}\nCoupe-circuit : ${state.halted ? "DÉCLENCHÉ" : "armé"}\nMT4 : non connecté`;
  const d = state.decision;
  return `XAUUSD · DONNÉES SIMULÉES\nJuge : ${d.action} · Confluence ${d.score} %\nBUY ${d.buy} / SELL ${d.sell} / HOLD ${d.hold}\nEntrée : ${d.entry.toFixed(2)}\nSL : ${d.stop.toFixed(2)} · TP : ${d.target.toFixed(2)}\nR:R 1:${d.rr}\n${d.reason}`;
}
export function startTelegram(snapshot, halt) {
  const token = process.env.TELEGRAM_BOT_TOKEN,
    chatId = process.env.TELEGRAM_CHAT_ID;
  const status = { configured: Boolean(token && chatId), connected: false };
  if (!status.configured) return status;
  let offset = 0,
    busy = false;
  const call = async (method, body) => {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw Error("Telegram indisponible");
    const result = await response.json();
    if (!result.ok) throw Error("Telegram indisponible");
    return result.result;
  };
  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      const updates = await call("getUpdates", {
        offset,
        timeout: 0,
        allowed_updates: ["message"],
      });
      status.connected = true;
      for (const update of updates) {
        offset = update.update_id + 1;
        // Old queued commands are not replayed when the service restarts.
        if (Date.now() / 1000 - (update.message?.date || 0) > 60) continue;
        const reply = telegramReply(update.message, chatId, snapshot, halt);
        if (reply) await call("sendMessage", { chat_id: chatId, text: reply });
      }
    } catch {
      status.connected = false;
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(poll, 5000);
  timer.unref();
  void poll();
  return status;
}
