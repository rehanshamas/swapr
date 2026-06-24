const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
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

describe("Marketplace", function () {
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
    await testToken.transfer(
      account2.address,
      ethers.utils.parseUnits("50000", 18)
    );

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

  let createdOn;

  describe("Orders", function () {
    it("Should be a valid order type listable", async function () {
      let nftId = 0;
      let toEOA = true;
      let depositType = 2;
      let activeDepositType = 2;
      let fixedPrice = ethers.utils.parseUnits("275", 18);
      let maxTokenSell = ethers.utils.parseUnits("1", 18);
      let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
      let remainingPart = ethers.utils.parseUnits("1", 18);
      createdOn = ethers.BigNumber.from((await time.latest()).toString());

      //create listing data
      const message = AbiCoder.encode(
        [
          "uint256",
          "uint256",
          "uint256",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "uint8",
          "bool",
          "address",
          "address",
          "address",
        ],
        [
          nftId,
          fixedPrice,
          maxTokenSell,
          maxBuyPerWallet,
          remainingPart,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManagerTrue.address,
          testToken.address,
          owner.address,
        ]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      //validate order listing
      const listable = await swaprGL.isListableOrder(data);

      expect(listable).to.be.equal(true);
    });

    it("Should create order type listing", async function () {
      let nftId = 0;
      let toEOA = true;
      let depositType = 2;
      let activeDepositType = 2;
      let fixedPrice = ethers.utils.parseUnits("275", 18);
      let maxTokenSell = ethers.utils.parseUnits("1", 18);
      let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
      let remainingPart = ethers.utils.parseUnits("1", 18);

      //create listing data with owner signature
      const message = AbiCoder.encode(
        [
          "uint256",
          "uint256",
          "uint256",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "uint8",
          "bool",
          "address",
          "address",
          "address",
        ],
        [
          nftId,
          fixedPrice,
          maxTokenSell,
          maxBuyPerWallet,
          remainingPart,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManagerTrue.address,
          testToken.address,
          owner.address,
        ]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      //wrap data with marketplace signature
      const dataHash = await swaprGL.toMessageHash(data);
      const marketplaceSig = await marketplace.signMessage(
        ethers.utils.arrayify(dataHash)
      );
      const finalData = AbiCoder.encode(
        ["bytes", "bytes"],
        [data, marketplaceSig]
      );

      //create order listing
      await lockWithSplitManagerTrue
        .connect(owner)
        .approve(swaprWallet.address, nftId);
      await swaprGL
        .connect(owner)
        .createListing(depositType, 0, testToken.address, finalData);

      expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
        swaprWallet.address
      );
      expect(
        await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
      ).to.be.equal(sig);

      //validate order listing
      const listable = await swaprGL.isListableOrder(data);
      expect(listable).to.be.equal(false);
    });

    it("Should buy now order type listing", async function () {
      let nftId = 0;
      let toEOA = false;
      let depositType = 2;
      let activeDepositType = 2;
      let fixedPrice = ethers.utils.parseUnits("25", 18);
      let maxTokenSell = ethers.utils.parseUnits("1", 18);
      let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
      let remainingPart = ethers.utils.parseUnits("1", 18);
      let buyerPurchasedAmount = 0;
      let split = ethers.utils.parseUnits("1", 18);

      //create listing data with owner signature
      const message = AbiCoder.encode(
        [
          "uint256",
          "uint256",
          "uint256",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "uint8",
          "bool",
          "address",
          "address",
          "address",
        ],
        [
          nftId,
          fixedPrice,
          maxTokenSell,
          maxBuyPerWallet,
          remainingPart,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManagerTrue.address,
          testToken.address,
          owner.address,
        ]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      //wrap data with marketplace signature
      const dataHash = await swaprGL.toMessageHash(data);
      const marketplaceSig = await marketplace.signMessage(
        ethers.utils.arrayify(dataHash)
      );
      const finalData = AbiCoder.encode(
        ["bytes", "bytes"],
        [data, marketplaceSig]
      );

      //validate order listing
      const listable = await swaprGL.isListableOrder(data);
      expect(listable).to.be.equal(false);

      //let sellerBal = await testToken.balanceOf(owner.address);
      let sellerBal = await testToken.balanceOf(owner.address);

      //buy order listing
      await testToken.connect(account2).approve(swaprGL.address, fixedPrice);
      await swaprGL
        .connect(account2)
        .buyNowOrder(buyerPurchasedAmount, finalData, split);

      expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
        account2.address
      );
      expect(
        await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
      ).to.be.equal("0x");
      expect(await testToken.balanceOf(owner.address)).to.be.equal(sellerBal);
    });

    it("Should create splitable order type listing", async function () {
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
      console.log(newIDs);
      let nftId = newIDs[1];
      console.log(nftId);
      let toEOA = true;
      let depositType = 2;
      let activeDepositType = 2;
      let fixedPrice = ethers.utils.parseUnits("275", 18);
      let maxTokenSell = ethers.utils.parseUnits("1", 18);
      let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
      let remainingPart = ethers.utils.parseUnits("1", 18);

      //create listing data with owner signature
      const message = AbiCoder.encode(
        [
          "uint256",
          "uint256",
          "uint256",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "uint8",
          "bool",
          "address",
          "address",
          "address",
        ],
        [
          nftId,
          fixedPrice,
          maxTokenSell,
          maxBuyPerWallet,
          remainingPart,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManager.address,
          testToken.address,
          owner.address,
        ]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      //wrap data with marketplace signature
      const dataHash = await swaprGL.toMessageHash(data);
      const marketplaceSig = await marketplace.signMessage(
        ethers.utils.arrayify(dataHash)
      );
      const finalData = AbiCoder.encode(
        ["bytes", "bytes"],
        [data, marketplaceSig]
      );

      //create order listing
      await lockWithSplitManager
        .connect(owner)
        .approve(swaprWallet.address, nftId);
      await swaprGL
        .connect(owner)
        .createListing(depositType, 0, testToken.address, finalData);

      expect(await lockWithSplitManager.ownerOf(nftId)).to.be.equal(
        swaprWallet.address
      );
      expect(
        await swaprWallet.getNFT(lockWithSplitManager.address, nftId)
      ).to.be.equal(sig);
    });

    it("Should buy now splitable order type listing", async function () {
      let nftId = 2;
      let toEOA = true;
      let depositType = 2;
      let activeDepositType = 2;
      let fixedPrice = ethers.utils.parseUnits("275", 18);
      let maxTokenSell = ethers.utils.parseUnits("1", 18);
      let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
      let remainingPart = ethers.utils.parseUnits("1", 18);
      let buyerPurchasedAmount = 0;
      let split = ethers.utils.parseUnits("0.20", 18);

      //create listing data with owner signature
      const message = AbiCoder.encode(
        [
          "uint256",
          "uint256",
          "uint256",
          "uint128",
          "uint128",
          "uint128",
          "uint8",
          "uint8",
          "bool",
          "address",
          "address",
          "address",
        ],
        [
          nftId,
          fixedPrice,
          maxTokenSell,
          maxBuyPerWallet,
          remainingPart,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManager.address,
          testToken.address,
          owner.address,
        ]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      //wrap data with marketplace signature
      const dataHash = await swaprGL.toMessageHash(data);
      const marketplaceSig = await marketplace.signMessage(
        ethers.utils.arrayify(dataHash)
      );
      const finalData = AbiCoder.encode(
        ["bytes", "bytes"],
        [data, marketplaceSig]
      );

      //validate order listing
      const listable = await swaprGL.isListableOrder(data);
      expect(listable).to.be.equal(false);

      //let sellerBal = await testToken.balanceOf(owner.address);
      let sellerBal = await testToken.balanceOf(owner.address);

      //buy order listing
      await testToken.connect(account2).approve(swaprGL.address, fixedPrice);
      const txs = await swaprGL
        .connect(account2)
        .buyNowOrder(buyerPurchasedAmount, finalData, split);
      const rc = await txs.wait();

      const event = rc.events.find((event) => event.event === "Purchased");
      const [isSplit, order, splitParts] = event.args;

      expect(await lockWithSplitManager.ownerOf(nftId + 2)).to.be.equal(
        account2.address
      );
      expect(await lockWithSplitManager.ownerOf(nftId + 1)).to.be.equal(
        swaprWallet.address
      );
      expect(
        await swaprWallet.getNFT(lockWithSplitManager.address, nftId + 2)
      ).to.be.equal("0x");
      expect(await testToken.balanceOf(owner.address)).to.be.greaterThan(
        sellerBal
      );
      expect(splitParts[1]).to.be.equal(split);
    });
  });
});
