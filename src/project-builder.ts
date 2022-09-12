import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import chalk from "chalk";
import prompt from "enquirer";
import sentencer from "sentencer";
import exampleConfig from "./tableland.config.example.js"

export const projectBuilder = async function () {
  const choices = [
    "No, I'll set things up myself",
    "Yes, but I want to control everything each step of the way",
    "Yes, setup everything for me and stop asking me questions"
  ];
  // @ts-ignore https://github.com/enquirer/enquirer/issues/379
  const select = new prompt.Select({
    name: "wtd",
    message: "Couldn't find an existing Tableland project, do you to create a new project?",
    choices: [...choices]
  });

  const shouldCreate = await select.run();
  if (shouldCreate === choices[0]) {
    console.log(
`${chalk.bold.yellow(sentencer.make("OK, have a wonderfully {{ adjective }} {{ noun }}!"))}
  Checkout our docs at https://docs.tableland.xyz
  Star us on github at https://github.com/tablelandnetwork/local-tableland`
    )
    return;
  }

  let mkdirArtifacts = true;
  if (shouldCreate === choices[1]) {
    // @ts-ignore https://github.com/enquirer/enquirer/issues/379
    const confirmer = new prompt.Confirm({
      name: "mkdirartifacts",
      message: "Is it ok to create a directory for Tableland's Validator and Registry repositories?",
    });

    mkdirArtifacts = await confirmer.run();
  }

  if (!mkdirArtifacts) {
    console.log(chalk.bold.yellow(sentencer.make("OK, not creating any directories. goodbye")));
    return;
  }
  // make an artifacts directory
  spawnSync("mkdir", ["tableland-artifacts"]);

  let gitCloneValidator = true;
  if (shouldCreate === choices[1]) {
    // @ts-ignore https://github.com/enquirer/enquirer/issues/379
    const confirmer = new prompt.Confirm({
      name: "gitcloneval",
      message: "Is it ok to use git to clone the Validator repository?",
    });

    gitCloneValidator = await confirmer.run();
  }

  if (!gitCloneValidator) {
    console.log(chalk.yellow("OK, not cloning the Validator repo. Goodbye"));
    return;
  }

  spawnSync("git", ["clone", "git@github.com:tablelandnetwork/go-tableland.git"], {
    cwd: "tableland-artifacts"
  });

  let gitCloneEvm = true;
  if (shouldCreate === choices[1]) {
    // @ts-ignore https://github.com/enquirer/enquirer/issues/379
    const confirmer = new prompt.Confirm({
      name: "gitcloneevm",
      message: "Is it ok to use git to clone the Registry contract repository?",
    });

    gitCloneEvm = await confirmer.run()
  }

  if (!gitCloneEvm) {
    console.log(chalk.yellow("OK, not cloning the Registry repo. Goodbye"));
    return;
  }

  // clone the validator
  spawnSync("git", ["clone", "git@github.com:tablelandnetwork/evm-tableland.git"], {
    cwd: "tableland-artifacts"
  });

  let createConfig = true;
  if (shouldCreate === choices[1]) {
    // @ts-ignore https://github.com/enquirer/enquirer/issues/379
    const confirmer = new prompt.Confirm({
      name: "gitcloneevm",
      message: "Is it ok to create a config file?",
    });

    createConfig = await confirmer.run();
  }

  if (!createConfig) {
    console.log(chalk.yellow("OK, not creating a config file. Goodbye"));
    return;
  }

  // Copy the example config to the new project
  writeFileSync("tableland.config.js", "module.exports = " + JSON.stringify(exampleConfig, null, 2));

};
