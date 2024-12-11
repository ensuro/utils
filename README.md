# Utils

In this library we include several utility functions used for tests and other tasks like deployments.


# Hardhat

We include hardhat-retry to enhance the stability of tests in the projects using Hardhat. It automatically retries due to network issues like:

- Header not found. This occurs if the node fails to locate the requested data temporaly.
- -32000: execution aborted (timeout = 10s). This occurs when a network request timeout or node delays. 
- Gas related errors. This occurs during retries so we set initialBaseFeePerGas to 0 so we mitigate it.

### hardhat.config.js

To use hardhat-retry add the following to your Hardhat configuration file:

```js
const hretry = require("@ensuro/utils/js/utils")

hretry.installWrapper();
```

To enable hardhat-retry works correctly you must configure the hardhat network settings. Add this network config to hardha.config.js:

```js
networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
    },
  },
```
