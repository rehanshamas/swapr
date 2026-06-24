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

    [owner, account2, account3, account4, account5, account6, marketplace] =
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

  describe("withdrawNFT", function () {
    it("Should withdraw if depositType is 0 or 3", async function () {
      let nftId = 0;
      let depositType = 3;

      //deposit NFT
      await lockWithSplitManagerTrue
        .connect(owner)
        .approve(swaprWallet.address, nftId);
      const message = AbiCoder.encode(
        ["uint", "address", "uint"],
        [depositType, lockWithSplitManagerTrue.address, nftId]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);
      const tx = await swaprGL.connect(owner).depositNFTs(data);
      tx.wait();

      expect(
        await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
      ).to.be.equal(sig);
      expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
        swaprWallet.address
      );
    });
  });
  describe("withdrawNative", function () {
    it("Should withdraw all rightful native funds leaving zero balance", async function () {
      let token = zeroAddress;
      const amount = ethers.utils.parseEther("0.24");
      const options = { value: amount };
      let tx = await swaprWallet.connect(account2).depositNative(options);
      tx.wait();

      const data = AbiCoder.encode(
        ["address", "uint", "address"],
        [token, amount, account2.address]
      );
      const dataHash = await swaprGL.toMessageHash(data);
      const marketplaceSig = await marketplace.signMessage(
        ethers.utils.arrayify(dataHash)
      );
      const finalData = AbiCoder.encode(
        ["bytes", "bytes"],
        [data, marketplaceSig]
      );

      tx = await swaprGL.connect(account2).withdrawFunds(finalData);
      tx.wait();
      expect(
        ethers.utils.formatEther(
          await swaprWallet.getBalance(account2.address, token)
        )
      ).to.be.equal("0.0");
    });
  });
  describe("withdrawERC", function () {
    it("Should withdraw all rightful ERC20 funds leaving zero balance", async function () {
      let token = testToken.address;
      const amount = ethers.utils.parseUnits("25000", 18);
      let prevBal = ethers.utils.formatEther(
        await testToken.balanceOf(owner.address)
      );
      testToken.connect(owner).approve(swaprWallet.address, amount);
      let tx = await swaprWallet.connect(owner).depositERC(token);
      tx.wait();

      const data = AbiCoder.encode(
        ["address", "uint", "address"],
        [token, amount, owner.address]
      );
      const dataHash = await swaprGL.toMessageHash(data);
      const marketplaceSig = await marketplace.signMessage(
        ethers.utils.arrayify(dataHash)
      );
      const finalData = AbiCoder.encode(
        ["bytes", "bytes"],
        [data, marketplaceSig]
      );
      tx = await swaprGL.connect(owner).withdrawFunds(finalData);
      tx.wait();
      expect(
        ethers.utils.formatEther(
          await swaprWallet.getBalance(owner.address, token)
        )
      ).to.be.equal("0.0");
      expect(
        ethers.utils.formatEther(await testToken.balanceOf(owner.address))
      ).to.be.equal(prevBal);
    });
  });
});
