"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectBuilder = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const chalk_1 = __importDefault(require("chalk"));
const enquirer_1 = __importDefault(require("enquirer"));
const sentencer_1 = __importDefault(require("sentencer"));
const tableland_config_example_js_1 = __importDefault(require("./tableland.config.example.js"));
const docsLink = "https://docs.tableland.xyz";
const githubLink = "https://github.com/tablelandnetwork";
const projectBuilder = async function () {
    const choices = [
        "No, I don't want to create a project right now",
        "Yes, and I want to control everything each step of the way",
        "Yes, but setup everything for me and stop asking me questions"
    ];
    // @ts-ignore https://github.com/enquirer/enquirer/issues/379
    const select = new enquirer_1.default.Select({
        name: "wtd",
        message: "Couldn't find an existing Tableland project, do you want to create a new project?",
        choices: [...choices]
    });
    const shouldCreate = await select.run();
    if (shouldCreate === choices[0]) {
        console.log(`${chalk_1.default.bold.yellow(sentencer_1.default.make("OK, have a wonderful {{ noun }}!"))}
  Don't forget to checkout our docs at ${chalk_1.default.cyan(docsLink)}
  and star us on github at ${chalk_1.default.cyan(githubLink)}`);
        return;
    }
    let mkdirArtifacts = true;
    if (shouldCreate === choices[1]) {
        // @ts-ignore https://github.com/enquirer/enquirer/issues/379
        const confirmer = new enquirer_1.default.Confirm({
            name: "mkdirartifacts",
            message: "Is it ok to create a directory for Tableland's Validator and Registry repositories?",
        });
        mkdirArtifacts = await confirmer.run();
    }
    if (!mkdirArtifacts) {
        console.log(chalk_1.default.yellow(`${chalk_1.default.bold("Not")} creating any directories.`));
    }
    else {
        console.log(chalk_1.default.yellow(`Creating a ${chalk_1.default.bold("tableland-artifacts")} directory.`));
        // make an artifacts directory
        (0, node_child_process_1.spawnSync)("mkdir", ["tableland-artifacts"]);
    }
    let gitCloneValidator = true;
    if (shouldCreate === choices[1]) {
        // @ts-ignore https://github.com/enquirer/enquirer/issues/379
        const confirmer = new enquirer_1.default.Confirm({
            name: "gitcloneval",
            message: "Is it ok to use git to clone the Validator repository?",
        });
        gitCloneValidator = await confirmer.run();
    }
    if (!gitCloneValidator) {
        console.log(chalk_1.default.yellow(`${chalk_1.default.bold("Not")} cloning the Validator repository.`));
    }
    else {
        console.log(chalk_1.default.yellow("Cloning the Validator repository."));
        (0, node_child_process_1.spawnSync)("git", ["clone", "git@github.com:tablelandnetwork/go-tableland.git"], {
            cwd: "tableland-artifacts"
        });
    }
    let gitCloneEvm = true;
    if (shouldCreate === choices[1]) {
        // @ts-ignore https://github.com/enquirer/enquirer/issues/379
        const confirmer = new enquirer_1.default.Confirm({
            name: "gitcloneevm",
            message: "Is it ok to use git to clone the Registry contract repository?",
        });
        gitCloneEvm = await confirmer.run();
    }
    if (!gitCloneEvm) {
        console.log(chalk_1.default.yellow(`${chalk_1.default.bold("Not")} cloning the Registry repository.`));
    }
    else {
        console.log(chalk_1.default.yellow("Cloning the Registry repository."));
        // clone the validator
        (0, node_child_process_1.spawnSync)("git", ["clone", "git@github.com:tablelandnetwork/evm-tableland.git"], {
            cwd: "tableland-artifacts"
        });
    }
    let createConfig = true;
    if (shouldCreate === choices[1]) {
        // @ts-ignore https://github.com/enquirer/enquirer/issues/379
        const confirmer = new enquirer_1.default.Confirm({
            name: "gitcloneevm",
            message: "Is it ok to create a config file?",
        });
        createConfig = await confirmer.run();
    }
    if (!createConfig) {
        console.log(chalk_1.default.yellow(`${chalk_1.default.bold("Not")} creating a config file.`));
    }
    else {
        console.log(chalk_1.default.yellow(`Creating a config file.`));
        // Copy the example config to the new project
        (0, node_fs_1.writeFileSync)("tableland.config.js", "module.exports = " + JSON.stringify(tableland_config_example_js_1.default, null, 2));
    }
    console.log(`${chalk_1.default.bold.yellow("Setup is done!")}
  If you didn't skip any steps you you can start a local Tableland Network by running this command again.
  Use the --help flag to see an overview of usage for this cli.
  Checkout our docs at ${chalk_1.default.cyan(docsLink)}
  All the source is on github at ${chalk_1.default.cyan(githubLink)}`);
};
exports.projectBuilder = projectBuilder;
//# sourceMappingURL=project-builder.js.map