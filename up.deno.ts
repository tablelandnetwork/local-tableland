#!/usr/bin/env deno run --allow-run --allow-env --allow-read --allow-write

/**
 *  Run end to end Tableland
 **/

import {
  cyan,
  brightGreen,
  magenta,
  red,
} from "https://deno.land/std@0.140.0/fmt/colors.ts";
import { readLines } from "https://deno.land/std@0.140.0/io/mod.ts";
import { writeAll } from "https://deno.land/std@0.140.0/io/util.ts";
import { join } from "https://deno.land/std/path/mod.ts";
import * as path from "https://deno.land/std@0.57.0/path/mod.ts";
import { EventEmitter } from "https://deno.land/std@0.149.0/node/events.ts";

const initEmitter = new EventEmitter();

const __dirname = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), "..");

const rmImage = async function (name: string) {
  const rm = Deno.run({ cmd: ["docker", "image", "rm", name, "-f"] });
  await rm.status();
};

const getValidatorDir = function () {
  const envvar = Deno.env.get("VALIDATOR_DIR");
  if (envvar) return envvar;

  throw new Error("cannot find Validator Directory");
};

const getHardhatDir = function () {
  const envvar = Deno.env.get("HARDHAT_DIR");
  if (envvar) return envvar;

  throw new Error("cannot find Validator Directory");
};

const cleanup = async function () {
  const pruneContainer = Deno.run({
    cmd: ["docker", "container", "prune", "-f"],
    stderr: "piped"
  });
  // We use this to check if the Docker daemon is running
  // because it's the first interaction with docker
  pipeNamedSubprocess(red("Docker Prune"), pruneContainer.stderr, Deno.stderr, {
    fails: {
      message: "Cannot connect to the Docker daemon",
      hint: "Looks like we cannot connect to Docker.  Do you have the Docker running?"
    }
  });
  await pruneContainer.status();
  // Reading the output closes the pipe so the process can exit gracefully
  await pruneContainer.stderrOutput();

  await rmImage("docker_api");

  const pruneVolume = Deno.run({ cmd: ["docker", "volume", "prune", "-f"] });
  await pruneVolume.status();

  const rmTemp = Deno.run({
    cmd: ["rm", "-rf", "./tmp"],
  });
  await rmTemp.status();

  const VALIDATOR_DIR = getValidatorDir();
  if (typeof VALIDATOR_DIR !== "string")
    throw new Error("you must supply path to Validator");

  const dbFiles = [
    join(__dirname, VALIDATOR_DIR, "/local/api/database.db"),
    join(__dirname, VALIDATOR_DIR, "/local/api/database.db-shm"),
    join(__dirname, VALIDATOR_DIR, "/local/api/database.db-wal"),
  ];

  for (const filepath of dbFiles) {
    const rmDb = Deno.run({
      cmd: ["rm", "-f", filepath],
    });
    await rmDb.status();
  }
};

const pipeNamedSubprocess = async function (
  prefix: string,
  reader: Deno.Reader,
  writer: Deno.Writer,
  options?: any
) {
  const encoder = new TextEncoder();
  // optionally setup an event in the global emitter that indicates when this
  // process is done initalizing based on the stdout text.
  let ready = !(options && options.message);
  const fails = options?.fails;

  for await (const line of readLines(reader)) {
    // if `fails` is provided it means there's a process message which will indicate
    // we should just exit immedialey.  This is probably only useful for stderr
    if (fails && line.includes(fails.message)) {
      // hint should be a suggestion how to fix the problem
      console.log(red(fails.hint));
      return Deno.exit();
    }

    if (!ready) {
      if (line.includes(options.message) && options.readyEvent) {
        initEmitter.emit(options.readyEvent);
        ready = true;
      }
    }

    await writeAll(writer, encoder.encode(`[${prefix}] ${line}\n`));
  }
};

const waitForReady = function (readyEvent: string): Promise<void> {
  return new Promise(function (resolve, reject) {
    initEmitter.once(readyEvent, function () {
      resolve();
    });
  });
};

