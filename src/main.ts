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
  checkPortInUse,
  defaultRegistryDir,
  inDebugMode,
  isValidPort,
  isWindows,
  getAccounts,
  getConfigFile,
  getDatabase,
  getRegistry,
  getRegistryPort,
  getValidator,
  logSync,
  pipeNamedSubprocess,
  waitForReady,
} from "./util.js";

const spawnSync = spawn.sync;

class LocalTableland {
  config;
  initEmitter;
  ready: boolean = false;
  #_readyResolves: Function[] = [];
  registry?: ChildProcess;
  validator?: ValidatorDev | ValidatorPkg;
  readonly defaultRegistryPort: number = 8545;

  validatorDir?: string;
  registryDir?: string;
  docker?: boolean;
  verbose?: boolean;
  silent?: boolean;
  fallback?: boolean;
  registryPort: number;

  constructor(configParams: Config = {}) {
    this.config = configParams;
    this.registryPort = this.defaultRegistryPort;

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
    if (typeof config.fallback === "boolean") this.fallback = config.fallback;
    if (typeof config.registryPort === "number") {
      // Make sure the port is in the valid range 1-65535
      if (!isValidPort(config.registryPort))
        throw new Error("invalid Registry port");
      this.registryPort = config.registryPort;
    }

    await this.#_start(config);
  }

  async #_start(config: Config = {}) {
    if (!this.registryDir) {
      throw new Error("cannot start a local network without Registry");
    }

    // make sure we are starting fresh
    // TODO: I don't think this is doing anything anymore...
    this.#_cleanup();

    // Check if the hardhat port is in use and retry 5 times (500ms b/w each try)
    // Note: this generally works, but there is a chance that the port will be
    // taken—e.g., try racing two instances *exactly* at the same, and
    // `EADDRINUSE` occurs. But generally, it'll work with the expected logic.
    const totalTries = 5;
    let numTries = 0;
    while (numTries < totalTries) {
      const portIsTaken = await checkPortInUse(this.registryPort);
      if (!portIsTaken) break;

      await new Promise((resolve) => setTimeout(resolve, 500));
      numTries++;
    }
    // if the number of tries is equal to the total tries, the port is in use
    const defaultPortIsTaken = numTries === totalTries;
    // if fallbacks are not enabled, throw since the default port is in use
    if (!this.fallback && defaultPortIsTaken)
      throw new Error(
        `port ${this.registryPort} already in use; try enabling 'fallback' option`
      );

    // If the port is not taken, notify the user only if it's a not the default.
    // Else, the registry port is taken, so we will try a set of 3 fallback
    // ports and throw if none are available.
    // Note: if a new port is used, common clients that expect port 8545 will
    // not work as expected since they look for port 8545 by default.
    if (!defaultPortIsTaken) {
      // notify that we're using a custom port since it's not the default 8545
      this.registryPort !== this.defaultRegistryPort &&
        shell.echo(
          `[${chalk.magenta.bold("Notice")}] Registry is using custom port ${
            this.registryPort
          }`
        );
    } else {
      let newPort;
      const fallbackPorts = Array.from(
        { length: 3 },
        (_, i) => this.registryPort + i + 1
      );
      for (const port of fallbackPorts) {
        // check each port with 1 try, no delay
        const portIsTaken = await checkPortInUse(port);
        if (!portIsTaken) {
          newPort = port;
          break;
        }
      }
      // if no new port was set, we were unable to find an open port
      if (newPort === undefined)
        throw new Error(
          `cannot start a local chain, port ${this.registryPort} and all fallbacks in use`
        );
      // notify that we're using a fallback port
      shell.echo(
        `[${chalk.magenta.bold(
          "Notice"
        )}] Registry default port in use, using fallback port ${newPort}`
      );
      this.registryPort = newPort;
    }

    // Need to determine if we are starting the validator via docker
    // and a local repo, or if are running a binary etc...
    // Note: we do this before spawning the registry so that in the instance of a
    // port conflict, we can update the validator config with the new hardhat
    // port before starting the validator process
    const ValidatorClass = this.docker ? ValidatorDev : ValidatorPkg;

    // If the new port exists, set it, and update validator config
    // Else, use the default port passed in
    this.validator = new ValidatorClass(this.validatorDir, this.registryPort);

    // You *must* store these in `process.env` to access within the hardhat subprocess
    process.env.HARDHAT_NETWORK = "hardhat";
    process.env.HARDHAT_UNLIMITED_CONTRACT_SIZE = "true";
    process.env.HARDHAT_PORT = this.registryPort.toString();

    // Run a local hardhat node
    this.registry = spawn(
      isWindows() ? "npx.cmd" : "npx",
      ["hardhat", "node", "--port", this.registryPort.toString()], // Use a fallback port on conflicts
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
    try {
      await this.shutdownValidator();
      await this.shutdownRegistry();
    } catch (err: any) {
      throw new Error(`unexpected error during shutdown: ${err.message}`);
    } finally {
      this.#_cleanup();
    }
  }

  shutdownRegistry(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.registry) return resolve();

      this.registry.once("close", () => resolve());
      // If this Class is imported and run by a test runner then the ChildProcess instances are
      // sub-processes of a ChildProcess instance which means in order to kill them in a way that
      // enables graceful shut down they have to run in detached mode and be killed by the pid

      // Although this shouldn't be an issue, catch an error if the registry
      // process was already killed—it *is* possible with the validator process
      // but doesn't seem to happen with the Registry
      try {
        // @ts-ignore
        process.kill(-this.registry.pid);
      } catch (err: any) {
        if (err.code === "ESRCH") {
          throw new Error(`registry process already killed`);
        } else {
          throw err;
        }
      }
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
  // e.g. remove docker images, database backups, resetting state
  #_cleanup() {
    shell.rm("-rf", "./tmp");
    // If the directory hasn't been specified there isn't anything to clean up
    if (!this.validator) return;

    this.validator.cleanup();
    // Reset validator and registry state since these are no longer needed
    this.registry = undefined;
    this.validator = undefined;
  }
}

export {
  LocalTableland,
  getAccounts,
  getDatabase,
  getRegistry,
  getRegistryPort,
  getValidator,
};
export type { Config };
