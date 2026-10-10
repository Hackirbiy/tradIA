import fs from "node:fs";
import path from "node:path";
export function createStore(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "desk.json");
  let state = fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename, "utf8"))
    : {
        cash: 100000,
        halted: false,
        positions: [],
        trades: [],
        analyses: [],
        mode: process.env.DATA_MODE === "live" ? "live" : "demo",
      };
  const mode = process.env.DATA_MODE === "live" ? "live" : "demo";
  if (state.mode !== mode)
    throw Error(
      "This ledger belongs to a different data mode. Use a different DATA_DIR for live and demo modes.",
    );
  return {
    get: () => state,
    save: () => {
      fs.writeFileSync(filename + ".tmp", JSON.stringify(state, null, 2), {
        mode: 0o600,
      });
      fs.renameSync(filename + ".tmp", filename);
    },
  };
}
