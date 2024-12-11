# Utils

In this library we include several utility functions used for tests and other tasks like deployments.


# Hardhat

We include hardhat-retry to enhance the stability of tests in the projects using Hardhat. It automatically retries due to network issues.

### hardhat.config.js

To enable hardhat-retry works correctly you must configure the hardhat network settings. Add this network config to hardha.config.js:

```js
networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
    },
  },
```