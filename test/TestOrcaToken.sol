pragma solidity ^0.4.23;

import "../contracts/OrcaToken.sol";


contract TestOrcaToken is OrcaToken {
    uint256 private testNow;

    constructor() public OrcaToken() {

    }

    function setNow(uint256 _now) public {
        testNow = _now;
    }

    function getNowTest() public view returns (uint256) {
        return getNow();
    }

    function getNow() internal view returns (uint256) {
        return testNow;
    }

    function sendProxy(address _to, uint256 _amount, bytes _userData) public {
        send(_to, _amount, _userData);
    }

}
