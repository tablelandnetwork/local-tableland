"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectBuilder = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const chalk_js_1 = require("./chalk.js");
const enquirer_1 = __importDefault(require("enquirer"));
const sentencer_1 = __importDefault(require("sentencer"));
const tableland_config_example_js_1 = __importDefault(require("./tableland.config.example.js"));
const docsLink = "https://docs.tableland.xyz";
const githubLink = "https://github.com/tablelandnetwork";
const projectBuilder = function () {
    return __awaiter(this, void 0, void 0, function* () {
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
        const shouldCreate = yield select.run();
        if (shouldCreate === choices[0]) {
            console.log(`${chalk_js_1.chalk.yellow.bold(sentencer_1.default.make("OK, have a wonderful {{ noun }}!"))}
  Don't forget to checkout our docs at ${chalk_js_1.chalk.cyan(docsLink)}
  and star us on github at ${chalk_js_1.chalk.cyan(githubLink)}`);
            return;
        }
        let mkdirArtifacts = true;
        if (shouldCreate === choices[1]) {
            // @ts-ignore https://github.com/enquirer/enquirer/issues/379
            const confirmer = new enquirer_1.default.Confirm({
                name: "mkdirartifacts",
                message: "Is it ok to create a directory for Tableland's Validator and Registry repositories?",
            });
            mkdirArtifacts = yield confirmer.run();
        }
        if (!mkdirArtifacts) {
            console.log(chalk_js_1.chalk.yellow(`${chalk_js_1.chalk.bold("Not")} creating any directories or cloning any repositories.`));
        }
        else {
            console.log(chalk_js_1.chalk.yellow(`Creating a ${chalk_js_1.chalk.bold("tableland-artifacts")} directory.`));
            // make an artifacts directory
            (0, node_child_process_1.spawnSync)("mkdir", ["tableland-artifacts"]);
            let gitCloneValidator = true;
            if (shouldCreate === choices[1]) {
                // @ts-ignore https://github.com/enquirer/enquirer/issues/379
                const confirmer = new enquirer_1.default.Confirm({
                    name: "gitcloneval",
                    message: "Is it ok to use git to clone the Validator repository?",
                });
                gitCloneValidator = yield confirmer.run();
            }
            if (!gitCloneValidator) {
                console.log(chalk_js_1.chalk.yellow(`${chalk_js_1.chalk.bold("Not")} cloning the Validator repository.`));
            }
            else {
                console.log(chalk_js_1.chalk.yellow("Cloning the Validator repository."));
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
                gitCloneEvm = yield confirmer.run();
            }
            if (!gitCloneEvm) {
                console.log(chalk_js_1.chalk.yellow(`${chalk_js_1.chalk.bold("Not")} cloning the Registry repository.`));
            }
            else {
                console.log(chalk_js_1.chalk.yellow("Cloning the Registry repository."));
                // clone the validator
                (0, node_child_process_1.spawnSync)("git", ["clone", "git@github.com:tablelandnetwork/evm-tableland.git"], {
                    cwd: "tableland-artifacts"
                });
            }
        }
        let createConfig = true;
        if (shouldCreate === choices[1]) {
            // @ts-ignore https://github.com/enquirer/enquirer/issues/379
            const confirmer = new enquirer_1.default.Confirm({
                name: "gitcloneevm",
                message: "Is it ok to create a config file?",
            });
            createConfig = yield confirmer.run();
        }
        if (!createConfig) {
            console.log(chalk_js_1.chalk.yellow(`${chalk_js_1.chalk.bold("Not")} creating a config file.`));
        }
        else {
            console.log(chalk_js_1.chalk.yellow(`Creating a config file.`));
            // Copy the example config to the new project
            (0, node_fs_1.writeFileSync)("tableland.config.js", "module.exports = " + JSON.stringify(tableland_config_example_js_1.default, null, 2));
        }
        console.log(`${chalk_js_1.chalk.yellow.bold("Setup is done!")}
  If you didn't skip any steps you you can start a local Tableland Network by running this command again.
  Use the --help flag to see an overview of usage for this cli.
  If you skipped some of the steps, edit your tableland.config.js file before starting.
  Checkout our docs at ${chalk_js_1.chalk.cyan(docsLink)}
  All the source is on github at ${chalk_js_1.chalk.cyan(githubLink)}`);
    });
};
exports.projectBuilder = projectBuilder;
//# sourceMappingURL=project-builder.js.map