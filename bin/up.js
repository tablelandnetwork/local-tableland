#!/usr/bin/env node
import { main } from "./main";
// start a tableland network
main().catch((err) => {
    console.error("unrecoverable error");
    console.error(err);
    process.exit();
});
//# sourceMappingURL=up.js.map