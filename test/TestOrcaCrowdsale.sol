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

    function setNow(uint256 _now) public {
        testNow = _now;
    }

    function getNowTest() public view returns (uint256) {
        return getNow();
    }

    function getNow() internal view returns (uint256) {
        return testNow;
    }

    function getWallet() public pure returns (address) {
        return WALLET;
    }

    function getPartnerWallet() public pure returns (address) {
        return PARTNER_WALLET;
    }

    function getTeamWallet() public pure returns (address) {
        return TEAM_WALLET;
    }

    function getAdvisorsWallet() public pure returns (address) {
        return ADVISORS_WALLET;
    }

    function getTeamTokens() public pure returns (uint256) {
        return TEAM_TOKENS;
    }

    function getAdvisorsTokens() public pure returns (uint256) {
        return ADVISORS_TOKENS;
    }

    function getPartnerTokens() public pure returns (uint256) {
        return PARTNER_TOKENS;
    }

    function getCommunityTokens() public pure returns (uint256) {
        return COMMUNITY_TOKENS;
    }

    function getTokenPrice() public pure returns (uint256) {
        return TOKEN_PRICE;
    }

    function getTeamTokenLockDate() public pure returns (uint256) {
        return TEAM_TOKEN_LOCK_DATE;
    }

}
