import chai from "chai";
// import { connect } from "@tableland/sdk";
import { getAccounts, getConnection } from "../dist/esm/util.js";
import { LocalTableland } from "../dist/esm/main.js";

const expect = chai.expect;

describe("Validator, Chain, and SDK work end to end", function () {
  const accounts = getAccounts();
  const lt = new LocalTableland({
    silent: true,
    validatorDir: "../go-tableland",
  });

  // These tests take a bit longer than normal since we are running them against an actual network
  this.timeout(20000);
  before(async function () {
    await lt.start();
    await new Promise((resolve) => setTimeout(() => resolve(), 2000));
  });

  after(async function () {
    await lt.shutdown();
  });

  it("creates a table that can be read from", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    // TODO: using exec here, there's quite a few methods that can be used for creating a table,
    //       and they are scattered throughout these tests atm. We can potentially build in specific
    //       tests for each method in the future.
    // `key` is a reserved word in sqlite.
    const res = await tableland.exec(
      `CREATE TABLE test_create_read (keyy TEXT, val TEXT);`
    );

    const data = await tableland.exec(`SELECT * FROM ${res.meta.txn.name};`);
    expect(data.results).to.eql([]);
  });

  it("create a table that can be written to", async function () {
    this.timeout(50000);
    const signer = accounts[1];
    const tableland = getConnection(signer);

    // TODO: as mentioned above, using prepare("...").run() in this test,
    //       but there's other ways and methods to do create then insert.
    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_create_write (keyy TEXT, val TEXT);")
      .run();

    const tableName = createMetadata.txn?.name ?? "";
    expect(tableName).to.match(/^test_create_write_31337_\d+$/);

    const insertRes = await tableland
      .prepare(`INSERT INTO ${tableName} (keyy, val) VALUES ('tree', 'aspen');`)
      .run();

    expect(insertRes.success).to.eql(true);
    expect(typeof insertRes.meta.duration).to.eql("number");

    // TODO: to get results you need to do prepare().all() or maybe prepare.first()?
    //       calls like exec() and prepare().run() don't include results.
    const readRes = await tableland
      .prepare(`SELECT * FROM ${tableName};`)
      .all();

    expect(readRes.results).to.eql([{ keyy: "tree", val: "aspen" }]);
  });

  it("table cannot be written to unless caller is allowed", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_not_allowed (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const data = await tableland
      .prepare(`SELECT * FROM ${queryableName};`)
      .all();

    expect(data.results).to.eql([]);

    const signer2 = accounts[2];
    const tableland2 = getConnection(signer2);

    await expect(
      (async function () {
        await tableland2
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

    const data2 = await tableland2
      .prepare(`SELECT * FROM ${queryableName};`)
      .all();
    expect(data2.results).to.eql([]);
  });

  it("create a table can have a row deleted", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_create_delete (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const write1 = await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    expect(typeof write1.meta.txn.transactionHash).to.eql("string");

    const write2 = await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'pine')`
      )
      .all();

    expect(typeof write2.meta.txn.transactionHash).to.eql("string");

    const data = await tableland
      .prepare(`SELECT * FROM ${queryableName};`)
      .all();
    expect(data.results.length).to.eql(2);

    const delete1 = await tableland
      .prepare(`DELETE FROM ${queryableName} WHERE val = 'pine';`)
      .all();

    expect(typeof delete1.meta.txn.transactionHash).to.eql("string");

    const data2 = await tableland
      .prepare(`SELECT * FROM ${queryableName};`)
      .all();
    await expect(data2.results.length).to.eql(1);
  }, 30000);

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it.skip("read a table with `table` output", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    const data = await tableland
      .prepare(`SELECT * FROM ${queryableName};`, {
        output: "table",
      })
      .all();

    expect(data.results.columns).to.eql([{ name: "keyy" }, { name: "val" }]);
    expect(data.results.rows).to.eql([["tree", "aspen"]]);
  });

  it("count rows in a table", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_count (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'pine')`
      )
      .all();

    const data = await tableland
      .prepare(`SELECT COUNT(*) FROM ${queryableName};`)
      .all();

    expect(data.results).to.eql([{ "count(*)": 2 }]);
  });

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it.skip("read a table with `objects` output", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    const data = await tableland
      .prepare(`SELECT * FROM ${queryableName};`, {
        output: "objects",
      })
      .all();

    expect(data.results).to.eql([{ keyy: "tree", val: "aspen" }]);
  });

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it.skip("read a single row with `unwrap` option", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    const data = await tableland
      .prepare(`SELECT * FROM ${queryableName};`, {
        unwrap: true,
        output: "objects",
      })
      .all();

    expect(data.results).to.eql({ keyy: "tree", val: "aspen" });
  });

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it.skip("read two rows with `unwrap` option fails", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();
    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'pine')`
      )
      .all();

    await expect(
      (async function () {
        await tableland
          .prepare(`SELECT * FROM ${queryableName};`, {
            unwrap: true,
            output: "objects",
          })
          .all();
      })()
    ).to.be.rejectedWith(
      "unwrapped results with more than one row aren't supported in JSON RPC API"
    );
  });

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it.skip("read with `extract` option", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_read_extract (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(`INSERT INTO ${queryableName} (val) VALUES ('aspen')`)
      .all();
    await tableland
      .prepare(`INSERT INTO ${queryableName} (val) VALUES ('pine')`)
      .all();

    const data = await tableland
      .prepare(`SELECT * FROM ${queryableName};`, {
        extract: true,
        output: "objects",
      })
      .all();

    expect(data.results).to.eql(["aspen", "pine"]);
  });

  // TODO: make this a test for some kind of results formatting function
  //       assuming that is still appropriate
  it.skip("read table with two columns with `extract` option fails", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_read (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await tableland
      .prepare(
        `INSERT INTO ${queryableName} (keyy, val) VALUES ('tree', 'aspen')`
      )
      .all();

    await expect(
      (async function () {
        await tableland
          .prepare(`SELECT * FROM ${queryableName};`, {
            extract: true,
            output: "objects",
          })
          .all();
      })()
    ).to.be.rejectedWith(
      "can only extract values for result sets with one column but this has 2"
    );
  });

  // TODO: what happend to `list`? is it gone or replaced?
  it.skip("list an account's tables", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_create_list (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const tablesMeta = await tableland.list();

    expect(Array.isArray(tablesMeta)).to.eql(true);
    const table = tablesMeta.find((table) => table.name === queryableName);

    expect(typeof table).to.equal("object");
    expect(table.controller).to.eql(accounts[1].address);
  });

  it("write statement validates table name prefix", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const prefix1 = "test_direct_invalid_write";
    await tableland
      .prepare(`CREATE TABLE ${prefix1} (keyy TEXT, val TEXT);`)
      .run();

    const { meta: createMetadata2 } = await tableland
      .prepare("CREATE TABLE test_direct_invalid_write2 (keyy TEXT, val TEXT);")
      .run();
    const tableId2 = createMetadata2.txn?.tableId ?? "";

    // both tables owned by the same account
    // the prefix is for the first table, but id is for second table
    const invalidName = `${prefix1}_31337_${tableId2}`;

    await expect(
      (async function () {
        await tableland
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
    const tableland = getConnection(signer);

    const prefix = "test_direct_invalid_id_write";
    await tableland
      .prepare(`CREATE TABLE ${prefix} (keyy TEXT, val TEXT);`)
      .run();

    // the tableId 0 does not exist since we start with tableId == 1
    const queryableName = `${prefix}_31337_0`;

    await expect(
      (async function () {
        await tableland
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

  // TODO: how do we set controller in the new SDK?
  it.skip("allows setting controller", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_set_controller (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    // Set the controller to Hardhat #7
    const { hash } = await tableland.setController(
      "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
      queryableName
    );

    expect(typeof hash).to.eql("string");
    expect(hash.length).to.eql(66);
  });

  // TODO: how do we get controller in the new SDK?
  it.skip("get controller returns an address", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_create_getcontroller (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    // Hardhat #7
    const controllerAddress = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";

    const { hash } = await tableland.setController(
      controllerAddress,
      queryableName
    );

    expect(typeof hash).to.eql("string");
    expect(hash.length).to.eql(66);

    const controller = await tableland.getController(queryableName);

    expect(controller).to.eql(controllerAddress);
  });

  // TODO: how do we lock controller in the new SDK?
  it.skip("lock controller returns a transaction hash", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_create_lockcontroller (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    // Hardhat #7
    const controllerAddress = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";

    const { hash } = await tableland.setController(
      controllerAddress,
      queryableName
    );

    expect(typeof hash).to.eql("string");
    expect(hash.length).to.eql(66);

    const tx = await tableland.lockController(queryableName);

    expect(typeof tx.hash).to.eql("string");
  });

  // TODO: how do we get a schema in the new SDK?
  it.skip("get the schema for a table", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare("CREATE TABLE test_get_schema (keyy TEXT, val TEXT);")
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const tableSchema = await tableland.schema(queryableName);

    expect(typeof tableSchema.columns).to.eql("object");
    expect(Array.isArray(tableSchema.table_constraints)).to.eql(true);
    expect(tableSchema.columns.length).to.eql(1);
    expect(tableSchema.columns[0].name).to.eql("a");
    expect(tableSchema.columns[0].type).to.eql("int");
    expect(Array.isArray(tableSchema.columns[0].constraints)).to.eql(true);
    expect(tableSchema.columns[0].constraints[0].toLowerCase()).to.eql(
      "primary key"
    );
  });

  // TODO: how do we get the structure hash in the new SDK? I think this feature is gone -JW
  it.skip("get the structure for a hash", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const createStatement =
      "CREATE TABLE test_get_structure (keyy TEXT, val TEXT);";
    const { meta: createMetadata } = await tableland
      .prepare(createStatement)
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    const { structureHash } = await tableland.hash(createStatement);

    const tableStructure = await tableland.structure(structureHash);

    expect(Array.isArray(tableStructure)).to.eql(true);

    const lastStructure = tableStructure[tableStructure.length - 1];

    expect(lastStructure.name).to.eql(queryableName);
    expect(lastStructure.controller).to.eql(accounts[1].address);
    expect(lastStructure.structure).to.eql(structureHash);
  });

  it("A write that violates table constraints throws error", async function () {
    const signer = accounts[1];
    const tableland = getConnection(signer);

    const { meta: createMetadata } = await tableland
      .prepare(
        "CREATE TABLE test_create_tc_violation (id TEXT, name TEXT, PRIMARY KEY(id));"
      )
      .run();
    const queryableName = createMetadata.txn?.name ?? "";

    await expect(
      (async function () {
        await tableland
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
