#!/usr/bin/env node

import { main, shutdown } from "./main.js";


// TODO: main should export a constructor and this file should create and start one instance
// start a tableland network
main().catch((err) => {
  console.error("unrecoverable error")
  console.error(err);

  process.exit();
});

process.on("SIGINT", shutdown);
process.on("SIGQUIT", shutdown);
