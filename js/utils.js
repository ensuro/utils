// In this module we include the utility functions that don't require hre global variable

const { findAll } = require("solidity-ast/utils");
const ethers = require("ethers");
const { IMPLEMENTATION_SLOT } = require("./constants");

const _E = ethers.parseEther;
const WAD = 10n ** 18n; // 1e18
const RAY = 10n ** 27n; // 1e27

function getAddress(addressable) {
  return addressable.address || addressable.target || addressable;
}

async function getStorageLayout(hre, contractSrc, contractName) {
  const buildInfo = await hre.artifacts.getBuildInfo(`${contractSrc}:${contractName}`);
  if (buildInfo === undefined) throw new Error(`Contract ${contractSrc}:${contractName} not in artifacts`);

  const solcOutput = buildInfo.output;

  const storageLayouts = {};

  for (const def of findAll("ContractDefinition", solcOutput.sources[contractSrc].ast)) {
    storageLayouts[def.name] = solcOutput.contracts[contractSrc][def.name].storageLayout;
  }

  return storageLayouts[contractName];
}

/**
 * Creates a fixed-point conversion function for the desired number of decimals
 * @param decimals The number of decimals. Must be >= 6.
 * @returns The amount function created. The function can receive strings (recommended),
 *          floats/doubles (not recommended) and integers.
 *
 *          Floats will be rounded to 6 decimal before scaling.
 */
function amountFunction(decimals) {
  return function (value) {
    if (value === undefined) return undefined;

    if (typeof value === "string" || value instanceof String) {
      return ethers.parseUnits(value, decimals);
    }

    if (!Number.isInteger(value)) {
      return BigInt(Math.round(value * 1e6).toString()) * BigInt(Math.pow(10, decimals - 6).toString());
    }

    return BigInt(value.toString()) * BigInt("10") ** BigInt(decimals.toString());
  };
}

/** Wad function */
const _W = amountFunction(18);

/** Ray function */
const _R = amountFunction(27);

/** Amount function - For tokens with 6 decimals */
const _A = amountFunction(6);

/**
 * Returns a role identifier by computing the keccak of the role name.
 */
function getRole(role) {
  if (role.startsWith("0x")) return role;
  return role === "DEFAULT_ADMIN_ROLE" ? ethers.ZeroHash : ethers.keccak256(ethers.toUtf8Bytes(role));
}

/**
 * Builds the component role identifier
 *
 * Mimics the behaviour of the AccessManager.getComponentRole method
 *
 * Component roles are roles created doing XOR between the component
 * address and the original role.
 *
 * Example:
 *     getComponentRole("0xc6e7DF5E7b4f2A278906862b61205850344D4e7d", "ORACLE_ADMIN_ROLE")
 *     // "0x05e01b185238b49f750d03d945e38a7f6c3be8b54de0ee42d481eb7814f0d3a8"
 */
function getComponentRole(componentAddress, role) {
  if (!role.startsWith("0x")) role = getRole(role);

  // 32 byte array
  const bytesRole = ethers.getBytes(role);

  // 20 byte array
  const bytesAddress = ethers.getBytes(componentAddress);

  // xor each byte, padding bytesAddress with zeros at the end
  // eslint-disable-next-line no-bitwise
  return ethers.hexlify(bytesRole.map((elem, idx) => elem ^ (bytesAddress[idx] || 0)));
}

/**
 * Grant a component role to a user.
 *
 * To be used with Ensuro v2 AccessManager
 */
// eslint-disable-next-line no-empty-function
async function grantComponentRole(hre, contract, component, role, user, txOverrides = {}, log = () => {}) {
  let userAddress;
  if (user === undefined) {
    user = await getDefaultSigner(hre);
    userAddress = user.address;
  } else {
    userAddress = user.address === undefined ? user : user.address;
  }
  const roleHex = getRole(role);
  const componentAddress = component.address || component;
  const componentRole = await contract.getComponentRole(componentAddress, roleHex);
  if (!(await contract.hasRole(componentRole, userAddress))) {
    await contract.grantComponentRole(componentAddress, roleHex, userAddress, txOverrides);
    log(`Role ${role} (${roleHex}) Component ${componentAddress} granted to ${userAddress}`);
  } else {
    log(`Role ${role} (${roleHex}) Component ${componentAddress} already granted to ${userAddress}`);
  }
}

async function getDefaultSigner(hre) {
  const signers = await hre.ethers.getSigners();
  return signers[0];
}

/**
 * Grant a role to a user
 */
// eslint-disable-next-line no-empty-function
async function grantRole(hre, contract, role, user, txOverrides = {}, log = () => {}) {
  let userAddress;
  if (user === undefined) {
    user = await getDefaultSigner(hre);
    userAddress = user.address;
  } else {
    userAddress = user.address === undefined ? user : user.address;
  }
  const roleHex = getRole(role);
  if (!(await contract.hasRole(roleHex, userAddress))) {
    await contract.grantRole(roleHex, userAddress, txOverrides);
    log(`Role ${role} (${roleHex}) granted to ${userAddress}`);
  } else {
    log(`Role ${role} (${roleHex}) already granted to ${userAddress}`);
  }
}

/**
 * Finds an event in the receipt
 * @param {Interface} interface The interface of the contract that contains the requested event
 * @param {TransactionReceipt} receipt Transaction receipt containing the events in the logs
 * @param {String} eventName The name of the event we are interested in
 * @param {Boolean} firstOnly If false, returns all the events matching the name
 * @param {String} contractAddress If not null, if returns only those events generated by the specified contract
 * @returns {LogDescription}
 */
function getTransactionEvent(interface, receipt, eventName, firstOnly = true, contractAddress = null) {
  const ret = [];
  // for each log in the transaction receipt
  for (const log of receipt.logs) {
    let parsedLog;
    if (contractAddress !== null && contractAddress !== log.address) continue;
    try {
      parsedLog = interface.parseLog(log);
    } catch (error) {
      continue;
    }
    if (parsedLog?.name == eventName) {
      if (firstOnly) return parsedLog;
      ret.push(parsedLog);
    }
  }
  return firstOnly ? null : ret;
}

/**
 * Builds AccessControl error message for comparison in tests
 */
function accessControlMessage(user, component, role) {
  const userAddr = getAddress(user);
  const compAddr = component !== null ? getAddress(component) : component;
  const roleHash = component !== null ? getComponentRole(compAddr, role) : getRole(role);

  return `AccessControl: account ${userAddr.toLowerCase()} is missing role ${roleHash}`;
}

async function readImplementationAddress(hre, contractAddress) {
  const implStorage = await hre.ethers.provider.getStorageAt(contractAddress, IMPLEMENTATION_SLOT);
  return ethers.utils.getAddress(ethers.utils.hexDataSlice(implStorage, 12));
}

/**
 * Converts a string value to uint256(keccak(value))
 * @param {string} value
 * @returns {ethers.BigNumber}
 */
function uintKeccak(value) {
  return BigInt(ethers.keccak256(ethers.toUtf8Bytes(value)));
}

module.exports = {
  _E,
  _A,
  _R,
  _W,
  accessControlMessage,
  amountFunction,
  getAddress,
  getDefaultSigner,
  getRole,
  getComponentRole,
  getStorageLayout,
  getTransactionEvent,
  grantRole,
  grantComponentRole,
  RAY,
  readImplementationAddress,
  uintKeccak,
  WAD,
};
