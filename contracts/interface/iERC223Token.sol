pragma solidity 0.4.18;


contract iERC223Token {
    function transfer(address to, uint value, bytes data) public returns (bool ok);
    function transferFrom(address from, address to, uint value, bytes data) public returns (bool ok);
}