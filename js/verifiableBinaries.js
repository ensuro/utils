const fs = require("fs");
const path = require("path");
const glob = require("glob");
const { execSync } = require("child_process");
const { ethers } = require("ethers");
const { HardhatPluginError } = require("hardhat/plugins");
const { Etherscan } = require("@nomicfoundation/hardhat-verify/internal/etherscan");
const {
  ContractAlreadyVerifiedError,
  VerificationAPIUnexpectedMessageError,
} = require("@nomicfoundation/hardhat-verify/internal/errors");
const { encodeArguments, sleep } = require("@nomicfoundation/hardhat-verify/internal/utilities");
const { extendEnvironment, task, types } = require("hardhat/config");

let artifactCache;

function findArtifactsPath(basePath, options) {
  for (const option of options) {
    const artifactsPath = path.join(basePath, option);
    if (fs.existsSync(artifactsPath) && fs.lstatSync(artifactsPath).isDirectory()) {
      return artifactsPath;
    }
  }
  return undefined;
}

function loadPackageArtifacts(packageConfig, artifactsPath, artifacts) {
  const artifactsConfig = {
    onlyFQ: "no", // options are "no" / "package" / "full"
    whitelist: [],
    blacklist: [],
    ...(packageConfig.artifactsConfig || {}),
  };

  let buildInfoPath = path.join(artifactsPath, "build-info.json");
  if (!fs.existsSync(buildInfoPath)) {
    buildInfoPath = null;
  }
  const finder = new glob.GlobSync(path.join(artifactsPath, "**/*.json"));
  for (const fileName of finder.found) {
    const parsedFile = path.parse(fileName);
    const contractName = parsedFile.name;
    // Skip build-info and debug files
    if (contractName === "build-info" || contractName.endsWith(".dbg")) continue;
    // If there's a whitelist, skip those that aren't in the whitelist
    if (artifactsConfig.whitelist.length !== 0 && !artifactsConfig.whitelist.includes(contractName)) continue;
    // If there's a blacklist, skip those that are in the blacklist
    if (artifactsConfig.blacklist.includes(contractName)) continue;

    artifacts[contractName] = artifacts[contractName] || [];
    artifacts[contractName].push({
      package: packageConfig.package,
      version: packageConfig.version,
      fileName,
      buildInfoPath,
      onlyFQ: artifactsConfig.onlyFQ, // Indicates this contract should match only when specified with full
      // name, like "@openzeppelin/contracts/AccessManager"
    });
  }
}

function loadBinaryArtifacts(hre) {
  const config = hre.config.verifiableBinaries || {};
  const basePath = config.path || "./verifiable-binaries";
  if (!fs.existsSync(basePath)) return {};

  const artifacts = {};
  for (const packageConfig of config.packages || []) {
    let packagePath = packageConfig.path;
    if (packagePath === undefined) {
      packagePath = path.join(basePath, packageConfig.package, packageConfig.version);
    }
    if (!fs.existsSync(packagePath) || !fs.lstatSync(packagePath).isDirectory()) {
      console.warn(`Couldn't find the folder for ${packageConfig} at ${packagePath}`);
      continue;
    }
    const artifactsPath = findArtifactsPath(packagePath, ["artifacts", "build"]);
    if (artifactsPath === undefined) {
      console.warn(`Couldn't find the artifacts for ${packagePath}`);
      continue;
    }
    loadPackageArtifacts(packageConfig, artifactsPath, artifacts);
  }
  return artifacts;
}

function parseContractClass(contractClass) {
  const parts = contractClass.split("/");
  const [name, version] = parts.slice(-1)[0].split("@");
  const package = parts.slice(0, -1).join("/");
  return {
    package,
    version,
    name,
  };
}

function filterArtifact(parsedContractClass) {
  return (artifact) => {
    if (parsedContractClass.package === "") {
      if (artifact.onlyFQ !== "no") return false;
    } else {
      if (artifact.package !== parsedContractClass.package) return false;
    }
    if (parsedContractClass.version === undefined) {
      if (artifact.onlyFQ === "full") return false;
    } else {
      if (artifact.version !== parsedContractClass.version) return false;
    }
    return true;
  };
}

async function findBinaryArtifact(hre, contractClass) {
  /**
   * This should accept
   * <ContractClass>
   * <ContractClass@<version>
   * <package>/ContractClass
   * <package>/ContractClass@<version>
   *
   * If version is not specified it assumes the last version, unless some version is fixed in the config.
   *
   * Returns binaryArtifact = {org, package, version, filePath, buildInfoPath}
   */

  if (artifactCache === undefined) {
    artifactCache = loadBinaryArtifacts(hre);
  }

  const parsedContractClass = parseContractClass(contractClass);
  let foundArtifacts = artifactCache[parsedContractClass.name];
  if (foundArtifacts === undefined) return undefined;
  foundArtifacts = foundArtifacts.filter(filterArtifact(parsedContractClass));
  if (foundArtifacts.length === 0) return undefined;
  if (foundArtifacts.length > 1) {
    throw new HardhatPluginError("verifiableBinaries", `More than one artifact found for ${contractClass}`);
  }
  return foundArtifacts[0];
}

