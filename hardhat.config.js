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
  networks: {
    hardhat: {
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
};
