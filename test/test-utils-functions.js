const hre = require("hardhat");
const { expect } = require("chai");
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { _A, getRole, grantRole } = require("../js/utils");
const { initCurrency } = require("../js/test-utils");

const { ethers } = hre;

describe("Utils library tests", function () {
  let admin, anon, user1, user2;

  beforeEach(async () => {
    [, anon, admin, user1, user2] = await ethers.getSigners();
  });

  async function deployFixture() {
    const currency = await initCurrency(
      { name: "Test USDC", symbol: "USDC", decimals: 6, initial_supply: _A(50000), extraArgs: [admin] },
      [anon, user1, user2, admin],
      [_A("10000"), _A("2000"), _A("1000"), _A("20000")]
    );

    return { currency };
  }

  it("Checks only MINTER_ROLE can mint", async () => {
    const { currency } = await helpers.loadFixture(deployFixture);

    expect(await currency.balanceOf(anon)).to.equal(_A(10000));

    // These two tests are equivalent
    await expect(currency.connect(anon).mint(anon, _A(100)))
      .to.be.revertedWithCustomError(currency, "AccessControlUnauthorizedAccount")
      .withArgs(anon, getRole("MINTER_ROLE"));
    await expect(currency.connect(anon).mint(anon, _A(100))).to.be.revertedWithACError(currency, anon, "MINTER_ROLE");

    await grantRole(hre, currency.connect(admin), "MINTER_ROLE", admin);
    await expect(currency.connect(admin).mint(anon, _A(100))).not.to.be.reverted;
    expect(await currency.balanceOf(anon)).to.equal(_A(10100));
  });
});
