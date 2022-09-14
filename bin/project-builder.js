var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import chalk from "chalk";
import prompt from "enquirer";
import sentencer from "sentencer";
import exampleConfig from "./tableland.config.example.js";
const docsLink = "https://docs.tableland.xyz";
const githubLink = "https://github.com/tablelandnetwork";
export const projectBuilder = function () {
    return __awaiter(this, void 0, void 0, function* () {
        const choices = [
            "No, I don't want to create a project right now",
            "Yes, and I want to control everything each step of the way",
            "Yes, but setup everything for me and stop asking me questions"
        ];
        // @ts-ignore https://github.com/enquirer/enquirer/issues/379
        const select = new prompt.Select({
            name: "wtd",
            message: "Couldn't find an existing Tableland project, do you want to create a new project?",
            choices: [...choices]
        });
        const shouldCreate = yield select.run();
        if (shouldCreate === choices[0]) {
            console.log(`${chalk.bold.yellow(sentencer.make("OK, have a wonderfully {{ adverb }} {{ noun }}!"))}
  Don't forget to checkout our docs at ${chalk.cyan(docsLink)}
  and star us on github at ${chalk.cyan(githubLink)}`);
            return;
        }
        let mkdirArtifacts = true;
        if (shouldCreate === choices[1]) {
            // @ts-ignore https://github.com/enquirer/enquirer/issues/379
            const confirmer = new prompt.Confirm({
                name: "mkdirartifacts",
                message: "Is it ok to create a directory for Tableland's Validator and Registry repositories?",
            });
            mkdirArtifacts = yield confirmer.run();
        }
        if (!mkdirArtifacts) {
            console.log(chalk.yellow(`${chalk.bold("Not")} creating any directories.`));
        }
        else {
            console.log(chalk.yellow(`Creating a ${chalk.bold("tableland-artifacts")} directory.`));
            // make an artifacts directory
            spawnSync("mkdir", ["tableland-artifacts"]);
        }
        let gitCloneValidator = true;
        if (shouldCreate === choices[1]) {
            // @ts-ignore https://github.com/enquirer/enquirer/issues/379
            const confirmer = new prompt.Confirm({
                name: "gitcloneval",
                message: "Is it ok to use git to clone the Validator repository?",
            });
            gitCloneValidator = yield confirmer.run();
        }
        if (!gitCloneValidator) {
            console.log(chalk.yellow(`${chalk.bold("Not")} cloning the Validator repository.`));
        }
        else {
            console.log(chalk.yellow("Cloning the Validator repository."));
            spawnSync("git", ["clone", "git@github.com:tablelandnetwork/go-tableland.git"], {
                cwd: "tableland-artifacts"
            });
        }
        let gitCloneEvm = true;
        if (shouldCreate === choices[1]) {
            // @ts-ignore https://github.com/enquirer/enquirer/issues/379
            const confirmer = new prompt.Confirm({
                name: "gitcloneevm",
                message: "Is it ok to use git to clone the Registry contract repository?",
            });
            gitCloneEvm = yield confirmer.run();
        }
        if (!gitCloneEvm) {
            console.log(chalk.yellow(`${chalk.bold("Not")} cloning the Registry repository.`));
        }
        else {
            console.log(chalk.yellow("Cloning the Registry repository."));
            // clone the validator
            spawnSync("git", ["clone", "git@github.com:tablelandnetwork/evm-tableland.git"], {
                cwd: "tableland-artifacts"
            });
        }
        let createConfig = true;
        if (shouldCreate === choices[1]) {
            // @ts-ignore https://github.com/enquirer/enquirer/issues/379
            const confirmer = new prompt.Confirm({
                name: "gitcloneevm",
                message: "Is it ok to create a config file?",
            });
            createConfig = yield confirmer.run();
        }
        if (!createConfig) {
            console.log(chalk.yellow(`${chalk.bold("Not")} creating a config file.`));
        }
        else {
            console.log(chalk.yellow(`Creating a config file.`));
            // Copy the example config to the new project
            writeFileSync("tableland.config.js", "module.exports = " + JSON.stringify(exampleConfig, null, 2));
        }
        console.log(`${chalk.bold.yellow("Setup is done!")}
  If you didn't skip any steps you you can start a local Tableland Network by running this command again.
  Use the --help flag to see an overview of usage for this cli.
  Checkout our docs at ${chalk.cyan(docsLink)}
  All the source is on github at ${chalk.cyan(githubLink)}`);
    });
};
//# sourceMappingURL=project-builder.js.map