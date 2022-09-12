/**
 *  Run end to end Tableland
 **/
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { confGetter, pipeNamedSubprocess, waitForReady } from "./util.js";
import { projectBuilder } from "./project-builder.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// TODO: should this be a per instance value?
// store the Validator config file in memory, so we can restore it during cleanup
let ORIGINAL_VALIDATOR_CONFIG;
// TODO: we need to build out a nice way to build a config object from
//       1. env vars
//       2. command line args, e.g. `npx local-tableland --validator ../go-tableland`
//       3. a `tableland.config.js` file, which is either inside `process.pwd()` or specified
//          via command line arg.  e.g. `npx local-tableland --config ../tlb-confib.js`
let getValidatorDir;
let getHardhatDir;
let getVerbose;
// TODO: should this be a per instance method?
// cleanup should restore everything to the starting state.
// e.g. remove docker images and database backups
const cleanup = function () {
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
    const VALIDATOR_DIR = getValidatorDir();
    // If the directory hasn't been specified there isn't anything to clean up
    if (!VALIDATOR_DIR)
        return;
    const dbFiles = [
        join(VALIDATOR_DIR, "/docker/local/api/database.db"),
        join(VALIDATOR_DIR, "/docker/local/api/database.db-shm"),
        join(VALIDATOR_DIR, "/docker/local/api/database.db-wal"),
    ];
    for (const filepath of dbFiles) {
        spawnSync("rm", ["-f", filepath]);
    }
    // reset the Validator config file that is modified on startup
    if (ORIGINAL_VALIDATOR_CONFIG) {
        const configFilePath = join(VALIDATOR_DIR, "/docker/local/api/config.json");
        writeFileSync(configFilePath, ORIGINAL_VALIDATOR_CONFIG);
    }
};
const start = async function () {
    // an emitter to help with init logic across the multiple sub-processes
    const initEmitter = new EventEmitter();
    const VALIDATOR_DIR = getValidatorDir();
    const HARDHAT_DIR = getHardhatDir();
    const verbose = getVerbose();
    if (!(VALIDATOR_DIR && HARDHAT_DIR)) {
        // If these aren't specified then we want to open a terminal
        // prompt that will help the user setup their project directory
        // TODO: build out a prompt much like hardhat or create-vue-app
        await projectBuilder();
        shutdown();
        return;
    }
    // make sure we are starting fresh
    cleanup();
    // Run a local hardhat node
    const hardhat = spawn("npm", ["run", "up"], {
        cwd: HARDHAT_DIR,
    });
    const hardhatReadyEvent = "hardhat ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(chalk.bold.cyan("Hardhat"), hardhat, {
        // use events to indicate when the underlying process is finished
        // initializing and is ready to participate in the Tableland network
        readyEvent: hardhatReadyEvent,
        emitter: initEmitter,
        message: "Mined empty block",
        verbose: verbose
    });
    // wait until initialization is done
    await waitForReady(hardhatReadyEvent, initEmitter);
    // Deploy the Registry to the Hardhat node
    spawnSync("npx", [
        "hardhat",
        "run",
        "--network",
        "localhost",
        "scripts/deploy.ts",
    ], {
        cwd: HARDHAT_DIR
    });
    // copy the api spec to a place the tests can find it
    spawnSync("mkdir", ["./tmp"]);
    spawnSync("cp", [
        join(VALIDATOR_DIR, "tableland-openapi-spec.yaml"),
        "./tmp",
    ]);
    // Add the registry address to the Validator config
    const configFilePath = join(VALIDATOR_DIR, "/docker/local/api/config.json");
    const { default: validatorConfig } = await import(configFilePath, { assert: { type: "json" } });
    // save the validator config state before this script modifies it
    ORIGINAL_VALIDATOR_CONFIG = JSON.stringify(validatorConfig, null, 2);
    // TODO: this could be parsed out of the deploy process, but since
    //       it's always the same address just hardcoding it here
    validatorConfig.Chains[0].Registry.ContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    writeFileSync(configFilePath, JSON.stringify(validatorConfig, null, 2));
    // Add a .env file to the validator
    const validatorEnv = readFileSync(resolve(__dirname, "..", ".env_validator"));
    writeFileSync(join(VALIDATOR_DIR, "/docker/local/api/.env_validator"), validatorEnv);
    // start the validator
    const validator = spawn("make", ["local-up"], {
        cwd: join(VALIDATOR_DIR, "docker")
    });
    const validatorReadyEvent = "validator ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(chalk.bold.yellow("Validator"), validator, {
        // use events to indicate when the underlying process is finished
        // initializing and is ready to participate in the Tableland network
        readyEvent: validatorReadyEvent,
        emitter: initEmitter,
        message: "processing height",
        verbose: verbose,
        fails: {
            message: "Cannot connect to the Docker daemon",
            hint: "Looks like we cannot connect to Docker.  Do you have the Docker running?"
        }
    });
    // wait until initialization is done
    await waitForReady(validatorReadyEvent, initEmitter);
    console.log("\n\n******  Tableland is running!  ******");
    console.log("             _________");
    console.log("         ___/         \\");
    console.log("        /              \\");
    console.log("       /                \\");
    console.log("______/                  \\______\n\n");
};
export const shutdown = function () {
    cleanup();
    process.exit();
};
export const main = async function () {
    getValidatorDir = await confGetter("Validator project directory");
    getHardhatDir = await confGetter("Tableland registry contract project directory");
    getVerbose = await confGetter("Should output a verbose log");
    await start();
};
//# sourceMappingURL=main.js.map