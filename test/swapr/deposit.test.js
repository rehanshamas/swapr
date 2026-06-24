const { ethers, upgrades } = require("hardhat");
const { getSignature, calculateParts, convertToBN } = require("../utils");
const keccak256 = require("keccak256");
const { expect } = require("chai");
const zeroAddress = ethers.constants.AddressZero;
const zeroBN = ethers.constants.Zero;
const AbiCoder = ethers.utils.defaultAbiCoder;
require("dotenv").config();
const lockAbi = require("../lock.abi.json");
const splitManagerAbi = require("../splitManager.abi.json");

const ProxyInitializerFalse = {
  initializer: false,
  kind: "uups",
};

describe("Swapr", function () {
  let swaprWallet;
  let swaprGL;
  let swaprFee;

  let lockWithSplitManager, lockWithSplitManagerTrue, lockWithSplitManagerFalse;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_KEY_MATIC}`,
            blockNumber: 30629514,
          },
        },
      ],
    });

    [owner, account2, account3, account4, account5, account6, account7] =
      await ethers.getSigners();

    const SwaprWallet = await ethers.getContractFactory("SwaprWallet");
    swaprWallet = await upgrades.deployProxy(SwaprWallet, {
      initializer: false,
      kind: "uups",
    });
    await swaprWallet.deployed();

    const SwaprGL = await ethers.getContractFactory("SwaprGL");
    swaprGL = await upgrades.deployProxy(SwaprGL, {
      initializer: false,
      kind: "uups",
    });
    await swaprGL.deployed();

    const SwaprFee = await ethers.getContractFactory("SwaprFee");
    swaprFee = await upgrades.deployProxy(SwaprFee, {
      initializer: false,
      kind: "uups",
    });
    await swaprFee.deployed();

    await swaprWallet.initialize(
      AbiCoder.encode(["address"], [swaprGL.address])
    );
    await swaprGL.initialize(
      AbiCoder.encode(
        ["address", "address", "address"],
        [swaprWallet.address, marketplace.address, swaprFee.address]
      )
    );
    await swaprFee.initialize(swaprGL.address);

    const TestSwaprToken = await ethers.getContractFactory("TestSwaprToken");
    testToken = await upgrades.deployProxy(TestSwaprToken, [], {
      kind: "uups",
    });
    await testToken.deployed();

    lockWithSplitManager = await ethers.getContractAt(
      lockAbi,
      "0x5F7829d573b5dFE3Ec240f3430c5aDAC54B6cFfA",
      owner
    );
    splitManagerContract = await ethers.getContractAt(
      splitManagerAbi,
      "0xBCf92A31d0D1Dc3ABBfdB55D16f5cceb051D50E8",
      owner
    );

    lockWithSplitManagerTrue = await ethers.getContractAt(
      lockAbi,
      "0xcEA889041bCAEB8AAEfE0e0Df9F1e5423B12980A",
      owner
    );
  });

  describe("depositNFT", function () {
    it("Should transfer token ownership from ERC721 lock to swapr wallet with splitManagerTrue", async function () {
      let nftId = 0;
      let depositType = 3;

      //step:1
      await lockWithSplitManagerTrue
        .connect(owner)
        .approve(swaprWallet.address, nftId);

      //step:2
      const message = AbiCoder.encode(
        ["uint", "address", "uint"],
        [depositType, lockWithSplitManagerTrue.address, nftId]
      );

      //step:3
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));

      //step:4
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      const tx = await swaprGL.connect(owner).depositNFTs(data);
      tx.wait();

      expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
        swaprWallet.address
      );
      expect(
        await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
      ).to.be.equal(sig);
    });
    it("Should split token before transfering ownership with splitManager", async function () {
      let newIDs;
      if (
        (await swaprWallet.getLockedPart(lockWithSplitManager.address, 0)) > 0
      ) {
        await lockWithSplitManager
          .connect(owner)
          .approve(swaprWallet.address, 0);
        const txs = await swaprWallet
          .connect(owner)
          .splitLockedPart(lockWithSplitManager.address, 0, [
            await lockWithSplitManager.ownerOf(0),
            owner.address,
          ]);
        const rc = await txs.wait();
        const event = rc.events.find((evt) => evt.event === "Splitted");
        [newIDs] = event.args;
      }

      let nftId = newIDs[1];
      let depositType = 3;
      let splittedNftIds = [1, 2];

      //step:1
      await lockWithSplitManager
        .connect(owner)
        .approve(swaprWallet.address, nftId);

      //console.log("Manager: ", await swaprWallet.getSplitManager(lockWithSplitManager.address));
      //console.log("IDs: ", await swaprWallet.connect(owner)._splitLockedPart(lockWithSplitManager.address, nftId, [owner.address,swaprWallet.address]));

      //step:1
      await lockWithSplitManager
        .connect(owner)
        .approve(swaprWallet.address, nftId);

      //step:2
      const message = AbiCoder.encode(
        ["uint", "address", "uint"],
        [depositType, lockWithSplitManager.address, nftId]
      );

      //step:3
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));

      //step:4
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      const tx = await swaprGL.connect(owner).depositNFTs(data);
      tx.wait();

      expect(await lockWithSplitManager.ownerOf(splittedNftIds[0])).to.be.equal(
        owner.address
      );
      expect(await lockWithSplitManager.ownerOf(splittedNftIds[1])).to.be.equal(
        swaprWallet.address
      );
      expect(
        await swaprWallet.getNFT(
          lockWithSplitManager.address,
          splittedNftIds[1]
        )
      ).to.be.equal(sig);
    });
    describe("preventNFTdeposit", function () {
      it("Should not allow NFT deposit if depositType is 1 or 2", async function () {});
    });
  });
});
