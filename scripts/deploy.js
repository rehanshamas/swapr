// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.const fsp  = require("fs").promises;
const fsp = require("fs").promises;
const path = require("path");
const hre = require("hardhat");
//const { runInContext } = require('vm');
const { ethers, upgrades } = hre;

const DEPLOY_CONTRACTS = [
  // {
  //   name: "Marketplace",
  //   args: []
  // },
  // {
  //   name: "Swapr",
  //   args: []
  // },
  {
    name: "SwaprGL",
    args: [],
  },
  {
    name: "SwaprWallet",
    args: [],
  },
  {
    name: "SwaprFee",
    args: [],
  },
  // {
  //   name: "PaymentTokenSwapr",
  //   args: []
  // },
  // {
  //   name: "FeeManager",
  //   args: ["arg1","arg2"]
  // }
];

const INSTANCES_STORE = path.resolve(__dirname, "../deployed_instances.json");

const governor = "0xAAcd46F1113c00d2c0ed2d502387Db25340120FB";
const marketplaceGL = "0xe4f05034B5190C515BE059aEAAd415f10e483637";

async function main() {
  let instances = {};
  let confirmations = [];
  let implAddr = {};

  console.log(
    "****************************************************************"
  );
  console.log(`deploying ${DEPLOY_CONTRACTS.length} contracts...`);
  console.log(
    "****************************************************************"
  );
  let proxies = {};
  for (let contract of DEPLOY_CONTRACTS) {
    let factory = await ethers.getContractFactory(contract.name);
    let proxy;
    proxy = await upgrades.deployProxy(factory, {
      initializer: false,
      kind: "uups",
    });
    await proxy.deployed();
    console.log("CONTRACT: ", contract.name);
    proxies[contract.name] = proxy;
    instances[contract.name] = proxy.address;
    console.log("Proxy Address: ", instances[contract.name]);
    implAddr[contract.name] = await upgrades.erc1967.getImplementationAddress(
      proxy.address
    );
    console.log("Implementation Address: ", implAddr[contract.name]);
    console.log("Tx Hash: ", proxy.deployTransaction.hash);
    //let cfm = await proxy.deployTransaction.wait(5);
    confirmations.push(proxy.deployTransaction.wait(5));
  }
  console.log(`waiting for confirmations...`);
  let allDeployed = await Promise.allSettled(confirmations);

  console.log("");
  console.log(
    "****************************************************************"
  );
  console.log(`Initializing ${DEPLOY_CONTRACTS.length} contracts...`);
  console.log(
    "****************************************************************"
  );
  const AbiCoder = ethers.utils.defaultAbiCoder;
  for (let contract of DEPLOY_CONTRACTS) {
    if (contract.name == "Marketplace") {
      //await proxies[contract.name].initialize(AbiCoder.encode(["address", "address"], [owner.address, swaprGL.address]));
    }
    if (contract.name == "Swapr") {
      //await proxies[contract.name].initialize(AbiCoder.encode(["address", "address"], [owner.address, swaprGL.address]));
    }
    if (contract.name == "SwaprGL") {
      await proxies[contract.name].initialize(
        AbiCoder.encode(
          ["address", "address", "address"],
          [
            proxies["SwaprWallet"].address,
            marketplaceGL,
            proxies["SwaprFee"].address,
          ]
        )
      );
    }

    if (contract.name == "SwaprWallet") {
      await proxies[contract.name].initialize(
        AbiCoder.encode(["address"], [proxies["SwaprGL"].address])
      );
    }

    if (contract.name == "SwaprFee") {
      await proxies[contract.name].initialize(proxies["SwaprGL"].address);
    }
  }
  console.log("Initialized Successfully.");

  console.log("");
  console.log(
    "****************************************************************"
  );
  console.log(`Verifying ${DEPLOY_CONTRACTS.length} contracts...`);
  console.log(
    "****************************************************************"
  );

  //VERIFY IMPLEMENTATIONS
  let i = 0;
  retry: for (; i < DEPLOY_CONTRACTS.length; i++) {
    try {
      await run("verify:verify", {
        address: implAddr[DEPLOY_CONTRACTS[i].name],
        constructorArguments: [], //contract.args
      });
      console.log(`${DEPLOY_CONTRACTS[i].name} verified successfully`);
    } catch (e) {
      if (e.message.includes("already verified")) {
        console.log(`${DEPLOY_CONTRACTS[i].name} is already verified`);
      } else {
        console.error(`${DEPLOY_CONTRACTS[i].name}: verification failed`);
        console.error(`reason: ${e.message}`);
        //retry
        console.log("Failed Verification, Retrying...");
        i -= 1;
        continue retry;
      }
    }
  }

  await fsp.writeFile(INSTANCES_STORE, JSON.stringify(instances, null, 4));
  console.log(`List of proxies stored in ${INSTANCES_STORE}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
