import { expect } from "chai";
import hre from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import { getRole, captureAny, getTransactionEvent, getAddress } from "./utils.js";
import { Assertion } from "chai";

export async function initCurrency(ethers, options, initial_targets, initial_balances) {
  const extraArgs = options.extraArgs || [];
  const Currency = await ethers.getContractFactory(
    options.contractClass || (extraArgs.length == 0 ? "TestCurrency" : "TestCurrencyAC")
  );
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
export async function initForkCurrency(connection, currencyAddress, currencyOrigin, initialTargets, initialBalances) {
  const { ethers, networkHelpers: helpers } = connection;
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
 * Returns a new connection forking from a live chain at the specified block and url
 */
export async function setupChain(block, alchemyUrlEnv = "ALCHEMY_URL") {
  const alchemyUrl = process.env[alchemyUrlEnv];
  if (alchemyUrl === undefined) throw new Error(`Define envvar ${alchemyUrlEnv} for this test`);

  if (block === undefined) throw new Error("Block can't be undefined use null for the current block");
  if (block === null) block = undefined;

  return hre.network.connect({
    override: {
      forking: {
        url: alchemyUrl,
        blockNumber: block,
      },
    },
  });
}

export const skipForkTests = process.env.SKIP_FORK_TESTS === "true";

/**
 * Chai test case wrapper for tests that require forking a live chain.
 *
 * It validates that the chain node URL is set, forks the chain at the specified block and adds the
 * block number to the test name.
 */
export const fork = {
  it: (name, provider, blockNumber, test, alchemyUrlEnv = "ALCHEMY_URL") => {
    const fullName = `[FORK ${blockNumber}] ${name}`;

    // eslint-disable-next-line func-style
    const wrapped = async (...args) => {
      await setupChain(provider, blockNumber, alchemyUrlEnv);

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
export async function deployProxy(ethers, proxyFactory, implFactory, constructorArgs, initializeArgs, extraProxyArgs) {
  const impl = await implFactory.deploy(...(constructorArgs || []));
  const initializeData = impl.interface.encodeFunctionData("initialize", initializeArgs || []);
  const proxy = await proxyFactory.deploy(impl, initializeData, ...(extraProxyArgs || []));
  const deploymentTransaction = proxy.deploymentTransaction();
  const ret = implFactory.attach(await ethers.resolveAddress(proxy));
  ret.deploymentTransaction = () => deploymentTransaction;
  return ret;
}

export async function amScheduleAndExecute(helpers, accessManager, target, callData) {
  await expect(accessManager.schedule(target, callData, 0))
    .to.emit(accessManager, "OperationScheduled")
    .withArgs(anyValue, anyValue, captureAny.uint, anyValue, target, anyValue);
  const when = captureAny.lastUint;
  await helpers.time.increaseTo(when);
  return accessManager.execute(target, callData);
}

export async function amScheduleAndExecuteBatch(helpers, accessManager, targets, callDatas) {
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
