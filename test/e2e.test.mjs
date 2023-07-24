import chai from "chai";
import {
  checkPortInUse,
  getAccounts,
  getDatabase,
  getRegistry,
  getRegistryPort,
  getValidator,
} from "../dist/esm/util.js";
import { LocalTableland } from "../dist/esm/main.js";
import {
  logMetrics,
  measureExecutionTime,
  startMockServer,
  stopMockServer,
} from "./util.mjs";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const expect = chai.expect;
const localTablelandChainId = 31337;
const executionTimes = {
  start: [],
  shutdown: [],
};

describe("Validator and Chain startup and shutdown", function () {
  let server;
  let lt;
  const defaultPort = 8545; // Used for hardhat

  this.timeout(30000); // Starting up LT takes 3000-7000ms; shutting down takes <10-10000ms
  afterEach(async function () {
    // Ensure all processes are cleaned up after each test
    try {
      if (server) {
        await stopMockServer(server);
        server = undefined;
      }
      // Ensure both validator and registry haven't already been shut down & cleaned up
      // before attempting to shut them down
      if (lt.validator !== undefined && lt.registry !== undefined) {
        const shutdownExecutionTime = await measureExecutionTime(() =>
          lt.shutdown()
        );
        executionTimes.shutdown.push(shutdownExecutionTime);
        lt = undefined;
      }
    } catch (err) {
      expect.fail(
        `failed to cleanup processes after each test: ${err.message}`
      );
    }
  });

  it("successfully starts and shuts down", async function () {
    lt = new LocalTableland({ silent: true });
    try {
      const startupExecutionTime = await measureExecutionTime(() => lt.start());
      executionTimes.start.push(startupExecutionTime);
      expect(lt.validator).to.not.equal(undefined);
      expect(lt.registry).to.not.equal(undefined);
    } catch (err) {
      expect.fail(`failed to start local network: ${err.message}`);
    }

    try {
      const shutdownExecutionTime = await measureExecutionTime(() =>
        lt.shutdown()
      );
      executionTimes.shutdown.push(shutdownExecutionTime);
      expect(lt.validator).to.be.equal(undefined);
      expect(lt.registry).to.be.equal(undefined);
    } catch (err) {
      expect.fail(`failed to shut down local network: ${err.message}`);
    }
  });

  it("successfully starts with retry logic after port 8545 initially in use", async function () {
    lt = new LocalTableland({ silent: true });
    // Start a server on port 8545 to block Local Tableland from using it
    server = await startMockServer(defaultPort);
    // Verify that the server is running on port 8545
    const portInUse = await checkPortInUse(defaultPort);
    expect(portInUse).to.equal(true);

    // Start Local Tableland with a promise that will resolve when the server is closed
    let startLt;
    const startFn = async () => {
      startLt = lt.start();
      return startLt;
    };
    const measureStartLt = measureExecutionTime(startFn);
    // Shut down the server after 300ms, allowing Local Tableland to use port 8545
    // This will execute 2 of 5 retries on port 8545 before opening the port
    setTimeout(async function () {
      await stopMockServer(server);
    }, 300);

    try {
      const startupExecutionTime = await measureStartLt;
      executionTimes.start.push(startupExecutionTime);
    } catch (err) {
      expect.fail(`failed to start local network: ${err.message}`);
    }
  });

  it("fails to start due to port 8545 in use", async function () {
    lt = new LocalTableland({ silent: true });
    // Start a server on port 8545 to block Local Tableland from using it
    server = await startMockServer(defaultPort);
    // Check if it is in use
    const portInUse = await checkPortInUse(defaultPort);
    expect(portInUse).to.equal(true);

    // Local Tableland should not start successfully
    try {
      const startupExecutionTime = await measureExecutionTime(() => lt.start());
      executionTimes.start.push(startupExecutionTime);
    } catch (err) {
      expect(err.message).to.be.equal(
        `port ${defaultPort} already in use; try enabling 'fallback' option`
      );
    }
  });

  describe("with fallback enabled", function () {
    it("successfully starts with fallback port, works with SDK, and resets config", async function () {
      lt = new LocalTableland({ silent: true, fallback: true });
      // Start a server on port 8545 to block Local Tableland from using it
      server = await startMockServer(defaultPort);
      // Check if it is in use
      const portInUse = await checkPortInUse(defaultPort);
      expect(portInUse).to.equal(true);

      // Local Tableland should start successfully on first fallback port 8546
      try {
        const startupExecutionTime = await measureExecutionTime(() =>
          lt.start()
        );
        executionTimes.start.push(startupExecutionTime);
      } catch (err) {
        expect.fail(`failed to start local network: ${err.message}`);
      }

      // Config file should have been updated to use fallback port 8546
      const newPort = getRegistryPort(lt);
      const configFilePath = join(lt.validator.validatorDir, "config.json");
      let configFile = readFileSync(configFilePath);
      let validatorConfig = JSON.parse(configFile.toString());
      expect(validatorConfig.Chains[0].Registry.EthEndpoint).to.equal(
        `ws://localhost:${newPort}`
      );

      // Should still be able to use SDK
      const accounts = getAccounts(lt);
      expect(accounts.length).to.equal(20);
      const signer = accounts[1];
      const db = getDatabase(signer);
      try {
        await db.exec(`CREATE TABLE test_fallback (id INT);`);
      } catch (err) {
        expect.fail(`failed to use SDK on fallback port`);
      }

      // Shut down Local Tableland and ensure validator config file is reset
      const shutdownExecutionTime = await measureExecutionTime(() =>
        lt.shutdown()
      );
      executionTimes.shutdown.push(shutdownExecutionTime);
      configFile = readFileSync(configFilePath);
      validatorConfig = JSON.parse(configFile.toString());
      expect(validatorConfig.Chains[0].Registry.EthEndpoint).to.equal(
        `ws://localhost:8545`
      );
    });

    it("fails to start due to port 8545 and all fallbacks in use", async function () {
      lt = new LocalTableland({ silent: true, fallback: true });
      // Set up static set of fallback ports (shown in `main.#_start()` with `useFallbackPort`)
      const fallbackPorts = Array.from(
        { length: 3 },
        (_, i) => defaultPort + i + 1
      );
      const ports = [defaultPort, ...fallbackPorts];
      // Start servers on all ports
      const servers = await Promise.all(
        ports.map((port) => startMockServer(port))
      );
      // Check each port to make sure each is in use
      for (const port of ports) {
        const portInUse = await checkPortInUse(port);
        expect(portInUse).to.equal(true);
      }

      try {
        // Start Local Tableland, which will attempt to use port 8545 and fail
        const startupExecutionTime = await measureExecutionTime(() =>
          lt.start()
        );
        executionTimes.start.push(startupExecutionTime);
        // If starting did not throw an error, fail the test
        throw new Error(
          "expected starting local network to fail, but it didn't"
        );
      } catch (err) {
        // Local Tableland failed to start as expected because the port is blocked
        expect(err.message).to.equal(
          `cannot start a local chain, port ${defaultPort} and all fallbacks in use`
        );
      }
      // Ensure Local Tableland subprocesses did not start and/or are not hanging
      expect(lt.validator).to.equal(undefined);
      expect(lt.registry).to.equal(undefined);

      // Stop the servers to unbind port 8545 and fallbacks
      await Promise.all(servers.map((server) => stopMockServer(server)));
      // Local Tableland can now start successfully
      try {
        const startupExecutionTime = await measureExecutionTime(() =>
          lt.start()
        );
        executionTimes.start.push(startupExecutionTime);
      } catch (err) {
        expect.fail(`failed to start local network: ${err.message}`);
      }
    });

    it("successfully starts with custom Registry port", async function () {
      const customPort = 9999;
      lt = new LocalTableland({
        silent: true,
        fallback: true,
        registryPort: customPort,
      });
      // Make sure it is not in use
      const portInUse = await checkPortInUse(customPort);
      expect(portInUse).to.equal(false);
      // Local Tableland should start successfully on custom Registry port
      try {
        const startupExecutionTime = await measureExecutionTime(() =>
          lt.start()
        );
        executionTimes.start.push(startupExecutionTime);
      } catch (err) {
        expect.fail(`failed to start local network: ${err.message}`);
      }
      const ltPort = getRegistryPort(lt);
      expect(ltPort).to.equal(customPort);
    });

    it("successfully starts with fallback port if custom Registry port in use", async function () {
      const customPort = 9999;
      lt = new LocalTableland({
        silent: true,
        fallback: true,
        registryPort: customPort,
      });
      // Start a server on custom port to block Local Tableland from using it
      server = await startMockServer(customPort);
      // Check if it is in use
      const portInUse = await checkPortInUse(customPort);
      expect(portInUse).to.equal(true);

      // Local Tableland should start successfully on first fallback port,
      // which is `customPort + 1`
      try {
        const startupExecutionTime = await measureExecutionTime(() =>
          lt.start()
        );
        executionTimes.start.push(startupExecutionTime);
      } catch (err) {
        expect.fail(`failed to start local network: ${err.message}`);
      }
      const ltPort = getRegistryPort(lt);
      expect(ltPort).to.equal(customPort + 1);
    });
  });
});

