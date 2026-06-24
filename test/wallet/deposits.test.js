const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const zeroAddress = ethers.constants.AddressZero;
const AbiCoder = ethers.utils.defaultAbiCoder;
require("dotenv").config();

describe("Wallet", function () {
  let swaprWallet;

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

    [owner, account2, account3] = await ethers.getSigners();

    const SwaperGL = await ethers.getContractFactory("SwaprGL");
    const swaprGL = await upgrades.deployProxy(SwaperGL, {
      kind: "uups",
      initializer: false,
    });
    await swaprGL.deployed();
    const SwaprWallet = await ethers.getContractFactory("SwaprWallet");
    const data = AbiCoder.encode(["address"], [swaprGL.address]);
    swaprWallet = await upgrades.deployProxy(SwaprWallet, [data], {
      kind: "uups",
    });
    await swaprWallet.deployed();

    const TestSwaprToken = await ethers.getContractFactory("TestSwaprToken");
    testToken = await upgrades.deployProxy(TestSwaprToken, [], {
      kind: "uups",
    });
    await testToken.deployed();
  });

  describe("depositNative", function () {
    it("Should deposit native currency funds to given account", async function () {
      const options = { value: ethers.utils.parseEther("0.01") };
      const tx = await swaprWallet.connect(account2).depositNative(options);
      tx.wait();
      expect(
        ethers.utils.formatEther(
          await swaprWallet.getBalance(account2.address, zeroAddress)
        )
      ).to.be.equal("0.01");
    });
  });
  describe("depositERC", function () {
    it("Should deposit ERC20 token to given account", async function () {
      testToken
        .connect(owner)
        .approve(swaprWallet.address, ethers.utils.parseUnits("500", 18));
      const tx = await swaprWallet.connect(owner).depositERC(testToken.address);
      tx.wait();
      expect(
        ethers.utils.formatEther(
          await swaprWallet.getBalance(owner.address, testToken.address)
        )
      ).to.be.equal("500.0");
    });
  });
});
