pragma solidity ^0.4.24;

import "../contracts/Whitelist.sol";


contract TestWhitelist is Whitelist {

    function setNextUserId(uint256 _nextUserId) public {
        nextUserId = _nextUserId;
    }
}