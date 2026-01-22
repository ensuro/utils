import hre from "hardhat";
import { expect } from "chai";
import { _A, getRole, grantRole, makeEIP2612Signature, readImplementationAddress } from "../js/utils.js";
import { initCurrency, deployProxy } from "../js/test-utils.js";

const connection = await hre.network.connect();
const { networkHelpers: helpers, ethers } = connection;
const { MaxUint256 } = ethers;

describe("Utils library tests", function () {
  let deployer, admin, anon, user1, user2;
  let initialState;

  before(async () => {
    initialState = await helpers.takeSnapshot();
  });

  beforeEach(async () => {
    [deployer, anon, admin, user1, user2] = await ethers.getSigners();
  });

  async function deployACFixture() {
    // Fixture with TestCurrencyAC (with access control)
    const currency = await initCurrency(
      ethers,
      { name: "Test USDC", symbol: "USDC", decimals: 6, initial_supply: _A(50000), extraArgs: [admin] },
      [anon, user1, user2, admin],
      [_A("10000"), _A("2000"), _A("1000"), _A("20000")]
    );

    return { currency };
  }

  async function deployFixture() {
    // Fixture with TestCurrency (without access control)
    const currency = await initCurrency(
      ethers,
      { name: "Test USDC", symbol: "USDC", decimals: 6, initial_supply: _A(50000) },
      [anon, user1, user2, admin],
      [_A("10000"), _A("2000"), _A("1000"), _A("20000")]
    );

    return { currency };
  }

  async function deployFixturePermit() {
    // Fixture with TestCurrency (without access control)
    const currency = await initCurrency(
      ethers,
      {
        name: "Test USDC",
        symbol: "USDC",
        decimals: 6,
        initial_supply: _A(50000),
        contractClass: "TestCurrencyPermit",
      },
      [anon, user1, user2, admin],
      [_A("10000"), _A("2000"), _A("1000"), _A("20000")]
    );

    return { currency };
  }

  it("Checks only MINTER_ROLE can mint (TestCurrencyAC)", async () => {
    const { currency } = await helpers.loadFixture(deployACFixture);

    expect(await currency.balanceOf(anon)).to.equal(_A(10000));

    // These two tests are equivalent
    await expect(currency.connect(anon).mint(anon, _A(100)))
      .to.be.revertedWithCustomError(currency, "AccessControlUnauthorizedAccount")
      .withArgs(anon, getRole("MINTER_ROLE"));
    await expect(currency.connect(anon).mint(anon, _A(100))).to.be.revertedWithACError(currency, anon, "MINTER_ROLE");

    await grantRole(ethers, currency.connect(admin), "MINTER_ROLE", admin);
    await currency.connect(admin).mint(anon, _A(100));
    expect(await currency.balanceOf(anon)).to.equal(_A(10100));
  });

  it("Checks anyone can mint and burnd (TestCurrency)", async () => {
    const { currency } = await helpers.loadFixture(deployFixture);

    expect(await currency.balanceOf(anon)).to.equal(_A(10000));

    await currency.connect(admin).mint(anon, _A(100));
    expect(await currency.balanceOf(anon)).to.equal(_A(10100));
    await currency.connect(admin).burn(anon, _A(150));
    expect(await currency.balanceOf(anon)).to.equal(_A(9950));
  });

  it("Checks gasless spending approvals (TestCurrencyPermit)", async () => {
    const { currency } = await helpers.loadFixture(deployFixturePermit);

    expect(await currency.balanceOf(user1)).to.equal(_A(2000));
    expect(await currency.balanceOf(user2)).to.equal(_A(1000));

    const { sig, deadline } = await makeEIP2612Signature(
      connection,
      currency,
      user1,
      await ethers.resolveAddress(user2),
      _A(200)
    );
    await expect(currency.permit(user1, user2, _A(200), deadline, sig.v, sig.r, sig.s))
      .to.emit(currency, "Approval")
      .withArgs(user1, user2, _A(200));

    await expect(currency.connect(user2).transferFrom(user1, user2, _A(60)))
      .to.emit(currency, "Transfer")
      .withArgs(user1, user2, _A(60));

    expect(await currency.balanceOf(user1)).to.equal(_A(2000 - 60));
    expect(await currency.balanceOf(user2)).to.equal(_A(1000 + 60));
  });

  it("Checks TestERC4626", async () => {
    const { currency } = await helpers.loadFixture(deployACFixture);

    expect(await currency.balanceOf(anon)).to.equal(_A(10000));

    const TestERC4626 = await ethers.getContractFactory("TestERC4626");
    const vault = await TestERC4626.deploy("Test", "TEST", currency);

    await currency.connect(anon).approve(vault, _A(1000));
    await vault.connect(anon).deposit(_A(1000), anon);

    expect(await vault.totalAssets()).to.equal(_A(1000));

    await grantRole(hre, currency.connect(admin), "MINTER_ROLE", vault);

    await vault.discreteEarning(_A(500));
    expect(await vault.totalAssets()).to.equal(_A(1500));
    expect(await vault.totalSupply()).to.equal(_A(1000));

    await grantRole(hre, currency.connect(admin), "BURNER_ROLE", vault);
    await vault.discreteEarning(_A(-200));

    expect(await vault.totalAssets()).to.equal(_A(1300));

    await vault.connect(anon).redeem(_A(1000), anon, anon);
    expect(await currency.balanceOf(anon)).to.closeTo(_A(10300), _A("0.0001"));
  });

  it("Should be able to override TestERC4626 maxXXX methods", async () => {
    const { currency } = await helpers.loadFixture(deployFixture);

    const TestERC4626 = await ethers.getContractFactory("TestERC4626");
    const vault = await TestERC4626.deploy("Test", "TEST", currency);

    const methods = [
      {
        name: "Deposit",
        option: 0,
        initial: MaxUint256,
        tests: [_A(2), MaxUint256],
      },
      {
        name: "Mint",
        option: 1,
        initial: MaxUint256,
        tests: [_A(3), MaxUint256],
      },
      {
        name: "Withdraw",
        option: 2,
        initial: 0,
        tests: [_A(4), MaxUint256, 0],
      },
      {
        name: "Redeem",
        option: 3,
        initial: 0,
        tests: [_A(4), MaxUint256, 0],
      },
    ];

    for (const method of methods) {
      expect(await vault[`max${method.name}`](anon)).to.equal(method.initial);
      for (const testValue of method.tests) {
        await vault.setOverride(method.option, testValue);
        expect(await vault[`max${method.name}`](anon)).to.equal(testValue);
      }
      await vault.setOverride(method.option, await vault.OVERRIDE_UNSET());
      expect(await vault[`max${method.name}`](anon)).to.equal(method.initial);
    }
  });

  it("Can deploy a proxy contract and obtain the implementation address for it", async () => {
    await initialState.restore(); // reset state to force deterministic addresses

    expect(deployer.address).to.equal("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"); // sanity check for deterministic address below
    expect(await deployer.getNonce()).to.equal(0);

    const ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
    const ImplementationFactory = await ethers.getContractFactory("UpgradeableMock");
    const contract = await deployProxy(ethers, ProxyFactory, ImplementationFactory, [], [admin.address]);
    expect(await deployer.getNonce()).to.equal(2); // sanity check for deterministic address below

    expect(await contract.getValue()).to.equal(0);
    await contract.setValue(42);
    expect(await contract.getValue()).to.equal(42);

    expect(await deployer.getNonce()).to.equal(3);
    const implAddress = await readImplementationAddress(ethers, contract);
    expect(implAddress).to.equal("0x5FbDB2315678afecb367f032d93F642f64180aa3");
  });
});
