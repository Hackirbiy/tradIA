import React, { useEffect, useState } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  Link2,
  LockKeyhole,
  ShieldCheck,
  ShieldOff,
  Unplug,
  ArrowUpRight,
} from "lucide-react";
const number = (v, d = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("fr-FR", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      })
    : "—";
export default function Mt4Terminal({ Chart }) {
  const [tf, setTf] = useState("M15");
  const [token, setToken] = useState(""),
    [key, setKey] = useState(""),
    [login, setLogin] = useState(""),
    [server, setServer] = useState(""),
    [desk, setDesk] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(path = "", body, auth = token) {
    const r = await fetch("/api/mt4" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + auth,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error || "Pont indisponible");
    return result;
  }
  async function action(path, body) {
    setBusy(true);
    setError("");
    try {
      setDesk(await request(path, body));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!token) return;
    let active = true;
    const update = () =>
      request()
        .then((s) => {
          if (active) {
            setDesk(s);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    update();
    const timer = setInterval(update, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  if (!token)
    return (
      <section className="panel terminal-login">
        <div className="judge-icon">
          <Link2 size={24} />
        </div>
        <h2>Associer votre terminal MT4</h2>
        <p>
          Connectez-vous d’abord dans MT4 avec le numéro de compte, le serveur
          et le mot de passe de votre broker. Aurum s’associe ensuite au
          terminal déjà connecté.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const state = await request(
                "/pair",
                { login: Number(login), server },
                key,
              );
              setToken(key);
              setKey("");
              setDesk(state);
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Numéro de compte MT4
            <input
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]+"
              placeholder="Votre identifiant MT4"
            />
          </label>
          <label>
            Serveur du broker
            <input
              required
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="Ex. MetaQuotes-Demo"
            />
          </label>
          <label>
            Clé du pont Aurum
            <input
              required
              type="password"
              autoComplete="off"
              minLength={32}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Clé MT4_BRIDGE_TOKEN configurée côté serveur"
            />
          </label>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button disabled={busy} className="button primary full">
            {busy ? "Association…" : "Associer le terminal"}
            <ChevronRight size={16} />
          </button>
        </form>
        <div className="modal-info">
          <LockKeyhole size={16} />
          <span>
            Le mot de passe du broker reste dans MT4. La clé du pont reste en
            mémoire dans cet onglet.
          </span>
        </div>
        <h3>Installation sur votre PC / VPS</h3>
        <div className="bridge-downloads">
          <a
            className="button secondary"
            href="/bridge-files/AurumBridge.mq4"
            download
          >
            EA MT4
          </a>
          <a
            className="button secondary"
            href="/bridge-files/mt4-relay.mjs"
            download
          >
            Relais Windows
          </a>
          <a
            className="button secondary"
            href="/bridge-files/README.md"
            download
          >
            Guide d’installation
          </a>
        </div>
        <ol>
          <li>
            Installez <b>AurumBridge.mq4</b> sur le graphique XAUUSD, à la place
            de l’ancien EA.
          </li>
          <li>
            Lancez le relais <b>mt4-relay.mjs</b> sur le même PC. Il lit les
            fichiers Common\Files.
          </li>
          <li>
            Associez le compte ici. Vérifiez les flux et le calendrier, puis
            armez le juge.
          </li>
        </ol>
        <p>
          Guide et fichiers : dossier <b>mt4/</b> du projet. L’ancien AI Agent
          v12.8 n’exporte pas les bougies requises et n’accepte pas le SL/TP du
          juge.
        </p>
      </section>
    );
  const f = desk?.feed,
    a = desk?.analysis,
    d = a?.decision;
  return (
    <div className="terminal">
      <div className="section-heading">
        <h2>
          <Link2 size={18} />
          Terminal MT4{" "}
          <span className={"pill " + (desk?.connected ? "buy" : "hold")}>
            {desk?.connected ? "Connecté" : "Flux indisponible"}
          </span>
        </h2>
        <button
          className="button secondary"
          onClick={() => {
            setToken("");
            setDesk(null);
          }}
        >
          Masquer la session
          <Unplug size={14} />
        </button>
      </div>
      <p className="terminal-warning">
        Masquer la session ne désarme pas le juge. L’exécution continue côté
        serveur tant que le relais est actif.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {desk?.error && <div className="alert error">{desk.error}</div>}
      <div className="metrics">
        <div className="metric">
          <span>Compte associé</span>
          <strong>{desk?.identity?.login}</strong>
          <div>
            {desk?.identity?.server} ·{" "}
            {f
              ? f.account.demo
                ? "Démo broker"
                : "Compte réel"
              : "En attente du relais"}
          </div>
        </div>
        <div className="metric">
          <span>Equity · {f?.account.currency || "—"}</span>
          <strong>{number(f?.account.equity)}</strong>
          <div>Solde {number(f?.account.balance)}</div>
        </div>
        <div className="metric">
          <span>XAUUSD · Bid / Ask</span>
          <strong>{number(f?.quote.bid)}</strong>
          <div>
            Ask {number(f?.quote.ask)} ·{" "}
            {desk?.connected
              ? "Cotations fraîches"
              : "Ne pas utiliser ces cours"}
          </div>
        </div>
        <div className="metric">
          <span>Perte journalière</span>
          <strong>{number(desk?.dailyLoss)} %</strong>
          <div>
            Limite {desk?.config.maxDailyLoss} % ·{" "}
            {desk?.halted ? "Circuit déclenché" : "Surveillance"}
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <div>
          {Chart && f?.bars[tf]?.length > 0 && (
            <section
              className="panel market-panel"
              style={{ marginBottom: 18 }}
            >
              <div className="chart-toolbar">
                <div className="timeframes">
                  {["M1", "M5", "M15", "H1", "D1"].map((t) => (
                    <button
                      key={t}
                      className={tf === t ? "selected" : ""}
                      onClick={() => setTf(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <span className="push">Bougies clôturées MT4</span>
              </div>
              <Chart
                bars={f.bars[tf]
                  .slice(-64)
                  .map((b) => ({ ...b, time: b.time * 1000 }))}
                tf={tf}
                overlays={false}
                live
              />
            </section>
          )}
          <section className="panel terminal-summary">
            <div className="section-heading">
              <h2>Six spécialistes · {desk?.engine}</h2>
              <span>
                {desk?.busy ? "Analyse en cours…" : "Cycle à chaque clôture M1"}
              </span>
            </div>
            <p>
              Un vote par agent, pondération égale. Les conditions techniques
              restent obligatoires, même avec l’IA connectée.
            </p>
            <div className="agent-grid">
              {(
                a?.agents ||
                ["D1", "H1", "M15", "M5", "M1", "COR"].map((id) => ({
                  id,
                  vote: "HOLD",
                  summary: "En attente des bougies du terminal.",
                  facts: {},
                }))
              ).map((agent) => (
                <details className="agent-card" key={agent.id}>
                  <summary>
                    <span>{agent.id}</span>
                    <span className={"pill " + agent.vote.toLowerCase()}>
                      {agent.vote}
                    </span>
                  </summary>
                  <p>{agent.summary}</p>
                  <div className="live-facts">
                    {Object.entries(agent.facts).map(([name, value]) => (
                      <div key={name}>
                        <b>{name}</b>
                        <span>
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {agent.missing?.length > 0 && (
                    <p>Données manquantes : {agent.missing.join(", ")}</p>
                  )}
                </details>
              ))}
            </div>
          </section>
          <section className="panel terminal-summary">
            <h3>Positions MT4</h3>
            {f?.positions.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Symbole</th>
                      <th>Sens</th>
                      <th>Lots</th>
                      <th>SL</th>
                      <th>TP</th>
                      <th>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.positions.map((p) => (
                      <tr key={p.ticket}>
                        <td>{p.ticket}</td>
                        <td>{p.symbol}</td>
                        <td>{p.type}</td>
                        <td>{p.lots}</td>
                        <td>{number(p.sl)}</td>
                        <td>{number(p.tp)}</td>
                        <td>{number(p.pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Aucune position remontée par le terminal.</p>
            )}
          </section>
          <section className="panel terminal-summary">
            <h3>Ordres du juge et confirmations</h3>
            {desk?.commands.length ? (
              desk.commands.map((c) => (
                <div className="live-command" key={c.command.id}>
                  <b>
                    {c.command.side} · {c.plan.lots} lot
                  </b>
                  <span>
                    {c.status} · #{c.command.id}
                  </span>
                  <p>
                    {c.ack?.reason ||
                      "En attente de confirmation MT4. Ne pas renvoyer cet ordre."}
                  </p>
                  {c.status === "uncertain" && (
                    <div>
                      <p>
                        Vérifiez cet identifiant dans les historiques MT4 et le
                        journal de l’EA avant de choisir :
                      </p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          action("/reconcile", {
                            id: c.command.id,
                            resolution: "execution_verified",
                          })
                        }
                      >
                        Exécution vérifiée dans MT4
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          action("/reconcile", {
                            id: c.command.id,
                            resolution: "no_execution_verified",
                          })
                        }
                      >
                        Absence d’exécution vérifiée
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p>Aucun ordre envoyé.</p>
            )}
          </section>
        </div>
        <div>
          <section className="panel judge-panel">
            <div className="judge-header">
              <div className="judge-icon">
                <Activity size={20} />
              </div>
              <h2>Le juge · automatique</h2>
            </div>
            <div className="judge-body">
              <div className="live-score">
                {number(d?.score, 1)}
                <small> %</small>
              </div>
              <div className="vote-summary">
                {d
                  ? `${d.buy} BUY · ${d.sell} SELL · ${d.hold} HOLD`
                  : "Aucun vote reçu"}
              </div>
              <div className={"verdict " + (d?.action || "HOLD").toLowerCase()}>
                <b>{d?.action || "HOLD"}</b>
                <span className="push">Seuil {desk?.config.threshold} %</span>
              </div>
              <p className="judge-reason">
                {a?.execution.reason ||
                  "Lancez le relais MT4. Le premier cycle démarre automatiquement à réception des données."}
              </p>
              {a?.plan && (
                <div className="trade-plan">
                  <div>
                    <span>Entrée</span>
                    <b>{number(a.plan.entry)}</b>
                  </div>
                  <div>
                    <span>Stop · 1,5 × ATR M5</span>
                    <b>{number(a.plan.stop)}</b>
                  </div>
                  <div>
                    <span>Objectif</span>
                    <b>{number(a.plan.target)}</b>
                  </div>
                  <div>
                    <span>R:R</span>
                    <b>1 : {number(a.plan.rr, 1)}</b>
                  </div>
                  <div>
                    <span>Risque estimé</span>
                    <b>
                      {number(a.plan.riskAmount)} {f?.account.currency}
                    </b>
                  </div>
                </div>
              )}
              <button
                disabled={
                  busy || (!desk?.armed && (!desk?.connected || desk?.halted))
                }
                className="button primary full"
                onClick={() => action("/arm", { enabled: !desk?.armed })}
              >
                {desk?.armed
                  ? "Désarmer le juge"
                  : "Armer l’exécution automatique"}
                <ShieldCheck size={15} />
              </button>
              <p className="judge-reason">
                {desk?.armed
                  ? "Armé : les signaux validés sont envoyés à MT4 sans confirmation manuelle."
                  : "Désarmé : analyses actives, aucune nouvelle entrée."}
              </p>
              <button
                className="button secondary full"
                disabled={busy}
                onClick={() => action(desk?.halted ? "/resume" : "/halt", {})}
              >
                <ShieldOff size={15} />
                {desk?.halted
                  ? "Réinitialiser le coupe-circuit"
                  : "Déclencher le coupe-circuit"}
              </button>
              <p className="judge-note">
                Bloque les nouvelles entrées. SL/TP gérés par MT4.
              </p>
            </div>
          </section>
          <section className="panel terminal-summary">
            <h3>Limites du juge</h3>
            <form
              key={JSON.stringify(desk?.config)}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                action(
                  "/settings",
                  Object.fromEntries([...data].map(([k, v]) => [k, Number(v)])),
                );
              }}
            >
              {[
                ["threshold", "Confluence minimale (%)", 75, 100, 1],
                ["risk", "Risque par ordre (%)", 0.1, 2, 0.1],
                ["rr", "Rendement / risque", 1, 5, 0.1],
                ["maxDailyLoss", "Perte journalière max. (%)", 0.1, 5, 0.1],
                ["maxSpreadPoints", "Spread max. (points)", 1, 100, 1],
              ].map(([name, label, min, max, step]) => (
                <label key={name}>
                  {label}
                  <input
                    name={name}
                    type="number"
                    required
                    min={min}
                    max={max}
                    step={step}
                    defaultValue={desk?.config[name]}
                    disabled={desk?.armed}
                  />
                </label>
              ))}
              <button
                className="button secondary full"
                disabled={busy || desk?.armed}
              >
                Enregistrer
                <Check size={14} />
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
