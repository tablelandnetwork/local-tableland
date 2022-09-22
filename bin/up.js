#!/usr/bin/env node
import { LocalTableland } from "./main.js";
import { getConfigFile } from "./util.js";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
const argv = yargs(hideBin(process.argv)).options({
    upgrade: {
        type: "boolean",
        default: false,
        alias: "u",
        description: "Update your Validator and Registry repositories.\n" +
            "If your Validator or Registry is located outside\n" +
            "this project this command will not do anything."
    },
    validator: {
        type: "string",
        description: "Path the the Tableland Validator repository"
    },
    registry: {
        type: "string",
        description: "Path the the Tableland Registry contract repository"
    },
    verbose: {
        type: "boolean",
        default: false,
        description: "Output verbose logs to stdout"
    }
}).argv;
const go = async function () {
    const config = await getConfigFile();
    const tableland = new LocalTableland(config);
    // TODO: I think listening for SIGQUIT might break windows.
    //       Need to get access to a windows machine and test.
    process.on("SIGINT", async () => await tableland.shutdown());
    process.on("SIGQUIT", async () => await tableland.shutdown());
    await tableland.start(argv);
};
// start a tableland network, then catch any uncaught errors and exit loudly
go().catch((err) => {
    console.error("unrecoverable error");
    console.error(err);
    process.exit();
});
//# sourceMappingURL=up.js.map