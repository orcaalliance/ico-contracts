pragma solidity ^0.4.24;


contract Debuggable {
    event LogUI(string message, uint256 value);

    function logUI(string message, uint256 value) internal {
        emit LogUI(message, value);
    }
}
