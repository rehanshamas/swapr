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

    [owner, account2, bidder, account4, account5, account6, marketplace] =
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
    await testToken.transfer(
      bidder.address,
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

  describe("Auctions", function () {
    let createdOn;

    it("Should be a valid auction type listable", async function () {
      let nftId = 0;
      let toEOA = true;
      let depositType = 1;
      let activeDepositType = 1;
      let startingPrice = ethers.utils.parseUnits("275", 18);
      let buyNowPrice = ethers.utils.parseUnits("325", 18);
      let startTime = ethers.BigNumber.from("1680215306");
      let endTime = startTime.add(time.duration.days(2).toString());
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
          startingPrice,
          buyNowPrice,
          startTime,
          endTime,
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

      //validate auction listing
      const listable = await swaprGL.isListableAuction(data);

      expect(listable).to.be.equal(true);
    });

    it("Should create auction type listing", async function () {
      let nftId = 0;
      let toEOA = true;
      let depositType = 1;
      let activeDepositType = 1;
      let startingPrice = ethers.utils.parseUnits("275", 18);
      let buyNowPrice = ethers.utils.parseUnits("325", 18);
      let startTime = ethers.BigNumber.from("1680215306");
      let endTime = startTime.add(time.duration.days(2).toString());

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
          startingPrice,
          buyNowPrice,
          startTime,
          endTime,
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

      //create auction listing
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

      //validate auction listing
      const listable = await swaprGL.isListableAuction(data);
      expect(listable).to.be.equal(false);
    });

    it("Should validate as first bid and the last bid", async function () {
      let nftId = 0;
      let toEOA = true;
      let depositType = 1;
      let activeDepositType = 1;
      let startingPrice = ethers.utils.parseUnits("275", 18);
      let buyNowPrice = ethers.utils.parseUnits("325", 18);
      let startTime = ethers.BigNumber.from("1680215306");
      let endTime = startTime.add(time.duration.days(2).toString());

      let isActiveBid = false;

      //create listing data
      const listingMsg = AbiCoder.encode(
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
          startingPrice,
          buyNowPrice,
          startTime,
          endTime,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManagerTrue.address,
          testToken.address,
          owner.address,
        ]
      );
      const listingMsgHash = await swaprGL.toMessageHash(listingMsg);
      const sellerSig = await owner.signMessage(
        ethers.utils.arrayify(listingMsgHash)
      );
      const listingData = AbiCoder.encode(
        ["bytes", "bytes"],
        [listingMsg, sellerSig]
      );

      //create active bid data
      let offerPrice = ethers.utils.parseUnits("275", 18); //bidder's offered price
      let lockedBalance = ethers.utils.parseUnits("0", 18); //bidder's total locked balance within swapr wallet
      let listingEndTime = endTime; //updated listing endtime (with added timeOffset) incase the bid was made in last minute

      const activeBidMsg = AbiCoder.encode(
        ["uint", "uint", "uint", "address", "address", "uint"],
        [
          offerPrice,
          lockedBalance,
          listingEndTime,
          bidder.address,
          lockWithSplitManagerTrue.address,
          nftId,
        ]
      );
      const activeBidMsgHash = await swaprGL.toMessageHash(activeBidMsg);
      const activeBidderSig = await bidder.signMessage(
        ethers.utils.arrayify(activeBidMsgHash)
      );
      const activeBidData = AbiCoder.encode(
        ["bytes", "bytes"],
        [activeBidMsg, activeBidderSig]
      );

      //console.log("Active Bid Data: ", activeBidData);

      //create proposed bid data
      offerPrice = ethers.utils.parseUnits("276", 18);
      const proposedBidMsg = AbiCoder.encode(
        ["uint256", "uint256", "uint256", "uint128", "address", "address"],
        [
          nftId,
          offerPrice,
          lockedBalance,
          listingEndTime,
          bidder.address,
          lockWithSplitManagerTrue.address,
        ]
      );
      const proposedBidMsgHash = await swaprGL.toMessageHash(proposedBidMsg);
      const proposedBidderSig = await bidder.signMessage(
        ethers.utils.arrayify(proposedBidMsgHash)
      );
      const proposedBidData = AbiCoder.encode(
        ["bytes", "bytes"],
        [proposedBidMsg, proposedBidderSig]
      );

      //wrap data with marketplace signature
      const message = AbiCoder.encode(
        ["bool", "bytes", "bytes", "bytes"],
        [isActiveBid, listingData, "0x", proposedBidData]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await marketplace.signMessage(ethers.utils.arrayify(msgHash));
      const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      testToken
        .connect(bidder)
        .approve(swaprWallet.address, ethers.utils.parseUnits("500", 18));
      const tx = await swaprWallet
        .connect(bidder)
        .depositERC(testToken.address);
      await tx.wait();

      const response = await swaprGL.connect(bidder).validateBid(data);
      expect(response[0]).to.be.equal(true);
    });

    it("Should buy now auction type listing", async function () {
      let nftId = 0;
      let toEOA = true;
      let depositType = 1;
      let activeDepositType = 1;
      let startingPrice = ethers.utils.parseUnits("275", 18);
      let buyNowPrice = ethers.utils.parseUnits("325", 18);
      let startTime = ethers.BigNumber.from((await time.latest()).toString());
      let endTime = startTime.add(time.duration.days(2).toString());
      let isActiveBid = false;

      //create listing data
      const listingMsg = AbiCoder.encode(
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
          startingPrice,
          buyNowPrice,
          startTime,
          endTime,
          createdOn,
          depositType,
          activeDepositType,
          toEOA,
          lockWithSplitManagerTrue.address,
          testToken.address,
          owner.address,
        ]
      );
      const listingMsgHash = await swaprGL.toMessageHash(listingMsg);
      const sellerSig = await owner.signMessage(
        ethers.utils.arrayify(listingMsgHash)
      );
      const listingData = AbiCoder.encode(
        ["bytes", "bytes"],
        [listingMsg, sellerSig]
      );

      //wrap data with marketplace signature
      const message = AbiCoder.encode(
        ["bool", "bytes", "bytes"],
        [isActiveBid, listingData, "0x"]
      );
      const msgHash = await swaprGL.toMessageHash(message);
      const sig = await marketplace.signMessage(ethers.utils.arrayify(msgHash));
      const buyNowData = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

      let sellerBal = await testToken.balanceOf(owner.address);

      //buy auction listing
      await testToken.connect(account2).approve(swaprGL.address, buyNowPrice);
      await swaprGL.connect(account2).buyNowAuction(buyNowData);

      expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
        account2.address
      );
      expect(
        await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
      ).to.be.equal("0x");
      expect(await testToken.balanceOf(owner.address)).to.be.greaterThan(
        sellerBal
      );
    });
  });
});
