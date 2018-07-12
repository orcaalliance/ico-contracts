pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Basic.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";


contract TokenRecoverable is Ownable {
    using SafeERC20 for ERC20Basic;

    function recoverTokens(ERC20Basic token, address to, uint256 amount) public onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance >= amount);
        token.safeTransfer(to, amount);
    }
}