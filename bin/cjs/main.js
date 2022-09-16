"use strict";
/**
 *  Run end to end Tableland
 **/
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _LocalTableland_instances, _LocalTableland__start, _LocalTableland__cleanup;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalTableland = void 0;
const node_child_process_1 = require("node:child_process");
const node_path_1 = require("node:path");
const node_events_1 = require("node:events");
const node_fs_1 = require("node:fs");
const chalk_1 = __importDefault(require("chalk"));
const util_js_1 = require("./util.js");
const project_builder_js_1 = require("./project-builder.js");
// TODO: should this be a per instance value?
// store the Validator config file in memory, so we can restore it during cleanup
let ORIGINAL_VALIDATOR_CONFIG;
// TODO: get types sorted out and remove all the `any`s
class LocalTableland {
    constructor(config) {
        _LocalTableland_instances.add(this);
        this.config = config;
        // an emitter to help with init logic across the multiple sub-processes
        this.initEmitter = new node_events_1.EventEmitter();
    }
    ;
    async start(argv) {
        this.validatorDir = this.validatorDir || await (0, util_js_1.configGetter)("Validator project directory", this.config, argv);
        this.registryDir = this.registryDir || await (0, util_js_1.configGetter)("Tableland registry contract project directory", this.config, argv);
        this.verbose = this.verbose || await (0, util_js_1.configGetter)("Should output a verbose log", this.config, argv);
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
exports.LocalTableland = LocalTableland;
_LocalTableland_instances = new WeakSet(), _LocalTableland__start = async function _LocalTableland__start() {
    if (!(this.validatorDir && this.registryDir)) {
        // If these aren't specified then we want to open a terminal prompt that
        // will help the user setup their project directory then exit when finished
        await (0, project_builder_js_1.projectBuilder)();
        this.shutdown();
        return;
    }
    // make sure we are starting fresh
    __classPrivateFieldGet(this, _LocalTableland_instances, "m", _LocalTableland__cleanup).call(this);
    // Run a local hardhat node
    const registry = (0, node_child_process_1.spawn)("npm", ["run", "up"], {
        cwd: this.registryDir,
    });
    const registryReadyEvent = "hardhat ready";
    // this process should keep running until we kill it
    (0, util_js_1.pipeNamedSubprocess)(chalk_1.default.bold.cyan("Registry"), registry, {
        // use events to indicate when the underlying process is finished
        // initializing and is ready to participate in the Tableland network
        readyEvent: registryReadyEvent,
        emitter: this.initEmitter,
        message: "Mined empty block",
        verbose: this.verbose
    });
    // wait until initialization is done
    await (0, util_js_1.waitForReady)(registryReadyEvent, this.initEmitter);
    // Deploy the Registry to the Hardhat node
    (0, node_child_process_1.spawnSync)("npx", [
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
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(this.validatorDir, "/docker/local/api/.env_validator"), " ");
    // Add the registry address to the Validator config
    const configFilePath = (0, node_path_1.join)(this.validatorDir, "/docker/local/api/config.json");
    const configFileStr = (0, node_fs_1.readFileSync)(configFilePath).toString();
    const validatorConfig = JSON.parse(configFileStr);
    // save the validator config state before this script modifies it
    ORIGINAL_VALIDATOR_CONFIG = JSON.stringify(validatorConfig, null, 2);
    // TODO: this could be parsed out of the deploy process, but since
    //       it's always the same address just hardcoding it here
    validatorConfig.Chains[0].Registry.ContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    (0, node_fs_1.writeFileSync)(configFilePath, JSON.stringify(validatorConfig, null, 2));
    // start the validator
    const validator = (0, node_child_process_1.spawn)("make", ["local-up"], {
        cwd: (0, node_path_1.join)(this.validatorDir, "docker")
    });
    const validatorReadyEvent = "validator ready";
    // this process should keep running until we kill it
    (0, util_js_1.pipeNamedSubprocess)(chalk_1.default.bold.yellow("Validator"), validator, {
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
    await (0, util_js_1.waitForReady)(validatorReadyEvent, this.initEmitter);
    console.log("\n\n******  Tableland is running!  ******");
    console.log("             _________");
    console.log("         ___/         \\");
    console.log("        /              \\");
    console.log("       /                \\");
    console.log("______/                  \\______\n\n");
}, _LocalTableland__cleanup = function _LocalTableland__cleanup() {
    const dockerContainer = (0, node_child_process_1.spawnSync)("docker", ["container", "prune", "-f"]);
    // make sure this blows up if Docker isn't running
    const dcError = dockerContainer.stderr && dockerContainer.stderr.toString();
    if (dcError) {
        console.log(chalk_1.default.red(dcError));
        throw dcError;
    }
    (0, node_child_process_1.spawnSync)("docker", ["image", "rm", "docker_api", "-f"]);
    (0, node_child_process_1.spawnSync)("docker", ["volume", "prune", "-f"]);
    (0, node_child_process_1.spawnSync)("rm", ["-rf", "./tmp"]);
    // If the directory hasn't been specified there isn't anything to clean up
    if (!this.validatorDir)
        return;
    const dbFiles = [
        (0, node_path_1.join)(this.validatorDir, "/docker/local/api/database.db"),
        (0, node_path_1.join)(this.validatorDir, "/docker/local/api/database.db-shm"),
        (0, node_path_1.join)(this.validatorDir, "/docker/local/api/database.db-wal"),
    ];
    for (const filepath of dbFiles) {
        (0, node_child_process_1.spawnSync)("rm", ["-f", filepath]);
    }
    // reset the Validator config file that is modified on startup
    if (ORIGINAL_VALIDATOR_CONFIG) {
        const configFilePath = (0, node_path_1.join)(this.validatorDir, "/docker/local/api/config.json");
        (0, node_fs_1.writeFileSync)(configFilePath, ORIGINAL_VALIDATOR_CONFIG);
    }
};
;
//# sourceMappingURL=main.js.map