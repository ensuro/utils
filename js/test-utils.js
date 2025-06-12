const { expect } = require("chai");
const hre = require("hardhat");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const withArgs = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { getRole, captureAny, getTransactionEvent, getAddress } = require("./utils");
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

// Install chai matchear for AccessManagedError
Assertion.addMethod("revertedWithAMError", function (contract, user) {
  return new Assertion(this._obj).to.be.revertedWithCustomError(contract, "AccessManagedUnauthorized").withArgs(user);
});

/**
 * Function to deploy a proxy and implementation, similar to hre.upgrades.deployProxy, but without using OZ upgrades
 * library that does a lot of validations that don't work with binary contracts.
 */
async function deployProxy(proxyFactory, implFactory, constructorArgs, initializeArgs, extraProxyArgs) {
  const impl = await implFactory.deploy(...(constructorArgs || []));
  const initializeData = impl.interface.encodeFunctionData("initialize", initializeArgs || []);
  const proxy = await proxyFactory.deploy(impl, initializeData, ...(extraProxyArgs || []));
  const deploymentTransaction = proxy.deploymentTransaction();
  const ret = implFactory.attach(await ethers.resolveAddress(proxy));
  ret.deploymentTransaction = () => deploymentTransaction;
  return ret;
}

async function amScheduleAndExecute(accessManager, target, callData) {
  await expect(accessManager.schedule(target, callData, 0))
    .to.emit(accessManager, "OperationScheduled")
    .withArgs(withArgs.anyValue, withArgs.anyValue, captureAny.uint, withArgs.anyValue, target, withArgs.anyValue);
  const when = captureAny.lastUint;
  await helpers.time.increaseTo(when);
  return accessManager.execute(target, callData);
}

async function amScheduleAndExecuteBatch(accessManager, targets, callDatas) {
  const scheduleCalls = targets.map((target, index) =>
    accessManager.interface.encodeFunctionData("schedule", [getAddress(target), callDatas[index], 0])
  );
  const executeCalls = targets.map((target, index) =>
    accessManager.interface.encodeFunctionData("execute", [getAddress(target), callDatas[index]])
  );
  const tx = await accessManager.multicall(scheduleCalls);
  const receipt = await tx.wait();
  const maxWhen = getTransactionEvent(
    accessManager.interface,
    receipt,
    "OperationScheduled",
    false,
    getAddress(accessManager)
  )
    .map((evt) => evt.args.schedule)
    .reduce((accum, value) => (value > accum ? value : accum), BigInt(0));

  await helpers.time.increaseTo(maxWhen);
  return accessManager.multicall(executeCalls);
}

module.exports = {
  fork,
  initCurrency,
  initForkCurrency,
  setupChain,
  skipForkTests,
  deployProxy,
  amScheduleAndExecute,
  amScheduleAndExecuteBatch,
};
