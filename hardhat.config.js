require("dotenv").config();

require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("hardhat-dependency-compiler");

const { installWrapper } = require("./js/hardhat-retry");

installWrapper();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      gas: 12000000,
      initialBaseFeePerGas: 0,
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  dependencyCompiler: {
    paths: [
      "@openzeppelin/contracts/governance/TimelockController.sol",
      "@openzeppelin/contracts/access/manager/AccessManager.sol",
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol",
      "@openzeppelin/contracts/token/ERC20/ERC20.sol",
      "@openzeppelin/contracts/token/ERC721/ERC721.sol",
    ],
  },
  mocha: {
    timeout: 100000,
  },
};
