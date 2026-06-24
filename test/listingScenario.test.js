const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const zeroAddress = ethers.constants.AddressZero;
const AbiCoder = ethers.utils.defaultAbiCoder;
require("dotenv").config();
const lockAbi = require("./lock.abi.json");
const splitManagerAbi = require("./splitManager.abi.json");

describe("SwaprGL & SwaprFee", function () {
  let swaprWallet;
  let swaprGL;
  let swaprFee;
  let lockWithSplitManagerTrue;

  let snapshot;

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

  beforeEach(async () => {
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  it("Should charge base fee on create listing", async function () {
    let nftId = 0;
    let toEOA = true;
    let depositType = 2;
    let activeDepositType = 2;
    let fixedPrice = ethers.utils.parseUnits("275", 18);
    let maxTokenSell = ethers.utils.parseUnits("1", 18);
    let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
    let remainingPart = ethers.utils.parseUnits("1", 18);
    createdOn = ethers.BigNumber.from((await time.latest()).toString());

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
        zeroAddress,
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

    //config fee
    const paymentToken = zeroAddress;
    const subjectAmount = ethers.utils.parseUnits("245", 18);
    const fixedBaseFee = ethers.utils.parseUnits("10", 18);
    const isFixedBaseFee = true;
    const percentBaseFee = ethers.utils.parseUnits("0.05", 18);
    const isPercentBaseFee = true;
    const finalFeePercentage = ethers.utils.parseUnits("0.15", 18);
    const isFinalFeePercentage = true;
    const finalFeeCap = ethers.utils.parseUnits("0", 18);
    const priceCap = ethers.utils.parseUnits("1200", 18);
    const feeConfig = AbiCoder.encode(
      [
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bool",
        "bool",
        "bool",
      ],
      [
        fixedBaseFee,
        finalFeeCap,
        priceCap,
        percentBaseFee,
        finalFeePercentage,
        isFixedBaseFee,
        isPercentBaseFee,
        isFinalFeePercentage,
      ]
    );
    await swaprFee.connect(owner).configOrderFee(feeConfig);

    await swaprFee
      .connect(owner)
      .setNativeTokenPriceFeed("0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada");
    // console.log("paymentTokens", await swaprFee.getPaymentTokens());
    const baseFee = await swaprFee.getBaseOrderFee(subjectAmount, zeroAddress);
    // console.log("baseFee", baseFee);
    await swaprFee.connect(owner).payNow(baseFee.totalBaseFee, paymentToken, {
      value: baseFee.totalBaseFee,
    });

    //create order listing
    await lockWithSplitManagerTrue
      .connect(owner)
      .approve(swaprWallet.address, nftId);
    await swaprGL
      .connect(owner)
      .createListing(
        depositType,
        baseFee.fixedBaseFee,
        paymentToken,
        finalData
      );

    expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
      swaprWallet.address
    );
    expect(
      await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
    ).to.be.equal(sig);
    // console.log("feePaid", await swaprFee.getFeePaid(owner.address, paymentToken));
    expect(await swaprFee.getFeePaid(owner.address, paymentToken)).to.be.equal(
      baseFee[0].sub(baseFee[2])
    );

    //validate order listing
    const listable = await swaprGL.isListableOrder(data);
    expect(listable).to.be.equal(false);
  });

  it("Should charge base fee on create listing with a token", async function () {
    let nftId = 0;
    let toEOA = true;
    let depositType = 2;
    let activeDepositType = 2;
    let fixedPrice = ethers.utils.parseUnits("275", 18);
    let maxTokenSell = ethers.utils.parseUnits("1", 18);
    let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
    let remainingPart = ethers.utils.parseUnits("1", 18);
    createdOn = ethers.BigNumber.from((await time.latest()).toString());

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

    //config fee
    const paymentToken = testToken.address;
    const subjectAmount = ethers.utils.parseUnits("245", 18);
    const fixedBaseFee = ethers.utils.parseUnits("10", 18);
    const isFixedBaseFee = true;
    const percentBaseFee = ethers.utils.parseUnits("0.05", 18);
    const isPercentBaseFee = true;
    const finalFeePercentage = ethers.utils.parseUnits("0.15", 18);
    const isFinalFeePercentage = true;
    const finalFeeCap = ethers.utils.parseUnits("0", 18);
    const priceCap = ethers.utils.parseUnits("1200", 18);
    const feeConfig = AbiCoder.encode(
      [
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bool",
        "bool",
        "bool",
      ],
      [
        fixedBaseFee,
        finalFeeCap,
        priceCap,
        percentBaseFee,
        finalFeePercentage,
        isFixedBaseFee,
        isPercentBaseFee,
        isFinalFeePercentage,
      ]
    );
    await swaprFee.connect(owner).configOrderFee(feeConfig);

    await swaprFee
      .connect(owner)
      .addPaymentToken(
        [paymentToken],
        ["0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0"]
      );
    // console.log("paymentTokens", await swaprFee.getPaymentTokens());
    const baseFee = await swaprFee.getBaseOrderFee(subjectAmount, paymentToken);
    // console.log("baseFee", baseFee);
    await testToken
      .connect(owner)
      .approve(swaprFee.address, baseFee.totalBaseFee);
    await swaprFee.connect(owner).payNow(baseFee.totalBaseFee, paymentToken);

    //create order listing
    await lockWithSplitManagerTrue
      .connect(owner)
      .approve(swaprWallet.address, nftId);
    await swaprGL
      .connect(owner)
      .createListing(
        depositType,
        baseFee.fixedBaseFee,
        paymentToken,
        finalData
      );

    expect(await lockWithSplitManagerTrue.ownerOf(nftId)).to.be.equal(
      swaprWallet.address
    );
    expect(
      await swaprWallet.getNFT(lockWithSplitManagerTrue.address, nftId)
    ).to.be.equal(sig);
    // console.log("feePaid", await swaprFee.getFeePaid(owner.address, paymentToken));
    expect(await swaprFee.getFeePaid(owner.address, paymentToken)).to.be.equal(
      baseFee[0].sub(baseFee[2])
    );

    //validate order listing
    const listable = await swaprGL.isListableOrder(data);
    expect(listable).to.be.equal(false);
  });
});
