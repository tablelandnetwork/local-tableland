import { /*dirname,*/ isAbsolute, join, resolve } from "node:path";
import { EventEmitter } from "node:events";
//import { fileURLToPath } from "url";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv)).argv
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = dirname(__filename);


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
    arg: "verbose"
  }
];

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
};

export const confGetter = async function (confName: string) {
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
      // to calling cwd and build the absolute path
      val = resolve(process.cwd(), val);
      return val;
    }

    return val;
  };
};

export const pipeNamedSubprocess = async function (
  prefix: string,
  prcss: any,
  options?: any
) {
  let ready = !(options && options.message);
  const fails = options?.fails;
  const verbose = options.verbose;

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
export const waitForReady = function (readyEvent: string, emitter: EventEmitter): Promise<void> {
  return new Promise(function (resolve) {
    emitter.once(readyEvent, () => resolve());
  });
};

