//SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {TestCurrency} from "./TestCurrency.sol";

contract TestERC4626 is ERC4626 {
  bool internal _broken;

  error VaultIsBroken(bytes4 selector);

  modifier isBroken() {
    require(!_broken, VaultIsBroken(bytes4(msg.data[0:4])));
    _;
  }

  constructor(
    string memory name_,
    string memory symbol_,
    IERC20Metadata asset_
  ) ERC20(name_, symbol_) ERC4626(asset_) {}

  function _deposit(
    address caller,
    address receiver,
    uint256 assets,
    uint256 shares
  ) internal virtual override isBroken {
    super._deposit(caller, receiver, assets, shares);
  }

  function _withdraw(
    address caller,
    address receiver,
    address owner,
    uint256 assets,
    uint256 shares
  ) internal virtual override isBroken {
    super._withdraw(caller, receiver, owner, assets, shares);
  }

  /*
   * @dev Adds or remove assets not generated by deposits/withdraw - For testing discrete earnings/losses
   */
  function discreteEarning(int256 assets) external {
    if (assets > 0) {
      TestCurrency(asset()).mint(address(this), uint256(assets));
    } else {
      TestCurrency(asset()).burn(address(this), uint256(-assets));
    }
  }

  function setBroken(bool broken_) external {
    _broken = broken_;
  }

  function broken() external view returns (bool) {
    return _broken;
  }
}
