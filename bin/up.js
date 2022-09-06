#!/usr/bin/env node
/**
 *  Run end to end Tableland
 **/
import { spawn, spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cyan = function (text) {
    return `\x1b[36m${text}\x1b[0m`;
};
const yellow = function (text) {
    return `\x1b[33m${text}\x1b[0m`;
};
const red = function (text) {
    return `\x1b[31m${text}\x1b[0m`;
};
const initEmitter = new EventEmitter();
const rmImage = function (name) {
    spawnSync("docker", ["image", "rm", name, "-f"]);
};
const envDirGetter = function (env) {
    let envvar;
    return function () {
        if (envvar)
            return envvar;
        envvar = process.env[env];
        if (!envvar) {
            throw new Error(`cannot find ${env} Directory`);
        }
        // if the path is absolute just pass it along
        if (isAbsolute(envvar))
            return envvar;
        // if path is not absolute treat it as if it's relative
        // to this repo's root and build the absolute path
        // NOTE: this is transpiled into the bin directory before being run, hence the "..  "
        envvar = resolve(__dirname, "..", envvar);
        return envvar;
    };
};
const getValidatorDir = envDirGetter("VALIDATOR_DIR");
const getHardhatDir = envDirGetter("HARDHAT_DIR");
const cleanup = function () {
    const dockerContainer = spawnSync("docker", ["container", "prune", "-f"]);
    // make sure this blows up if Docker isn't running
    const dcError = dockerContainer.stderr && dockerContainer.stderr.toString();
    if (dcError) {
        console.log(red(dcError));
        throw dcError;
    }
    rmImage("docker_api");
    spawnSync("docker", ["volume", "prune", "-f"]);
    spawnSync("rm", ["-rf", "./tmp"]);
    const VALIDATOR_DIR = getValidatorDir();
    const dbFiles = [
        join(VALIDATOR_DIR, "/local/api/database.db"),
        join(VALIDATOR_DIR, "/local/api/database.db-shm"),
        join(VALIDATOR_DIR, "/local/api/database.db-wal"),
    ];
    for (const filepath of dbFiles) {
        spawnSync("rm", ["-f", filepath]);
    }
};
const pipeNamedSubprocess = async function (prefix, prcss, options) {
    let ready = !(options && options.message);
    const fails = options === null || options === void 0 ? void 0 : options.fails;
    prcss.stdout.on('data', function (data) {
        // data is going to be a buffer at runtime
        data = data.toString();
        if (!data)
            return;
        const lines = data.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.log(`[${prefix}] ${line}`);
        }
        if (!ready) {
            if (data.includes(options.message) && options.readyEvent) {
                initEmitter.emit(options.readyEvent);
                ready = true;
            }
        }
    });
    prcss.stderr.on('data', function (data) {
        // data is going to be a buffer at runtime
        data = data.toString();
        if (!data)
            return;
        const lines = data.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.error(`[${prefix}] ${line}`);
        }
        if (fails && data.includes(fails.message)) {
            process.exit();
        }
    });
};
const waitForReady = function (readyEvent) {
    return new Promise(function (resolve) {
        initEmitter.once(readyEvent, () => resolve());
    });
};
const shutdown = async function () {
    cleanup();
    process.exit();
};
const start = async function () {
    // make sure we are starting fresh
    cleanup();
    const VALIDATOR_DIR = getValidatorDir();
    const HARDHAT_DIR = getHardhatDir();
    // Run a local hardhat node
    const hardhat = spawn("npm", ["run", "up"], {
        cwd: HARDHAT_DIR,
    });
    const hardhatReadyEvent = "hardhat ready";
    // NOTE: the process should keep running until we kill it
    pipeNamedSubprocess(cyan("Hardhat"), hardhat, {
        readyEvent: hardhatReadyEvent,
        message: "Mined empty block",
    });
    // wait until initialization is done
    await waitForReady(hardhatReadyEvent);
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
        join(VALIDATOR_DIR, "..", "tableland-openapi-spec.yaml"),
        "./tmp",
    ]);
    // Add the registry address to the Validator config
    const configFilePath = join(VALIDATOR_DIR, "local/api/config.json");
    const { default: validatorConfig } = await import(configFilePath, { assert: { type: "json" } });
    // TODO: this could be parsed out of the deploy process, but since
    //       it's always the same address just hardcoding it here
    validatorConfig.Chains[0].Registry.ContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    writeFileSync(configFilePath, JSON.stringify(validatorConfig, null, 2));
    // Add a .env file to the validator
    const validatorEnv = readFileSync(resolve(__dirname, "..", ".env_validator"));
    writeFileSync(join(VALIDATOR_DIR, "local/api/.env_validator"), validatorEnv);
    const validatorReadyEvent = "validator ready";
    // start the validator
    const validator = spawn("make", ["local-up"], {
        cwd: VALIDATOR_DIR
    });
    // NOTE: the process should keep running until we kill it
    pipeNamedSubprocess(yellow("Validator"), validator, {
        readyEvent: validatorReadyEvent,
        message: "processing height",
        fails: {
            message: "Cannot connect to the Docker daemon",
            hint: "Looks like we cannot connect to Docker.  Do you have the Docker running?"
        }
    });
    // wait until initialization is done
    await waitForReady(validatorReadyEvent);
    console.log("\n\n******  Tableland is running!  ******");
    console.log("             _________");
    console.log("         ___/         \\");
    console.log("        /              \\");
    console.log("       /                \\");
    console.log("______/                  \\______\n\n");
};
process.on("SIGINT", shutdown);
process.on("SIGQUIT", shutdown);
await start();
//# sourceMappingURL=up.js.map