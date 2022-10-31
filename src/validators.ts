import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { logSync } from "./util.js";

// TODO: should this be a per instance value?
// store the Validator config file in memory, so we can restore it during cleanup
let ORIGINAL_VALIDATOR_CONFIG: string | undefined;

// TODO: how do we determine if these builds all work?
const platformMap = {
  aix: "",
  darwin: "darwin",
  freebsd: "linux",
  linux: "linux",
  openbsd: "linux",
  netbsd: "linux",
  sunos: "",
  win32: "windows",
  cygwin: "windows",
  android: "",
  haiku: "",
};

class ValidatorPkg {
  process?: ChildProcess;

  start() {
    const platform = platformMap[process.platform];
    if (!platform) {
      throw new Error(`cannot start with platform ${platform}`);
    }

    this.process = spawn(`./validator/bin/${platform}`, ["--dir", `${resolve(process.cwd(), "validator")}`], {
      detached: true
    });
  }

  cleanup() {
    // nothing to cleanup
    return;
  }

}

class ValidatorDev {
  validatorDir: string;
  process?: ChildProcess;

  constructor(validatorPath?: string) {
    if (!validatorPath) throw new Error("must supply path to validator");
    this.validatorDir = validatorPath
  }

  start() {
    // Add an empty .env file to the validator. The Validator expects this to exist,
    // but doesn't need any of the values when running a local instance
    writeFileSync(
      join(this.validatorDir, "/docker/local/api/.env_validator"),
      " "
    );

    // Add the registry address to the Validator config
    // TODO: when https://github.com/tablelandnetwork/go-tableland/issues/317 is
    //       resolved we may be able to refactor alot of this
    const configFilePath = join(
      this.validatorDir,
      "/docker/local/api/config.json"
    );
    const configFileStr = readFileSync(configFilePath).toString();
    const validatorConfig = JSON.parse(configFileStr);

    // save the validator config state before this script modifies it
    ORIGINAL_VALIDATOR_CONFIG = JSON.stringify(validatorConfig, null, 2);

    // TODO: this could be parsed out of the deploy process, but since
    //       it's always the same address just hardcoding it here
    validatorConfig.Chains[0].Registry.ContractAddress =
      "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";

    writeFileSync(configFilePath, JSON.stringify(validatorConfig, null, 2));

    // start the validator
    this.process = spawn("make", ["local-up"], {
      detached: true,
      cwd: join(this.validatorDir, "docker"),
    });
  }

  cleanup() {
    logSync(spawnSync("docker", ["container", "prune", "-f"]));

    spawnSync("docker", ["image", "rm", "docker_api", "-f"]);
    spawnSync("docker", ["volume", "prune", "-f"]);

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
      const configFilePath = join(
        this.validatorDir,
        "/docker/local/api/config.json"
      );
      writeFileSync(configFilePath, ORIGINAL_VALIDATOR_CONFIG);
    }
  }

}

export { ValidatorDev, ValidatorPkg };
