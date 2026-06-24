const hre = require("hardhat");
const { ethers } = hre;
const { time } = require("@openzeppelin/test-helpers");
const AbiCoder = ethers.utils.defaultAbiCoder;

async function main() {
  const [owner] = await ethers.getSigners();

  const LINK = await ethers.getContractAt(
    "IERC20",
    "0x326c977e6efc84e512bb9c30f76e30c160ed06fb"
  );
  const Lock = await ethers.getContractAt(
    "ILock",
    "0x15277187e0b2b7E69c62a8042e9ebd8baf9175CC"
  );
  const SwaprFee = await ethers.getContractAt(
    "SwaprFee",
    "0x11d11cE4EBE4c9E95ED5615610c3561448BeBfD5"
  );
  const SwaprGL = await ethers.getContractAt(
    "SwaprGL",
    "0x8B9741361DA2E913497dF7C7F72BA3081D6A76dc"
  );
  const SwaprWallet = await ethers.getContractAt(
    "SwaprWallet",
    "0x7Fd956c1a1Fc1955e02930f517c26f892B51595A"
  );

  let nftId = 0;
  let toEOA = true;
  let depositType = 2;
  let activeDepositType = 2;
  let fixedPrice = ethers.utils.parseUnits("1", 18);
  let maxTokenSell = ethers.utils.parseUnits("1", 18);
  let maxBuyPerWallet = ethers.utils.parseUnits("1", 18);
  let remainingPart = ethers.utils.parseUnits("1", 18);
  let timestamp = Math.floor(Date.now() / 1000).toString();
  let createdOn = ethers.BigNumber.from(timestamp);

  //create listing data with owner signature
  const message = AbiCoder.encode(
    [
      "uint",
      "address",
      "uint",
      "bool",
      "address",
      "uint",
      "uint",
      "uint",
      "uint",
      "address",
      "uint",
      "uint",
    ],
    [
      depositType,
      Lock.address,
      nftId,
      toEOA,
      LINK.address,
      fixedPrice,
      maxTokenSell,
      maxBuyPerWallet,
      remainingPart,
      owner.address,
      activeDepositType,
      createdOn,
    ]
  );
  const msgHash = await SwaprGL.toMessageHash(message);
  const sig = await owner.signMessage(ethers.utils.arrayify(msgHash));
  const data = AbiCoder.encode(["bytes", "bytes"], [message, sig]);

  //wrap data with marketplace signature
  const dataHash = await SwaprGL.toMessageHash(data);
  const marketplaceSig = await owner.signMessage(
    ethers.utils.arrayify(dataHash)
  );
  const finalData = AbiCoder.encode(["bytes", "bytes"], [data, marketplaceSig]);

  const paymentToken = LINK.address;
  const subjectAmount = ethers.utils.parseUnits("1", 18);

  const baseFee = await SwaprFee.getBaseOrderFee(subjectAmount, paymentToken);

  await LINK.connect(owner).approve(SwaprFee.address, baseFee.totalBaseFee);
  await SwaprFee.connect(owner).payNow(baseFee.totalBaseFee, paymentToken);

  await Lock.connect(owner).approve(SwaprWallet.address, nftId);
  await SwaprGL.connect(owner).createListing(
    depositType,
    baseFee.fixedBaseFee,
    finalData
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
