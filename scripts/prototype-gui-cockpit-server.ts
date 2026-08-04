// PROTOTYPE tooling — throwaway static server for prototype/gui-cockpit/.
// Not part of the Loop Engine CLI. Serves a single static HTML file with
// mocked data; no real CLI is invoked. See docs/architecture/gui-cockpit.md.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(process.cwd(), "prototype", "gui-cockpit");
const PORT = 4173;

const server = createServer(async (req, res) => {
  const path = req.url === "/" || !req.url ? "/index.html" : req.url;
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`GUI Cockpit prototype running at http://localhost:${PORT}`);
  console.log(`Variants: ?variant=A (split view) | B (cards) | C (dense table)`);
});
