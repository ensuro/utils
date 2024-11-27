//SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract TestCurrency is ERC20, AccessControl {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

  uint8 internal immutable _decimals;

  constructor(
    string memory name_,
    string memory symbol_,
    uint256 initialSupply,
    uint8 decimals_,
    address admin
  ) ERC20(name_, symbol_) {
    _decimals = decimals_;
    _mint(msg.sender, initialSupply);
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
  }

  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  function mint(address recipient, uint256 amount) external onlyRole(MINTER_ROLE) {
    // require(msg.sender == _owner, "Only owner can mint");
    return _mint(recipient, amount);
  }

  function burn(address recipient, uint256 amount) external onlyRole(BURNER_ROLE) {
    // require(msg.sender == _owner, "Only owner can burn");
    return _burn(recipient, amount);
  }
}