function verifiableContractFactory(contractFactory, binaryArtifact) {
  const handler = {
    get(target, prop, receiver) {
      if (prop === "deploy") {
        return async (...args) => {
          const contract = await target.deploy(...args);
          contract.binaryArtifact = binaryArtifact;
          return contract;
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(contractFactory, handler);
}

function wrapGetContractFactory(hre, defaultGetContractFactory) {
  return async function (contractClass, ...args) {
    if (typeof contractClass === "string") {
      const binaryArtifact = await findBinaryArtifact(hre, contractClass);
      if (binaryArtifact !== undefined) {
        const artifact = JSON.parse(fs.readFileSync(binaryArtifact.fileName));
        return verifiableContractFactory(
          await hre.ethers.getContractFactoryFromArtifact(artifact, ...args),
          binaryArtifact
        );
      }
    }
    return defaultGetContractFactory(contractClass, ...args);
  };
}

function wrapGetContractAt(hre, defaultGetContractAt) {
  return async function (contractClass, ...args) {
    if (typeof contractClass === "string") {
      const binaryArtifact = await findBinaryArtifact(hre, contractClass);

      if (binaryArtifact !== undefined) {
        const artifact = JSON.parse(fs.readFileSync(binaryArtifact.fileName));
        const contract = await hre.ethers.getContractAtFromArtifact(artifact, ...args);
        contract.binaryArtifact = binaryArtifact;
        return contract;
      }
    }
    return defaultGetContractAt(contractClass, ...args);
  };
}

// absolutePath :: String, String -> String
//
// Converts relative paths into absolutePaths
//
// > absolutePath("../foo/bar.sol", "contracts/a/b/buzz.sol")
// "contracts/a/foo/bar.sol"
// > absolutePath("./bar.sol", "contracts/a/b/buzz.sol")
// 'contracts/a/b/bar.sol'
// > absolutePath("bar.sol", "contracts/a/b/buzz.sol")
// 'bar.sol'
function absolutePath(importedFile, sourceFileName) {
  if (!importedFile.startsWith("./") && !importedFile.startsWith("../")) return importedFile;
  const sourcePath = sourceFileName.split("/").slice(0, -1);
  for (const pathComp of importedFile.split("/")) {
    if (pathComp === ".") continue;
    if (pathComp === "..") {
      sourcePath.pop();
    } else {
      sourcePath.push(pathComp);
    }
  }
  return sourcePath.join("/");
}

function addRequiredSources(requiredSources, sources, startSourcePath) {
  const importRe = new RegExp("^import .*[\"'](?<importedFile>.+)[\"'];$", "gmu");
  const queue = [startSourcePath];
  const visited = new Set();

  while (queue.length > 0) {
    const sourcePath = queue.shift();

    if (visited.has(sourcePath)) continue;
    visited.add(sourcePath);

    if (sources[sourcePath] === undefined) {
      throw new Error(`Source ${sourcePath} not found. Keys: ${Object.keys(sources)}`);
    }

    const sourceCode = sources[sourcePath].content;
    sourceCode.replace(importRe, (_, importedFile) => {
      importedFile = absolutePath(importedFile, sourcePath);
      if (!requiredSources.includes(importedFile)) {
        requiredSources.push(importedFile);
        queue.push(importedFile);
      }
    });
  }
}

function buildInfoForSource(fullBuildInfo, sourceName) {
  // First remove the output, if present, since not needed for verification
  Reflect.deleteProperty(fullBuildInfo, "output");
  const requiredSources = [sourceName];
  const sources = fullBuildInfo.input.sources;
  addRequiredSources(requiredSources, sources, sourceName);
  fullBuildInfo.input.sources = Object.fromEntries(requiredSources.map((source) => [source, sources[source]]));
  return fullBuildInfo;
}

async function verifyBinaryContract(hre, contract, isProxy, constructorArguments, libraries) {
  const address = await ethers.resolveAddress(contract);
  const { fileName, buildInfoPath } = contract.binaryArtifact;
  const fullBuildInfo = JSON.parse(fs.readFileSync(buildInfoPath));
  const artifact = JSON.parse(fs.readFileSync(fileName));
  const buildInfo = buildInfoForSource(fullBuildInfo, artifact.sourceName);
  // Quick Fix for SwapLibrary (for now)
  // Expects {file: {LibraryName: address}} but we receive LibraryName: address
  libraries = libraries || {};
  if (libraries.SwapLibrary !== undefined) {
    libraries["@ensuro/swaplibrary/contracts/SwapLibrary.sol"] = { SwapLibrary: libraries.SwapLibrary };
    Reflect.deleteProperty(libraries, "SwapLibrary");
  }
  return verifyFromArtifactAndBuildInfo(hre, address, artifact, buildInfo, false, constructorArguments, libraries);
}

async function verifyFromArtifactAndBuildInfo(
  hre,
  address,
  artifact,
  buildInfo,
  force,
  constructorArguments,
  libraries
) {
  const chainConfig = await Etherscan.getCurrentChainConfig(
    hre.network.name,
    hre.network.provider,
    hre.config.etherscan.customChains
  );

  const etherscan = Etherscan.fromChainConfig(hre.config.etherscan.apiKey, chainConfig);

  let isVerified = false;
  isVerified = await etherscan.isVerified(address);
  if (!force && isVerified) {
    const contractURL = etherscan.getContractUrl(address);
    console.log(`The contract ${address} has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
${contractURL}
`);
    return {
      success: false,
      message: "Contract already verified",
    };
  }
  const contractFQN = `${artifact.sourceName}:${artifact.contractName}`;
  const compilerInput = buildInfo.input;
  compilerInput.settings.libraries = libraries || {};

  const encodedConstructorArguments = await encodeArguments(
    artifact.abi,
    artifact.sourceName,
    artifact.contractName,
    constructorArguments
  );

  const { message: guid } = await etherscan.verify(
    address,
    JSON.stringify(compilerInput),
    contractFQN,
    `v${buildInfo.solcLongVersion}`,
    encodedConstructorArguments
  );

  // Compilation is bound to take some time so there's no sense in requesting status immediately.
  await sleep(700);
  const verificationStatus = await etherscan.getVerificationStatus(guid);

  // Etherscan answers with already verified message only when checking returned guid
  if (verificationStatus.isAlreadyVerified()) {
    throw new ContractAlreadyVerifiedError(contractFQN, address);
  }

  if (!(verificationStatus.isFailure() || verificationStatus.isSuccess())) {
    // Reaching this point shouldn't be possible unless the API is behaving in a new way.
    throw new VerificationAPIUnexpectedMessageError(verificationStatus.message);
  }

  if (verificationStatus.isSuccess()) {
    const contractURL = etherscan.getContractUrl(address);
    console.log(`Successfully verified contract ${artifact.contractName} on the block explorer.
${contractURL}\n`);
  }

  return {
    success: verificationStatus.isSuccess(),
    message: verificationStatus.message,
  };
}

function wrapEthersFunctions() {
  // eslint-disable-next-line no-undef
  extendEnvironment((hre) => {
    hre.ethers.getContractAt = wrapGetContractAt(hre, hre.ethers.getContractAt);
    // eslint-disable-next-line no-undef
    hre.ethers.getContractFactory = wrapGetContractFactory(hre, hre.ethers.getContractFactory);
  });
}

function addTasks() {
  task("vb:downloadBinaries", "Downloads verifiable binaries")
    .addOptionalParam("recreate", "Recreates all the verifiable-binaries structure", false, types.boolean)
    // eslint-disable-next-line no-unused-vars
    .setAction(async function (taskArgs, hre) {
      const config = hre.config.verifiableBinaries || {};
      const basePath = config.path || "./verifiable-binaries";
      for (const packageConfig of config.packages || []) {
        // The script runs more or less this:
        // npm pack --quiet --pack-destination /tmp @openzeppelin/contracts@5.1.0
        // mkdir -p verifiable-binaries/@openzeppelin/contracts/5.1.0
        // tar zxvf /tmp/openzeppelin-contracts-5.1.0.tgz --strip 1 -C verifiable-binaries/@openzeppelin/contracts/5.1.0
        if (packageConfig.type !== "npm" || packageConfig.packagePath !== undefined) continue;
        execSync(`scripts/fetch-binary-package.sh ${basePath} ${packageConfig.package} ${packageConfig.version} npm`);
      }
    });
  task("vb:verify", "Verifies a binary contract on Etherscan")
    .addParam("contractType", "The contract type to verify")
    .addParam("address", "The contract address to verify")
    .addOptionalVariadicPositionalParam("constructorArguments", "The constructor arguments", [])
    .setAction(async function ({ contractType, constructorArguments, address }, hre) {
      const contract = await hre.ethers.getContractAt(contractType, address);

      await verifyBinaryContract(hre, contract, false, constructorArguments);
    });
  task("vb:findArtifact", "Finds the artifact for a contract")
    .addPositionalParam("contract", "The contract type to find")
    .setAction(async function ({ contract }, hre) {
      const artifact = await findBinaryArtifact(hre, contract);
      if (artifact === undefined) {
        console.log(`Binary artifact not found for ${contract}`);
        const legacyArtifact = await hre.artifacts.readArtifact(contract);
        if (legacyArtifact !== undefined)
          console.log("Legacy artifact found:", {
            contractName: legacyArtifact.contractName,
            sourceName: legacyArtifact.sourceName,
          });
      } else {
        console.log(artifact);
      }
    });
}

module.exports = {
  findBinaryArtifact,
  loadBinaryArtifacts,
  verifyBinaryContract,
  wrapEthersFunctions,
  addTasks,
};
