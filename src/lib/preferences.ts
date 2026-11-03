import fs from "node:fs";
import path from "node:path";
import { configDir } from "../config";

const file = path.join(configDir, "preferences.json");
export const readCloseOnOpen = (): boolean => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")).closeOnOpen === true; }
  catch { return false; }
};
