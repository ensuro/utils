const hre = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { getRole } = require("./utils");
const { Assertion } = require("chai");

const { ethers } = hre;

async function initCurrency(options, initial_targets, initial_balances) {
  const Currency = await ethers.getContractFactory(options.contractClass || "TestCurrency");
  let currency = await Currency.deploy(
    options.name || "Test Currency",
    options.symbol || "TEST",
    options.initial_supply,
    options.decimals || 18,
    ...(options.extraArgs || [])
  );
  initial_targets = initial_targets || [];
  await Promise.all(
    initial_targets.map(async function (user, index) {
      await currency.transfer(user, initial_balances[index]);
    })
  );
  return currency;
}

/**
 *
 * @param currencyAddress The currency contract address, for example the USDC address
 * @param currencyOrigin An account that holds at least sum(initialBalances) of currency tokens
 * @param initialTargets Array of addresses that will receive the initial balances
 * @param initialBalances Initial balances for each address
 */
async function initForkCurrency(currencyAddress, currencyOrigin, initialTargets, initialBalances) {
  const currency = await ethers.getContractAt("IERC20", currencyAddress);
  await helpers.impersonateAccount(currencyOrigin);
  await helpers.setBalance(currencyOrigin, ethers.parseEther("100"));
  const whale = await ethers.getSigner(currencyOrigin);
  await Promise.all(
    initialTargets.map(async function (user, index) {
      await currency.connect(whale).transfer(user, initialBalances[index]);
    })
  );
  return currency;
}

/**
 * Resets hardhat network to fork on the specified block and url
 */
async function setupChain(block, alchemyUrlEnv = "ALCHEMY_URL") {
  const alchemyUrl = process.env[alchemyUrlEnv];
  if (alchemyUrl === undefined) throw new Error(`Define envvar ${alchemyUrlEnv} for this test`);

  if (block === undefined) throw new Error("Block can't be undefined use null for the current block");
  if (block === null) block = undefined;
  return hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: alchemyUrl,
          blockNumber: block,
        },
      },
    ],
  });
}

const skipForkTests = process.env.SKIP_FORK_TESTS === "true";

/**
 * Chai test case wrapper for tests that require forking a live chain.
 *
 * It validates that the chain node URL is set, forks the chain at the specified block and adds the
 * block number to the test name.
 */
const fork = {
  it: (name, blockNumber, test, alchemyUrlEnv = "ALCHEMY_URL") => {
    const fullName = `[FORK ${blockNumber}] ${name}`;

    // eslint-disable-next-line func-style
    const wrapped = async (...args) => {
      await setupChain(blockNumber, alchemyUrlEnv);

      return test(...args);
    };

    return (skipForkTests ? it.skip : it)(fullName, wrapped);
  },
};

if (process.env.ENABLE_HH_WARNINGS !== "yes" && hre.upgrades !== undefined) hre.upgrades.silenceWarnings();

// Install chai matcher
Assertion.addMethod("revertedWithACError", function (contract, user, role) {
  return new Assertion(this._obj).to.be
    .revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
    .withArgs(user, getRole(role));
});

module.exports = {
  fork,
  initCurrency,
  initForkCurrency,
  setupChain,
  skipForkTests,
};