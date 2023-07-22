/**
 *  Run end to end Tableland
 **/
import spawn from "cross-spawn";
import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import shell from "shelljs";
import { chalk } from "./chalk.js";
import { ValidatorDev, ValidatorPkg } from "./validators.js";
import {
  buildConfig,
  Config,
  defaultRegistryDir,
  inDebugMode,
  isWindows,
  getAccounts,
  getConfigFile,
  getDatabase,
  getRegistry,
  getValidator,
  logSync,
  pipeNamedSubprocess,
  probePortInUse,
  waitForReady,
} from "./util.js";
import { resolve } from "node:path";
import { readFile, writeFile } from "fs/promises";

const spawnSync = spawn.sync;

let hardhatPort = 8545;

class LocalTableland {
  config;
  initEmitter;
  ready: boolean = false;
  #_readyResolves: Function[] = [];
  registry?: ChildProcess;
  validator?: ValidatorDev | ValidatorPkg;

  validatorDir?: string;
  registryDir?: string;
  docker?: boolean;
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
      this.registryDir = await defaultRegistryDir();
    }
    if (typeof config.docker === "boolean") this.docker = config.docker;
    if (typeof config.verbose === "boolean") this.verbose = config.verbose;
    if (typeof config.silent === "boolean") this.silent = config.silent;

    await this.#_start(config);
  }

  async #_start(config: Config = {}) {
    if (!this.registryDir) {
      throw new Error("cannot start a local network without Registry");
    }

    // make sure we are starting fresh
    // TODO: I don't think this is doing anything anymore...
    this.#_cleanup();

    // check if the hardhat port is in use and try 5 times (1 second b/w each)
    const defaultPortIsTaken = await probePortInUse(hardhatPort, 5, 1000);
    // if the default port is taken, we will try a set of 3 fallback ports and
    // throw if none are available
    let newPort; // note: if a new port is used, common clients that expect port 8545 will not work
    if (defaultPortIsTaken) {
      const fallbackPorts = Array.from(
        { length: 3 },
        (_, i) => hardhatPort + i + 1
      );
      for (const port of fallbackPorts) {
        // check each port with 1 try, no delay
        const isTaken = await probePortInUse(port, 1, 0);
        if (!isTaken) {
          newPort = port;
          break;
        }
      }
      // If no new port was set, we were unable to find an open port
      if (newPort === undefined)
        throw new Error(
          `cannot start a local chain, port ${hardhatPort} and all fallbacks in use`
        );
    }

    // Need to determine if we are starting the validator via docker
    // and a local repo, or if are running a binary etc...
    // Note: we do this before spawning the registry so that in the instance of a
    // port conflict, we can update the validator config with the new hardhat
    // port before starting the validator process
    const ValidatorClass = this.docker ? ValidatorDev : ValidatorPkg;
    this.validator = new ValidatorClass(this.validatorDir);

    // If the new port exists, set it, and update validator config
    if (newPort !== undefined) {
      // log the new port for awareness, also exported elsewhere
      shell.echo(`Using fallback port ${newPort} for hardhat`);
      hardhatPort = newPort;

      // the validator should have a directory path set upon initialization
      if (this.validator.validatorDir === undefined)
        throw new Error(
          `cannot find validator config during port fallback setup`
        );
      // update the validator config file with a new "EthEndpoint" port
      const configFilePath = resolve(
        this.validator.validatorDir,
        "config.json"
      );
      const configFile = await readFile(configFilePath);
      const validatorConfig = JSON.parse(configFile.toString());
      validatorConfig.Chains[0].Registry.EthEndpoint = `ws://localhost:${hardhatPort}`;

      await writeFile(configFilePath, JSON.stringify(validatorConfig, null, 2));
    }

    // You *must* store these in `process.env` to access within the hardhat subprocess
    process.env.HARDHAT_NETWORK = "hardhat";
    process.env.HARDHAT_UNLIMITED_CONTRACT_SIZE = "true";
    process.env.HARDHAT_PORT = hardhatPort.toString();

    // Run a local hardhat node
    this.registry = spawn(
      isWindows() ? "npx.cmd" : "npx",
      ["hardhat", "node", "--port", hardhatPort.toString()], // TODO: use a fallback port on conflicts vs. failing on retries
      {
        // we can't run in windows if we use detached mode
        detached: !isWindows(),
        cwd: this.registryDir,
        env: {
          ...process.env,
        },
      }
    );

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
        isWindows() ? "npx.cmd" : "npx",
        ["hardhat", "run", "--network", "localhost", "scripts/deploy.ts"],
        {
          cwd: this.registryDir,
        }
      ),
      !inDebugMode()
    );

    // run this before starting in case the last instance of the validator didn't get cleanup after
    // this might be needed if a test runner force quits the parent local-tableland process
    this.validator.cleanup();
    this.validator.start();

    // TODO: It seems like this check isn't sufficient to see if the process is gonna get to a point
    //       where the on error listener can be attached.
    if (!this.validator.process) {
      throw new Error("could not start Validator process");
    }

    this.validator.process.on("error", (err) => {
      throw new Error(`validator errored with: ${err}`);
    });

    const validatorReadyEvent = "validator ready";
    // this process should keep running until we kill it
    pipeNamedSubprocess(
      chalk.yellow.bold("Validator"),
      this.validator.process,
      {
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
      }
    );

    // wait until initialization is done
    await waitForReady(validatorReadyEvent, this.initEmitter);
    await this.#_setReady();

    if (this.silent) return;

    console.log("\n\n******  Tableland is running!  ******");
    console.log("             _________");
    console.log("         ___/         \\");
    console.log("        /              \\");
    console.log("       /                \\");
    console.log("______/                  \\______\n\n");
    console.log("Using Configuration:\n" + JSON.stringify(config, null, 4));
    console.log("\n\n*************************************\n");
  }

  async #_setReady() {
    this.ready = true;
    while (this.#_readyResolves.length) {
      // readyResolves is an array of the resolve functions for all registered
      // promises we want to pop and call each of them synchronously
      const resolve = this.#_readyResolves.pop();
      if (typeof resolve === "function") resolve();
    }
  }

  // module consumers can await this method if they want to
  // wait until the network fully started to do something
  isReady() {
    if (this.ready) return Promise.resolve();

    const prom = new Promise((resolve) => {
      this.#_readyResolves.push(resolve);
    });

    return prom;
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
      this.validator.shutdown();
    });
  }

  // cleanup should restore everything to the starting state.
  // e.g. remove docker images, database backups, resetting ports
  #_cleanup() {
    shell.rm("-rf", "./tmp");
    hardhatPort = 8545;
    // If the directory hasn't been specified there isn't anything to clean up
    if (!this.validator) return;

    this.validator.cleanup();
  }
}

export {
  LocalTableland,
  getAccounts,
  getDatabase,
  getRegistry,
  getValidator,
  hardhatPort,
};
export type { Config };
