require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require('@openzeppelin/hardhat-upgrades');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    // localhost: {
    //   url: "http://127.0.0.1:8545"
    // },
    hardhat: {
      // Forking MATIC
      forking: {
        url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_KEY_MATIC}`,
        blockNumber: 30629514,
      },
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY_GOERLI}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    sepolia: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY_GOERLI}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    testbinance: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      //gasPrice: 20000000000,
      accounts: [process.env.PRIVATE_KEY]
    },
    mumbai: {
      //allowUnlimitedContractSize: true,
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_KEY_MATIC}`,
      chainId: 80001,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: 9999999999
    },
    ethereum: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY_ETHEREUM}`,
      accounts: {mnemonic: process.env.MNEMONIC},
    },
    binance: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: {mnemonic: process.env.MNEMONIC}
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
    //apiKey: process.env.BSCSCAN_API_KEY
    //apiKey: process.env.POLYGONSCAN_API_KEY
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS == 'true') ? true : false,
    currency: 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  // contractSizer: {
  //   strict: false,
  //   runOnCompile: false
  // },
  mocha: {
    timeout: 240000,
  }
};
