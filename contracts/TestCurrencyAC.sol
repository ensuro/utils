//SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {TestCurrency} from "./TestCurrency.sol";

contract TestCurrencyAC is TestCurrency, AccessControl {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

  constructor(
    string memory name_,
    string memory symbol_,
    uint256 initialSupply,
    uint8 decimals_,
    address admin
  ) TestCurrency(name_, symbol_, initialSupply, decimals_) {
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
  }

  function mint(address recipient, uint256 amount) public override onlyRole(MINTER_ROLE) {
    super.mint(recipient, amount);
  }

  function burn(address recipient, uint256 amount) public override onlyRole(BURNER_ROLE) {
    super.burn(recipient, amount);
  }
}
