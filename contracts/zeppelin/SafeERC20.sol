pragma solidity 0.4.18;

import './StandardToken.sol';

/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure.
 */
library SafeERC20 {
  function safeTransfer(StandardToken token, address to, uint256 value) internal {
    assert(token.transfer(to, value));
  }

  function safeTransferFrom(StandardToken token, address from, address to, uint256 value) internal {
    assert(token.transferFrom(from, to, value));
  }

  function safeApprove(StandardToken token, address spender, uint256 value) internal {
    assert(token.approve(spender, value));
  }
}
