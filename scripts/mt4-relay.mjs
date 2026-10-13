import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export function decodeJson(buffer) {
  const text =
    buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.subarray(2).toString("utf16le")
      : buffer.toString("utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}
export function deliverCommand(directory, command, now = Date.now()) {
  if (!command) return false;
  if (
    !Number.isInteger(command.id) ||
    command.id <= 0 ||
    command.cmd !== "EXECUTE" ||
    !["BUY", "SELL"].includes(command.side) ||
    !Number.isFinite(command.expires) ||
    command.expires * 1000 < now ||
    command.expires * 1000 > now + 10000
  )
    throw Error("Commande invalide ou expirée");
  const checkpoint = path.join(directory, "Aurum_relay_checkpoint.json");
  const previous = fs.existsSync(checkpoint)
    ? decodeJson(fs.readFileSync(checkpoint)).id
    : 0;
  if (command.id <= previous) return false;
  const target = path.join(directory, "Aurum_command.json");
  if (fs.existsSync(target))
    throw Error("Une commande attend déjà sa consommation par MT4");
  // Checkpoint before publication: an interrupted relay never submits twice.
  fs.writeFileSync(checkpoint + ".tmp", JSON.stringify({ id: command.id }), {
    mode: 0o600,
  });
  fs.renameSync(checkpoint + ".tmp", checkpoint);
  fs.writeFileSync(target + ".tmp", JSON.stringify(command) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(target + ".tmp", target);
  return true;
}
export function refreshCalendar(directory, now = Date.now()) {
  const input = path.join(directory, "news_status.json");
  if (!fs.existsSync(input)) return;
  const news = decodeJson(fs.readFileSync(input)),
    stat = fs.statSync(input);
  if (typeof news.trading_allowed !== "boolean")
    throw Error("news_status.json : trading_allowed doit être booléen");
  const calendar = {
    asOf: Math.floor(stat.mtimeMs / 1000),
    blocked:
      !news.trading_allowed ||
      now - stat.mtimeMs > 300000 ||
      stat.mtimeMs > now + 30000,
    event: String(news.news_risk || "").slice(0, 300),
  };
  const target = path.join(directory, "Aurum_calendar.json");
  fs.writeFileSync(target + ".tmp", JSON.stringify(calendar), { mode: 0o600 });
  fs.renameSync(target + ".tmp", target);
}
export async function runRelay() {
  const endpoint = new URL(process.env.AURUM_URL || "http://localhost:3000");
  if (
    endpoint.protocol !== "https:" &&
    !(
      endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
    )
  )
    throw Error("HTTPS requis pour un serveur distant");
  const token = process.env.MT4_BRIDGE_TOKEN;
  if (!token || token.length < 32)
    throw Error("MT4_BRIDGE_TOKEN requis (32 caractères minimum)");
  const directory =
    process.env.MT4_COMMON_FILES ||
    path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "MetaQuotes",
      "Terminal",
      "Common",
      "Files",
    );
  console.log("Aurum : relais MT4 démarré. Ctrl+C pour arrêter.");
  while (true) {
    try {
      refreshCalendar(directory);
      const file = path.join(directory, "Aurum_status.json"),
        stat = fs.statSync(file);
      if (Date.now() - stat.mtimeMs > 10000) throw Error("État EA périmé");
      const status = decodeJson(fs.readFileSync(file));
      if (status.source !== "aurum-mt4-v1")
        throw Error("Installer AurumBridge.mq4");
      const response = await fetch(new URL("/api/mt4/sync", endpoint), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(status),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok)
        throw Error(
          `Serveur HTTP ${response.status} : vérifier association et clé du pont`,
        );
      const { command } = await response.json();
      deliverCommand(directory, command);
    } catch (e) {
      console.error("Relais :", e.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  runRelay().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
