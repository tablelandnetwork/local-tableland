/**
 *  Run end to end Tableland
 **/

import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { chalk } from "./chalk.js";
import { ValidatorDev, ValidatorPkg } from "./validators.js"
import {
  buildConfig,
  defaultRegistryDir,
  getConfigFile,
  Config,
  pipeNamedSubprocess,
  waitForReady,
  getAccounts,
  logSync,
} from "./util.js";


class LocalTableland {
  config;
  initEmitter;
  registry?: ChildProcess;
  validator?: ValidatorDev | ValidatorPkg;

  validatorDir?: string;
  registryDir?: string;
  verbose?: boolean;
  silent?: boolean;

  constructor(configParams: Config = {}) {
    this.config = configParams;

    // an emitter to help with init logic across the multiple sub-processes
    this.initEmitter = new EventEmitter();
  }

  async start() {
    const configFile = await getConfigFile();
    const config = buildConfig({ ...configFile, ...this.config });

    if (typeof config.validatorDir === "string")
      this.validatorDir = config.validatorDir;
    if (typeof config.registryDir === "string" && config.registryDir) {
      this.registryDir = config.registryDir;
    } else {
      this.registryDir = defaultRegistryDir();
    }
    if (typeof config.verbose === "boolean") this.verbose = config.verbose;
    if (typeof config.silent === "boolean") this.silent = config.silent;

    await this.#_start();
  }

  async #_start() {
    if (!(this.validatorDir && this.registryDir)) {
      throw new Error(
        "cannot start a local network without Validator and Registry"
      );
    }

    // make sure we are starting fresh
    this.#_cleanup();

    // Run a local hardhat node
    this.registry = spawn("npx", ["hardhat", "node"], {
      detached: true,
      cwd: this.registryDir,
    });

    this.registry.on("error", (err) => {
      throw new Error(`registry errored with: ${err}`);
    });

    const registryReadyEvent = "hardhat ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(chalk.cyan.bold("Registry"), this.registry, {
      // use events to indicate when the underlying process is finished
      // initializing and is ready to participate in the Tableland network
      readyEvent: registryReadyEvent,
      emitter: this.initEmitter,
      message: "Mined empty block",
      verbose: this.verbose,
      silent: this.silent,
    });

    // wait until initialization is done
    await waitForReady(registryReadyEvent, this.initEmitter);

    // Deploy the Registry to the Hardhat node
    logSync(
      spawnSync(
        "npx",
        ["hardhat", "run", "--network", "localhost", "scripts/deploy.ts"],
        {
          cwd: this.registryDir,
        }
      )
    );


    // TODO: need to determine if we are starting the validator via docker
    // and a local repo, or if are running a binary etc...

    const ValidatorClass = this.validatorDir ? ValidatorDev : ValidatorPkg;

    this.validator = new ValidatorClass(this.validatorDir);
    this.validator.start();

    if (!this.validator.process) throw new Error("could not start Validator process");

    this.validator.process.on("error", (err) => {
      throw new Error(`validator errored with: ${err}`);
    });

    const validatorReadyEvent = "validator ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(chalk.yellow.bold("Validator"), this.validator.process, {
      // use events to indicate when the underlying process is finished
      // initializing and is ready to participate in the Tableland network
      readyEvent: validatorReadyEvent,
      emitter: this.initEmitter,
      message: "processing height",
      verbose: this.verbose,
      silent: this.silent,
      fails: {
        message: "Cannot connect to the Docker daemon",
        hint: "Looks like we cannot connect to Docker.  Do you have the Docker running?",
      },
    });

    // wait until initialization is done
    await waitForReady(validatorReadyEvent, this.initEmitter);

    if (this.silent) return;

    console.log("\n\n******  Tableland is running!  ******");
    console.log("             _________");
    console.log("         ___/         \\");
    console.log("        /              \\");
    console.log("       /                \\");
    console.log("______/                  \\______\n\n");
  }

  async shutdown() {
    await this.shutdownValidator();
    await this.shutdownRegistry();
    this.#_cleanup();
  }

  shutdownRegistry(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.registry) return resolve();

      this.registry.once("close", () => resolve());
      // If this Class is imported and run by a test runner then the ChildProcess instances are
      // sub-processes of a ChildProcess instance which means in order to kill them in a way that
      // enables graceful shut down they have to run in detached mode and be killed by the pid
      // @ts-ignore
      process.kill(-this.registry.pid);
    });
  }

  shutdownValidator(): Promise<void> {
    return new Promise((resolve) => {
      if (!(this.validator && this.validator.process)) return resolve();

      this.validator.process.on("close", () => resolve());
      // If this Class is imported and run by a test runner then the ChildProcess instances are
      // sub-processes of a ChildProcess instance which means in order to kill them in a way that
      // enables graceful shut down they have to run in detached mode and be killed by the pid
      // @ts-ignore
      process.kill(-this.validator.process.pid);
    });
  }

  // cleanup should restore everything to the starting state.
  // e.g. remove docker images and database backups
  #_cleanup() {
    spawnSync("rm", ["-rf", "./tmp"]);

    // If the directory hasn't been specified there isn't anything to clean up
    if (!this.validator) return;

    this.validator.cleanup();
  }
}

export { LocalTableland, getAccounts };
