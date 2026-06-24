import { createClient } from "@libsql/client";
const db = createClient({ url: "file:C:/Users/W/AppData/Roaming/Electron/xiabao.db" });

// Full provider info
const p = await db.execute("SELECT * FROM providers WHERE id='openai' AND deleted_at IS NULL");
console.log("=== provider ===");
const cols = p.columns; const row = p.rows[0];
for (let i=0;i<cols.length;i++) console.log("  "+cols[i]+":", JSON.stringify(row[i]));

// Models for this provider
const ms = await db.execute("SELECT id, display, enabled FROM models WHERE provider_id='openai' AND deleted_at IS NULL ORDER BY sort_index LIMIT 5");
console.log("=== models (first 5) ===");
console.log(JSON.stringify(ms.rows, null, 2));

// Count
const c = await db.execute("SELECT enabled, count(*) as c FROM models WHERE provider_id='openai' AND deleted_at IS NULL GROUP BY enabled");
console.log("=== enabled count ===", JSON.stringify(c.rows));

await db.close();
