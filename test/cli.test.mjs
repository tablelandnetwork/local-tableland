import chai from "chai";
import shell from "shelljs";
import { join } from "path";

const expect = chai.expect;

describe("Project builder", function () {
  // Store absolute paths to the current working directory & path to tmp dir
  // Running on containers can cause unexpected behavior with relative paths
  const cwd = process.cwd();
  const pathToTmp = join(cwd, "tmp");

  // Tests need some extra time running `up.js` (async CLI inputs & spins up LT)
  this.timeout(20000); // Starting up LT takes 3000-7000ms; shutting down takes <10-10000ms
  beforeEach(function () {
    // Create tmp dir to run the project builder in
    shell.rm("-rf", pathToTmp);
    shell.mkdir("-p", pathToTmp);
    shell.cd(pathToTmp);
  });

  afterEach(function () {
    // Cleanup tmp dir
    shell.cd(join(pathToTmp, ".."));
    shell.rm("-rf", pathToTmp);
  });

  it("should create a config file", async function () {
    /* eslint-disable node/no-unsupported-features/es-syntax */
    // Pass input from `choose-yes.txt` to `up.js` to answer `y` to prompt
    shell
      .cat(join(pathToTmp, "..", "test", "choose-yes.txt"))
      .exec(join(pathToTmp, "..", "dist", "esm", "up.js --init"));
    // Import the created config file & example config file
    const createdFile = await import(join(pathToTmp, "tableland.config.js"));
    const exampleFile = await import(
      join(pathToTmp, "..", "dist", "esm", "tableland.config.example.js")
    );

    // Ensure the files are the same (i.e., use same default values)
    expect(createdFile).to.eql(exampleFile);
  });

  it("should do nothing if config file already exists", async function () {
    // Pass input from `choose-yes.txt` to `up.js` to answer `y` to prompt
    shell
      .cat(join(pathToTmp, "..", "test", "choose-yes.txt"))
      .exec(join(pathToTmp, "..", "dist", "esm", "up.js --init"));
    // Check the file was created in the tmp dir
    const wasCreated = shell.ls(pathToTmp);
    expect(wasCreated[0]).to.eql("tableland.config.js");

    // Try to run it again, which should do nothing due to file existing
    const cliOut = shell
      .cat(join(pathToTmp, "..", "test", "choose-yes.txt"))
      .exec(join(pathToTmp, "..", "dist", "esm", "up.js --init"));

    // Config file should already exist
    expect(cliOut.toString()).to.match(
      /Config file already exists, nothing to do/
    );
  });

  it("should do nothing if user says not to", async function () {
    // Pass input from `choose-no.txt` to `up.js` to answer `yn to prompt
    const cliOut = shell
      .cat(join(pathToTmp, "..", "test", "choose-no.txt"))
      .exec(join(pathToTmp, "..", "dist", "esm", "up.js --init"));

    // `stdout` should include message
    expect(cliOut.toString()).to.match(/run this again anytime/);

    // No file should have been created
    expect(import(join(pathToTmp, "tableland.config.js"))).to.be.rejectedWith(
      "Cannot find module"
    );
  });
});
