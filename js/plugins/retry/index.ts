import { task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
import type { HardhatPlugin } from "hardhat/types/plugins";

import "./type-extensions.js";

const hardhatRetryPlugin: HardhatPlugin = {
  id: "hardhat-retry",
  hookHandlers: {
    network: () => import("./hooks/network.js"),
  },
  tasks: [
    task("hardhat-retry-debug", "Sample task to test the plugin")
      .setAction(() => {
        console.log("DEBUG: hardhat-retry-debug task executed");
      })
      .build(),
  ],
};

export default hardhatRetryPlugin;
