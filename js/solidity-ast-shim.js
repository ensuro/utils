import { createRequire } from "module";
const require = createRequire(import.meta.url);

export const { findAll } = require("solidity-ast/utils");
