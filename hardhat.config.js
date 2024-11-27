require("dotenv").config();

require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("hardhat-dependency-compiler");

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
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  dependencyCompiler: {
    paths: ["@openzeppelin/contracts/governance/TimelockController.sol"],
  },
};
