#!/usr/bin/env node
// The CLI over scripts/server.mjs: run the app from a checkout of this repo.
//
//   node scripts/serve.mjs [app-dir] [port]
import { createIconbenchServer } from './server.mjs';

const server = createIconbenchServer({
  root: process.argv[2],
  storageDir: process.env.STORAGE_DIR,
});

const port = Number(process.env.PORT ?? process.argv[3] ?? 8010);

server.listen(port, () => {
  const { root, storageDir } = server.config;
  console.log(`Serving ${root} at http://localhost:${port}`);
  console.log(`Keeping the icon library in ${storageDir}`);
});
