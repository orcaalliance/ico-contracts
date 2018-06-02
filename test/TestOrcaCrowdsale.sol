pragma solidity ^0.4.23;

import "../contracts/OrcaCrowdsale.sol";


contract TestOrcaCrowdsale is OrcaCrowdsale {
    uint256 private testNow;
    constructor(address token, address whitelist) public OrcaCrowdsale(token, whitelist) {
    }

    function usdToTokensTest(uint256 _usd, uint8 _stage) public view returns (uint256) {
        return usdToTokens(_usd, _stage);
    }

    function tokensToUsdTest(uint256 _tokens, uint8 _stage) public view returns (uint256) {
        return tokensToUsd(_tokens, _stage);
    }

    function getStageBonus(uint256 index) public view returns (uint256) {
        return stages[index].bonus;
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

}