const shutdown = async function () {
  await cleanup();

  Deno.exit();
};

const start = async function () {
  // make sure we are starting fresh
  await cleanup();
  const VALIDATOR_DIR = getValidatorDir();
  const HARDHAT_DIR = getHardhatDir();

  if (typeof VALIDATOR_DIR !== "string")
    throw new Error("you must supply path to Validator");
  if (typeof HARDHAT_DIR !== "string")
    throw new Error("you must supply path to Hardhat");

  // Run a local hardhat node
  const hardhat = Deno.run({
    cwd: HARDHAT_DIR,
    cmd: ["npm", "run", "up"],
    stdout: "piped",
    stderr: "piped",
  });

  const hardhatReadyEvent = "hardhat ready";
  // NOTE: the process should keep running until we kill it
  pipeNamedSubprocess(cyan("Hardhat"), hardhat.stdout, Deno.stdout, {
    readyEvent: hardhatReadyEvent,
    message: "Mined empty block",
  });
  pipeNamedSubprocess(red("Hardhat"), hardhat.stderr, Deno.stderr);

  // wait until initialization is done
  await waitForReady(hardhatReadyEvent);

  // Deploy the Registry to the Hardhat node
  const deployRegistry = Deno.run({
    cwd: HARDHAT_DIR,
    cmd: [
      "npx",
      "hardhat",
      "run",
      "--network",
      "localhost",
      "scripts/deploy.ts",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  pipeNamedSubprocess(
    brightGreen("Deploy Registry:"),
    deployRegistry.stdout,
    Deno.stdout
  );
  pipeNamedSubprocess(
    red("Deploy Registry:"),
    deployRegistry.stderr,
    Deno.stderr
  );

  // wait till the deploy finishes
  await deployRegistry.status();

  // Add the registry address to the Validator config
  const configFilePath = join(VALIDATOR_DIR, "local/api/config.json");
  const validatorConfig = JSON.parse(await Deno.readTextFile(configFilePath));
  validatorConfig.Chains[0].Registry.ContractAddress =
    "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";

  await Deno.writeTextFile(
    configFilePath,
    JSON.stringify(validatorConfig, null, 2)
  );

  // Add a .env file to the validator
  const validatorEnv = await Deno.readTextFile(
    join(__dirname, ".env_validator")
  );
  await Deno.writeTextFile(
    join(VALIDATOR_DIR, "local/api/.env_validator"),
    validatorEnv
  );

  const validatorReadyEvent = "validator ready";
  // start the validator
  const validator = Deno.run({
    cwd: VALIDATOR_DIR,
    cmd: ["make", "local-up"],
    stdout: "piped",
    stderr: "piped",
  });

  // NOTE: the process should keep running until we kill it
  pipeNamedSubprocess(magenta("Validator"), validator.stdout, Deno.stdout, {
    readyEvent: validatorReadyEvent,
    message: "processing height"
  });
  pipeNamedSubprocess(red("Validator"), validator.stderr, Deno.stderr, {
    fails: {
      message: "Cannot connect to the Docker daemon",
      hint: "Looks like we cannot connect to Docker.  Do you have the Docker running?"
    }
  });

  // copy the api spec to a place the tests can find it
  const mkdirTemp = Deno.run({
    cmd: ["mkdir", "./tmp"],
  });
  await mkdirTemp.status();

  const openApiSpec = Deno.run({
    cmd: [
      "cp",
      join(VALIDATOR_DIR, "..", "tableland-openapi-spec.yaml"),
      "./tmp",
    ],
  });
  await openApiSpec.status();

  // wait until initialization is done
  await waitForReady(validatorReadyEvent);

  console.log("\n\n******  Tableland is running!  ******");
  console.log("             _________");
  console.log("         ___/         \\");
  console.log("        /              \\");
  console.log("       /                \\");
  console.log("______/                  \\______\n\n");
};

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGQUIT", shutdown);

await start();
