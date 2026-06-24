const { ethers } = require("hardhat");

const getSignature = async (id, lockContract) => {
  const [, lockedAmount, ,] = await lockContract.getInfoBySingleID(id);
  return lockedAmount;
};

const calculateParts = (percentages) => {
  const parts = percentages.length;
  const distribution = [];
  for (let i = 0; i < parts; i++) {
    const part = convertToBN(percentages[i]);
    distribution.push(part);
  }
  return distribution;
};
const convertToBN = (value) => {
  ethers.utils.parseEther(value.toString());
  return ethers.utils.parseEther(value.toString());
};

module.exports = {
  getSignature,
  calculateParts,
  convertToBN,
};
