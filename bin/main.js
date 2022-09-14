/**
 *  Run end to end Tableland
 **/
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _LocalTableland_instances, _LocalTableland__start, _LocalTableland__cleanup;
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import { configGetter, pipeNamedSubprocess, waitForReady } from "./util.js";
import { projectBuilder } from "./project-builder.js";
// TODO: should this be a per instance value?
// store the Validator config file in memory, so we can restore it during cleanup
let ORIGINAL_VALIDATOR_CONFIG;
// TODO: get types sorted out and remove all the `any`s
export class LocalTableland {
    constructor(config) {
        _LocalTableland_instances.add(this);
        this.config = config;
        // an emitter to help with init logic across the multiple sub-processes
        this.initEmitter = new EventEmitter();
    }
    ;
    async start(argv) {
        this.validatorDir = this.validatorDir || await configGetter("Validator project directory", this.config, argv);
        this.registryDir = this.registryDir || await configGetter("Tableland registry contract project directory", this.config, argv);
        this.verbose = this.verbose || await configGetter("Should output a verbose log", this.config, argv);
        await __classPrivateFieldGet(this, _LocalTableland_instances, "m", _LocalTableland__start).call(this);
    }
    ;
    ;
    shutdown() {
        __classPrivateFieldGet(this, _LocalTableland_instances, "m", _LocalTableland__cleanup).call(this);
        process.exit();
    }
    ;
    ;
}
_LocalTableland_instances = new WeakSet(), _LocalTableland__start = async function _LocalTableland__start() {
    if (!(this.validatorDir && this.registryDir)) {
        // If these aren't specified then we want to open a terminal prompt that
        // will help the user setup their project directory then exit when finished
        await projectBuilder();
        this.shutdown();
        return;
    }
    // make sure we are starting fresh
    __classPrivateFieldGet(this, _LocalTableland_instances, "m", _LocalTableland__cleanup).call(this);
    // Run a local hardhat node
    const registry = spawn("npm", ["run", "up"], {
        cwd: this.registryDir,
    });
    const registryReadyEvent = "hardhat ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(chalk.bold.cyan("Registry"), registry, {
        // use events to indicate when the underlying process is finished
        // initializing and is ready to participate in the Tableland network
        readyEvent: registryReadyEvent,
        emitter: this.initEmitter,
        message: "Mined empty block",
        verbose: this.verbose
    });
    // wait until initialization is done
    await waitForReady(registryReadyEvent, this.initEmitter);
    // Deploy the Registry to the Hardhat node
    spawnSync("npx", [
        "hardhat",
        "run",
        "--network",
        "localhost",
        "scripts/deploy.ts",
    ], {
        cwd: this.registryDir
    });
    // Add an empty .env file to the validator. The Validator expects this to exist,
    // but doesn't need any of the values when running a local instance
    writeFileSync(join(this.validatorDir, "/docker/local/api/.env_validator"), " ");
    // Add the registry address to the Validator config
    const configFilePath = join(this.validatorDir, "/docker/local/api/config.json");
    const configFileStr = readFileSync(configFilePath).toString();
    const validatorConfig = JSON.parse(configFileStr);
    // save the validator config state before this script modifies it
    ORIGINAL_VALIDATOR_CONFIG = JSON.stringify(validatorConfig, null, 2);
    // TODO: this could be parsed out of the deploy process, but since
    //       it's always the same address just hardcoding it here
    validatorConfig.Chains[0].Registry.ContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    writeFileSync(configFilePath, JSON.stringify(validatorConfig, null, 2));
    // start the validator
    const validator = spawn("make", ["local-up"], {
        cwd: join(this.validatorDir, "docker")
    });
    const validatorReadyEvent = "validator ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(chalk.bold.yellow("Validator"), validator, {
        // use events to indicate when the underlying process is finished
        // initializing and is ready to participate in the Tableland network
        readyEvent: validatorReadyEvent,
        emitter: this.initEmitter,
        message: "processing height",
        verbose: this.verbose,
        fails: {
            message: "Cannot connect to the Docker daemon",
            hint: "Looks like we cannot connect to Docker.  Do you have the Docker running?"
        }
    });
    // wait until initialization is done
    await waitForReady(validatorReadyEvent, this.initEmitter);
    console.log("\n\n******  Tableland is running!  ******");
    console.log("             _________");
    console.log("         ___/         \\");
    console.log("        /              \\");
    console.log("       /                \\");
    console.log("______/                  \\______\n\n");
}, _LocalTableland__cleanup = function _LocalTableland__cleanup() {
    const dockerContainer = spawnSync("docker", ["container", "prune", "-f"]);
    // make sure this blows up if Docker isn't running
    const dcError = dockerContainer.stderr && dockerContainer.stderr.toString();
    if (dcError) {
        console.log(chalk.red(dcError));
        throw dcError;
    }
    spawnSync("docker", ["image", "rm", "docker_api", "-f"]);
    spawnSync("docker", ["volume", "prune", "-f"]);
    spawnSync("rm", ["-rf", "./tmp"]);
    // If the directory hasn't been specified there isn't anything to clean up
    if (!this.validatorDir)
        return;
    const dbFiles = [
        join(this.validatorDir, "/docker/local/api/database.db"),
        join(this.validatorDir, "/docker/local/api/database.db-shm"),
        join(this.validatorDir, "/docker/local/api/database.db-wal"),
    ];
    for (const filepath of dbFiles) {
        spawnSync("rm", ["-f", filepath]);
    }
    // reset the Validator config file that is modified on startup
    if (ORIGINAL_VALIDATOR_CONFIG) {
        const configFilePath = join(this.validatorDir, "/docker/local/api/config.json");
        writeFileSync(configFilePath, ORIGINAL_VALIDATOR_CONFIG);
    }
};
;
//# sourceMappingURL=main.js.map