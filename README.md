# Utils

In this library we include several utility functions used for tests and other tasks like deployments.

## Migration to hardhat 3

Starting on v1.0.0 these utils use hardhat 3.

These are the changes required to migrate. Some steps from the [official migration guide](https://hardhat.org/docs/migrate-from-hardhat2) are included here for completeness, but be sure to read [the official migration guide](https://hardhat.org/docs/migrate-from-hardhat2) and the [tests migration guide](https://hardhat.org/docs/migrate-from-hardhat2/guides/mocha-tests) first.

General hardhat 3 migration:

1. Make sure you're on node 22.10 or later: `nvm use 22`
2. Clear cache: `npx hardhat clean`
3. Remove all hardhat packages from your `package.json`, this includes:

- `@nomicfoundation/*`
- `@nomiclabs/*`
- `hardhat`
- `hardhat-contract-sizer`
- `hardhat-dependency-compiler`
- `solidity-coverage`
- `@ensuro/utils` v0

4. Execute package uninstall: `npm i`
5. Remove old hardhat config: `mv hardhat.config.js hardhat.config.old.js`
6. Make the project ESM, by adding `"type": "module"` to `package.json`
7. Install hardhat 3: `npm add --save-dev hardhat @nomicfoundation/hardhat-toolbox-mocha-ethers @solidstate/hardhat-contract-sizer`
8. Create an empty config:

```js
import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import HardhatContractSizer from "@solidstate/hardhat-contract-sizer";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, HardhatContractSizer],
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
      // List all contracts you had under dependencyCompiler here
    ],
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
  },
});
```

9. Run `npx hardhat build` to check everything is working so far

Tests migration checklist:

- Convert statements like `const x = require("x")` to `import x from "x"`.
- Convert `module.exports = x` to `export default x` and `module.exports.x = 1` to `export const x = 1`.
- Initialize a connection at the test-module top-level (or wherever):

```js
const connection = await hre.network.connect();
const { networkHelpers: helpers, ethers } = connection;
```

- Pass `ethers` as the first argument to all calls to `initCurrency`, `deployProxy` and `readImplementationAddress`. It must be the one from the connection, don't import ethersjs directly.
- Pass the connection as the first argument to all calls to `initForkCurrency`
- Pass the networkHelpers as the first argument to all calls to `amScheduleAndExecute` and `amScheduleAndExecuteBatch`.
- The function `setupChain` now creates a new connection forking at the given block/url and returns it
- Custom chai matchers like `revertedWithACError` and `revertedWithAMError` now require some additional initialization in hardhat.config.ts:

```js
import { use } from "chai";
import { chaiAccessControl } from "@ensuro/utils/js/chai-plugins";

use(chaiAccessControl);
```

Other stuff to look out for:

1. The solidity build now generates several build-info file. Adapt build scripts to only take the `.json` one (exclude the `.output.json` one).
2. `npx hardhat size-contracts` is now `npx hardhat contract-size list`

## Hardhat-Retry

TODO: this plugins needs to be implemented as a proper hardhat plugin on hardhat 3.

We include hardhat-retry to enhance the stability of tests in the projects using Hardhat. It automatically retries due to network issues like:

- Header not found. This occurs if the node fails to locate the requested data temporaly.
- -32000: execution aborted (timeout = 10s). This occurs when a network request timeout or node delays.
- Gas related errors. This occurs during retries so we set initialBaseFeePerGas to 0 so we mitigate it.

### hardhat.config.ts

To use hardhat-retry add the following to your Hardhat configuration file:

```js
import hardhatRetryPlugin from "@ensuro/utils/plugins/retry/index.js";


export default defineConfig({
  plugins: [hardhatRetryPlugin],
  ...
})
```

## Verifiable binaries

TODO: adapt this to hardhat3.

The verifiableBinaries module enables the use of compiled contracts, fetched from NPM packages.

### hardhat.config.js

```js
const verifiableBinaries = require("@ensuro/utils/js/verifiableBinaries");

verifiableBinaries.wrapEthersFunctions();
verifiableBinaries.addTasks();
```
