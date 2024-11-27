//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract TestNFT is ERC721 {
  address private _owner;

  error OnlyOwnerCanBurn(address owner);

  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
    _owner = msg.sender;
  }

  function mint(address recipient, uint256 tokenId) public {
    // require(msg.sender == _owner, "Only owner can mint");
    return _mint(recipient, tokenId);
  }

  function burn(uint256 tokenId) public {
    require(ERC721.ownerOf(tokenId) == msg.sender, OnlyOwnerCanBurn(ERC721.ownerOf(tokenId)));
    return _burn(tokenId);
  }
}
