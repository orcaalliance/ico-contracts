pragma solidity 0.4.18;

contract ERC223Receiver {
    function tokenFallback( address _origin, uint _value, bytes _data) public returns (bool ok);
}