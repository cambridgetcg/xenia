// SPDX-License-Identifier: MPL-2.0
// Small connector only: admission, deadlines and retirement stay with host.mjs.
export const pureConnector = operations => async () => ({
  invoke(operation, input) {
    if (!Object.hasOwn(operations, operation)) throw new TypeError('Unknown operation.');
    return operations[operation](input);
  },
  async retire() { return {complete: true}; },
  async disconnect() {},
});
