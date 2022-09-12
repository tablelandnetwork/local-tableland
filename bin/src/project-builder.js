import { writeFileSync } from "node:fs";
import prompt from "enquirer";
import exampleConfig from "./tableland.config.example.js";
export const projectBuilder = async function () {
    // @ts-ignore https://github.com/enquirer/enquirer/issues/379
    const select = new prompt.Select({
        name: "wtd",
        message: "Couldn't find an existing Tableland project, do you want to create a new one?",
        choices: ["yes", "no"]
    });
    const shouldCreate = await select.run();
    if (shouldCreate === "no")
        return;
    // Copy the example config to the new project
    writeFileSync("tableland.config.js", JSON.stringify(exampleConfig, null, 2));
};
//# sourceMappingURL=project-builder.js.map