//SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract TestCurrencyPermit is ERC20Permit {
  uint8 internal immutable _decimals;

  constructor(
    string memory name_,
    string memory symbol_,
    uint256 initialSupply,
    uint8 decimals_
  ) ERC20(name_, symbol_) ERC20Permit(name_) {
    _decimals = decimals_;
    _mint(msg.sender, initialSupply);
  }

  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  function mint(address recipient, uint256 amount) public virtual {
    return _mint(recipient, amount);
  }

  function burn(address recipient, uint256 amount) public virtual {
    return _burn(recipient, amount);
  }
}