describe("Validator, Chain, and SDK work end to end", function () {
  const lt = new LocalTableland({
    silent: true,
  });
  // Defaults to port on `127.0.0.1:8545`, so passing `lt` isn't strictly needed
  // (i.e., a fallback must be enabled *and* it must actually happen)
  const accounts = getAccounts(lt);

  // These tests take a bit longer than normal since we are running them against an actual network
  this.timeout(30000);
  before(async function () {
    try {
      const startupExecutionTime = await measureExecutionTime(() => lt.start());
      executionTimes.start.push(startupExecutionTime);
      await new Promise((resolve) => setTimeout(() => resolve(), 2000));
    } catch (err) {
      expect.fail(`failed to start local network: ${err.message}`);
    }
  });

  after(async function () {
    try {
      const shutdownExecutionTime = await measureExecutionTime(() =>
        lt.shutdown()
      );
      executionTimes.shutdown.push(shutdownExecutionTime);
    } catch (err) {
      expect.fail(`failed to cleanup processes: ${err.message}`);
    }

    // Calculate & log the min, max, median, and average start and shutdown times
    console.log(`\nExecution metrics`);
    logMetrics("start()", executionTimes.start);
    logMetrics("shutdown()", executionTimes.shutdown);
  });

  it("creates a table that can be read from", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    // `key` is a reserved word in sqlite.
    const res = await db.exec(
      `CREATE TABLE test_create_read (keyy TEXT, val TEXT);`
    );

    const data = await db.prepare(`SELECT * FROM ${res.meta.txn.name};`).all();
    expect(data.results).to.eql([]);
  });

  it("create a table that can be written to", async function () {
    this.timeout(50000);
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_create_write (keyy TEXT, val TEXT);")
      .run();

    const tableName = createMetadata.txn?.name ?? "";
    expect(tableName).to.match(/^test_create_write_31337_\d+$/);

    const insertRes = await db
      .prepare(`INSERT INTO ${tableName} (keyy, val) VALUES ('tree', 'aspen');`)
      .run();

    expect(insertRes.success).to.eql(true);
    expect(typeof insertRes.meta.duration).to.eql("number");

    const readRes = await db.prepare(`SELECT * FROM ${tableName};`).all();

    expect(readRes.results).to.eql([{ keyy: "tree", val: "aspen" }]);
  });

  it("table cannot be written to unless caller is allowed", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_not_allowed (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const data = await db.prepare(`SELECT * FROM ${queryableName};`).all();

    expect(data.results).to.eql([]);

    const signer2 = accounts[2];
    const db2 = getDatabase(signer2);

    await expect(
      (async function () {
        await db2
          .prepare(
            `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
          )
          .all();
      })()
    ).to.be.rejectedWith(
      // TODO: the old error was "db query execution failed (code: ACL, msg: not enough privileges)"
      //       we now get "ALL_ERROR", which is not very helpful in understanding what went wrong.
      "ALL_ERROR"
    );

    const data2 = await db2.prepare(`SELECT * FROM ${queryableName};`).all();
    expect(data2.results).to.eql([]);
  });

  it("create a table can have a row deleted", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_create_delete (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const write1 = await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    expect(typeof write1.meta.txn.transactionHash).to.eql("string");

    const write2 = await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'pine')`
      )
      .all();

    expect(typeof write2.meta.txn.transactionHash).to.eql("string");

    const data = await db.prepare(`SELECT * FROM ${queryableName};`).all();
    expect(data.results.length).to.eql(2);

    const delete1 = await db
      .prepare(`DELETE FROM ${queryableName} WHERE val = 'pine';`)
      .all();

    expect(typeof delete1.meta.txn.transactionHash).to.eql("string");

    const data2 = await db.prepare(`SELECT * FROM ${queryableName};`).all();
    await expect(data2.results.length).to.eql(1);
  }, 30000);

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it("read via `raw` method returns data with `table` output", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    const data = await db
      .prepare(`SELECT * FROM ${queryableName};`, {
        output: "table",
      })
      .raw();

    expect(data).to.eql([["tree", "aspen"]]);
  });

  it("count rows in a table", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_count (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'pine')`
      )
      .all();

    const data = await db
      .prepare(`SELECT COUNT(*) FROM ${queryableName};`)
      .all();

    expect(data.results).to.eql([{ "count(*)": 2 }]);
  });

  it("read a single row with `first` method", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    await db
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'pine')`
      )
      .all();

    const data = await db.prepare(`SELECT * FROM ${queryableName};`).first();

    expect(data).to.eql({ keyy: "tree", val: "aspen" });
  });

  it("list an account's tables", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);
    const registry = getRegistry(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_create_list (keyy TEXT, val TEXT);")
      .run();
    const tableId = createMetadata.txn?.tableId ?? "";

    const tablesMeta = await registry.listTables();

    expect(Array.isArray(tablesMeta)).to.eql(true);
    const table = tablesMeta.find((table) => table.tableId === tableId);

    expect(typeof table).to.equal("object");
    expect(table.chainId).to.eql(localTablelandChainId);
  });

  it("write statement validates table name prefix", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const prefix1 = "test_direct_invalid_write";
    await db.prepare(`CREATE TABLE ${prefix1} (keyy TEXT, val TEXT);`).run();

    const { meta: createMetadata2 } = await db
      .prepare("CREATE TABLE test_direct_invalid_write2 (keyy TEXT, val TEXT);")
      .run();
    const tableId2 = createMetadata2.txn?.tableId ?? "";

    // both tables owned by the same account
    // the prefix is for the first table, but id is for second table
    const invalidName = `${prefix1}_${localTablelandChainId}_${tableId2}`;

    await expect(
      (async function () {
        await db
          .prepare(
            `INSERT INTO ${invalidName} (keyy, val) VALUES ('tree', 'aspen')`
          )
          .all();
      })()
    ).to.be.rejectedWith(
      // TODO: old error was `calling ValidateWriteQuery: table prefix doesn't match (exp ${prefix2}, got ${prefix1})`
      //       the new error message isn't very informative
      "ALL_ERROR"
    );
  });

  it("write statement validates table ID", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const prefix = "test_direct_invalid_id_write";
    await db.prepare(`CREATE TABLE ${prefix} (keyy TEXT, val TEXT);`).run();

    // the tableId 0 does not exist since we start with tableId == 1
    const queryableName = `${prefix}_${localTablelandChainId}_0`;

    await expect(
      (async function () {
        await db
          .prepare(
            `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
          )
          .all();
      })()
    ).to.be.rejectedWith(
      // TODO: old error was `getting table: failed to get the table: sql: no rows in result set`
      //       the new error message isn't very informative
      "ALL_ERROR"
    );
  });

  it("allows setting controller", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);
    const registry = getRegistry(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_set_controller (keyy TEXT, val TEXT);")
      .run();
    const tableName = createMetadata.txn?.name ?? "";

    const { hash } = await registry.setController({
      // Set the controller to Hardhat #7
      controller: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
      tableName,
    });

    expect(typeof hash).to.eql("string");
    expect(hash.length).to.eql(66);
  });

  it("get controller returns an address", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);
    const registry = getRegistry(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_create_getcontroller (keyy TEXT, val TEXT);")
      .run();
    const tableName = createMetadata.txn?.name ?? "";

    // Hardhat #7
    const controllerAddress = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";

    const { hash } = await registry.setController({
      controller: controllerAddress,
      tableName,
    });

    expect(typeof hash).to.eql("string");
    expect(hash.length).to.eql(66);

    const controller = await registry.getController(tableName);

    expect(controller).to.eql(controllerAddress);
  });

  it("lock controller returns a transaction hash", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);
    const registry = getRegistry(signer);

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_create_lockcontroller (keyy TEXT, val TEXT);")
      .run();
    const tableName = createMetadata.txn?.name ?? "";

    // Hardhat #7
    const controllerAddress = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";

    const { hash } = await registry.setController({
      controller: controllerAddress,
      tableName,
    });

    expect(typeof hash).to.eql("string");
    expect(hash.length).to.eql(66);

    const tx = await registry.lockController(tableName);

    expect(typeof tx.hash).to.eql("string");
  });

  it("get the schema for a table", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);
    const validator = getValidator();

    const { meta: createMetadata } = await db
      .prepare("CREATE TABLE test_get_schema (keyy TEXT, val TEXT);")
      .run();
    const tableId = createMetadata.txn?.tableId ?? "";
    const tableName = createMetadata.txn?.name ?? "";

    const table = await validator.getTableById({
      chainId: localTablelandChainId,
      tableId,
    });

    expect(Array.isArray(table.schema.columns)).to.eql(true);
    expect(table.schema.columns.length).to.eql(2);
    expect(table.schema.columns[0]).to.eql({
      name: "keyy",
      type: "text",
    });
    expect(table.schema.columns[1]).to.eql({
      name: "val",
      type: "text",
    });
    expect(table.name).to.eql(tableName);
  });

  it("A write that violates table constraints throws error", async function () {
    const signer = accounts[1];
    const db = getDatabase(signer);

    const { meta: createMetadata } = await db
      .prepare(
        "CREATE TABLE test_create_tc_violation (id TEXT, name TEXT, PRIMARY KEY(id));"
      )
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await expect(
      (async function () {
        await db
          .prepare(`INSERT INTO ${queryableName} VALUES (1, '1'), (1, '1')`)
          .all();
      })()
    ).to.be.rejectedWith(
      // TODO: old error was
      //       `db query execution failed (code: SQLITE_UNIQUE constraint failed: ${queryableName}.id, msg: UNIQUE constraint failed: ${queryableName}.id)`
      //       the new error isn't very informative
      "ALL_ERROR"
    );
  });
});
