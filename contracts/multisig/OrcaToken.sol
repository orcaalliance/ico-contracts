pragma solidity 0.4.18;

import './FreezableToken.sol';

contract OrcaToken is FreezableToken {

    string public name = "ORCA Token";
    string public symbol = "ORCA";
    uint8 public decimals = 18;
    uint256 public totalSupply = 1000000000 * (10 ** uint256(decimals));

    function OrcaToken() public {
        balances[msg.sender]  = totalSupply;
    }
}