#!/usr/bin/env node
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
const go = function () {
    return __awaiter(this, void 0, void 0, function* () {
        const config = yield getConfigFile();
        const tableland = new LocalTableland(config);
        // TODO: I think listening for SIGQUIT might break windows.
        //       Need to get access to a windows machine and test.
        process.on("SIGINT", tableland.shutdown.bind(tableland));
        process.on("SIGQUIT", tableland.shutdown.bind(tableland));
        yield tableland.start(argv);
    });
};
// start a tableland network, then catch any uncaught errors and exit loudly
go().catch((err) => {
    console.error("unrecoverable error");
    console.error(err);
    process.exit();
});
//# sourceMappingURL=up.js.map