import { ethers } from "hardhat";

async function main() {
console.log("Importing the deploy script");
  await import("@tableland/evm/scripts/deploy.ts");
console.log("Imported the deploy script");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});







async function evmmain() {
  console.log(`\nDeploying TablelandTables proxy to local network with Hardhat Account 0...`);

  // Get proxy owner account
  const [account] = await ethers.getSigners();
  if (account.provider === undefined) {
    throw Error("missing provider");
  }

  // Get base URI
  if (baseURI === undefined || baseURI === "") {
    throw Error(`missing baseURIs entry`);
  }
  console.log(`Using base URI '${baseURI}'`);

  // Don't allow multiple proxies per network
  if (proxy !== undefined && proxy !== "") {
    throw Error(`proxy already deployed to '${network.name}'`);
  }

  // Deploy proxy
  const Factory = await ethers.getContractFactory("TablelandTables");
  const tables = await (
    (await upgrades.deployProxy(Factory, [baseURI], {
      kind: "uups",
    })) as TablelandTables
  ).deployed();
  console.log("New proxy address:", tables.address);

  // Check new implementation
  const impl = await upgrades.erc1967.getImplementationAddress(tables.address);
  console.log("New implementation address:", impl);

  // Create health bot table
  const { chainId } = await account.provider.getNetwork();
  const createStatement = `create table healthbot_${chainId} (counter integer);`;
  let tx = await tables.createTable(account.address, createStatement);
  let receipt = await tx.wait();
  const [, createEvent] = receipt.events ?? [];
  const tableId = createEvent.args!.tableId;
  console.log("Healthbot table created as:", `healthbot_${chainId}_${tableId}`);

  // Insert first row into health bot table
  const runStatement = `insert into healthbot_${chainId}_${tableId} values (1);`;
  tx = await tables.runSQL(account.address, tableId, runStatement);
  receipt = await tx.wait();
  const [runEvent] = receipt.events ?? [];
  assert(
    runEvent.args!.statement === runStatement,
    "insert statement mismatch"
  );
  console.log("Healthbot table updated with:", runEvent.args?.statement);

  // Warn that proxy address needs to be saved in config
  console.warn(
    `\nSave 'proxies.${network.name}: "${tables.address}"' in 'proxies.ts'!`
  );
}
