/**
 *  Run end to end Tableland
 **/

import { spawn, spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import {fileURLToPath} from "url";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";


const argv = yargs(hideBin(process.argv)).argv
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// store the Validator config file in memory, so we can restore it during cleanup
let ORIGINAL_VALIDATOR_CONFIG: string | undefined;


// TODO: we need to build out a nice way to build a config object from
//       1. env vars
//       2. command line args, e.g. `npx local-tableland --validator ../go-tableland`
//       3. a `tableland.config.js` file, which is either inside `process.pwd()` or specified
//          via command line arg.  e.g. `npx local-tableland --config ../tlb-confib.js`
const configDescriptors = [
  {
    name: "Validator project directory",
    env: "VALIDATOR_DIR",
    file: "validatorDir",
    arg: "validator",
    isPath: true
  }, {
    name: "Tableland registry contract project directory",
    env: "HARDHAT_DIR",
    file: "hardhatDir",
    arg: "hardhat",
    isPath: true
  }, {
    name: "Should output a verbose log",
    env: "VERBOSE",
    file: "verbose",
    arg: "verbose",
  }
];

const confGetter = async function (confName: string) {
  let val: any;
  const configDescriptor = configDescriptors.find(v => v.name === confName);
  if (!configDescriptor) throw new Error("cannot generate getter");
  const configFile = await getConfigFile();

  return function () {
    // simple caching so we only have to do the lookup once
    if (val) return val;

    const file = configFile[configDescriptor.file];
    // TODO: figure out why typescript won't let me do `const arg = argv[configDescriptor.arg];`
    // @ts-ignore
    const arg = argv[configDescriptor.arg];
    const env = process.env[configDescriptor.env];

    // priority is: command argument, then environment variable, then config file
    val = arg || env || file;

    if (configDescriptor.isPath) {
      // if the value is absent then we can return undefined
      if (!val) return;

      // if the path is absolute just pass it along
      if (isAbsolute(val)) {
        return val;
      }

      // if path is not absolute treat it as if it's relative
      // to this repo's root and build the absolute path
      // NOTE: this is transpiled into the bin directory before being run, hence the "..  "
      val = resolve(__dirname, "..", val);
      return val;
    }

    return val;
  };
};

let getValidatorDir: any;
let getHardhatDir: any;
let getVerbose: any;

const getConfigFile = async function () {
  try {
    const { default: confFile } = await import(join(process.cwd(), "tableland.config.js"));

    return confFile;
  } catch (err) {
    // can't find and import tableland config file
    return {};
  }
};

const isExtraneousLog = function (log: string) {
  log = log.toLowerCase();

  if (log.match(/eth_getLogs/i)) return true;
  if (log.match(/Mined empty block/i)) return true;
  if (log.match(/eth_getBlockByNumber/i)) return true;
  if (log.match(/eth_getBalance/i)) return true;
  if (log.match(/processing height/i)) return true;
  if (log.match(/new last processed height/i)) return true;
  if (log.match(/eth_unsubscribe/i)) return true;
  if (log.match(/eth_subscribe/i)) return true;
  if (log.match(/new blocks subscription is quiet, rebuilding/i)) return true;
  if (log.match(/received new chain header/i)) return true;
  if (log.match(/dropping new height/i)) return true;

  return false;
}

const rmImage = function (name: string) {
  spawnSync("docker", ["image", "rm", name, "-f"]);
};

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

  rmImage("docker_api");
  spawnSync("docker", ["volume", "prune", "-f"]);
  spawnSync("rm", ["-rf", "./tmp"]);

  const VALIDATOR_DIR = getValidatorDir();
  // If the directory hasn't been specified there isn't anything to clean up
  if (!VALIDATOR_DIR) return;

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
    writeFileSync(
      configFilePath,
      ORIGINAL_VALIDATOR_CONFIG
    );
  }

};

const pipeNamedSubprocess = async function (
  prefix: string,
  prcss: any,
  options?: any
) {
  let ready = !(options && options.message);
  const fails = options?.fails;
  const verbose = getVerbose();

  prcss.stdout.on('data', function (data: string) {
    // data is going to be a buffer at runtime
    data = data.toString();
    if (!data) return;

    let lines = data.split('\n')
    if (!verbose) {
      lines = lines.filter(line => !isExtraneousLog(line));
      // if not verbose we are going to elliminate multiple empty
      // lines and any messages that don't have at least one character
      if (!lines.filter(line => line.trim()).length) {
        lines = [];
      } else {
        lines = lines.reduce((acc, cur) => {
          if (acc.length && !acc[acc.length - 1] && !cur.trim()) return acc;

          // @ts-ignore
          return acc.concat([cur.trim()]);
        }, []);
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!verbose && isExtraneousLog(line)) continue;
      console.log(`[${prefix}] ${line}`);
    }
    if (!ready) {
      if (data.includes(options.message) && options.readyEvent) {
        options.emitter.emit(options.readyEvent);
        ready = true;
      }
    }
  });

  prcss.stderr.on('data', function (data: string) {
    // data is going to be a buffer at runtime
    data = data.toString();
    if (!data) return;

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

// enable async/await for underlying event pattern
const waitForReady = function (readyEvent: string, emitter: EventEmitter): Promise<void> {
  return new Promise(function (resolve) {
    emitter.once(readyEvent, () => resolve());
  });
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
  const { default: validatorConfig } = await import(configFilePath, {assert: {type: "json"}});

  // save the validator config state before this script modifies it
  ORIGINAL_VALIDATOR_CONFIG = JSON.stringify(validatorConfig, null, 2)

  // TODO: this could be parsed out of the deploy process, but since
  //       it's always the same address just hardcoding it here
  validatorConfig.Chains[0].Registry.ContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";

  writeFileSync(
    configFilePath,
    JSON.stringify(validatorConfig, null, 2)
  );

  // Add a .env file to the validator
  const validatorEnv = readFileSync(
    resolve(__dirname, "..", ".env_validator")
  );
  writeFileSync(
    join(VALIDATOR_DIR, "/docker/local/api/.env_validator"),
    validatorEnv
  );

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

export const shutdown = async function () {
  cleanup();

  process.exit();
};

export const main = async function () {
  getValidatorDir = await confGetter("Validator project directory");
  getHardhatDir = await confGetter("Tableland registry contract project directory");
  getVerbose = await confGetter("Should output a verbose log");

  await start();
};
