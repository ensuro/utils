pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TestCurrency} from "../contracts/TestCurrency.sol";

contract TestCurrencyTest is Test {
  function testNoPermissions() public {
    TestCurrency currency = new TestCurrency("TestCurrency", "TC", 1000e18, 18);
    address anon = address(0x123);

    // Anyone can mint and burn
    assertEq(currency.balanceOf(anon), 0);

    vm.prank(anon);
    currency.mint(anon, 500e18);
    assertEq(currency.balanceOf(anon), 500e18);

    currency.burn(anon, 200e18);
    assertEq(currency.balanceOf(anon), 300e18);
  }
}
