import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import HardhatContractSizer from "@solidstate/hardhat-contract-sizer";

import hardhatRetryPlugin from "./js/plugins/retry/index.js";

import { use } from "chai";
import { chaiAccessControl } from "./js/chai-plugins.js";

use(chaiAccessControl);

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, HardhatContractSizer, hardhatRetryPlugin],
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "prague",
    },
    npmFilesToBuild: [
      "@openzeppelin/contracts/governance/TimelockController.sol",
      "@openzeppelin/contracts/access/manager/AccessManager.sol",
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol",
      "@openzeppelin/contracts/token/ERC20/ERC20.sol",
      "@openzeppelin/contracts/token/ERC721/ERC721.sol",
    ],
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
  },
});
