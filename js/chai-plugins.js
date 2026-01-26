import { getRole } from "./utils.js";

// Chai plugin for custom access control / manager assertions
export function chaiAccessControl(chai, utils) {
  const { Assertion } = chai;

  // Install chai matcher
  Assertion.addMethod("revertedWithACError", function (contract, user, role) {
    return new Assertion(this._obj).to.be
      .revertedWithCustomError(contract, "AccessControlUnauthorizedAccount")
      .withArgs(user, getRole(role));
  });

  // Install chai matcher for AccessManagedError
  Assertion.addMethod("revertedWithAMError", function (contract, user) {
    return new Assertion(this._obj).to.be.revertedWithCustomError(contract, "AccessManagedUnauthorized").withArgs(user);
  });
}
