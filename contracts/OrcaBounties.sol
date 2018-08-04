pragma solidity ^0.4.24;

import "./OrcaCrowdsale.sol";
import "./TokenRecoverable.sol";


contract OrcaBounties is TokenRecoverable {

    OrcaCrowdsale public crowdsale;

    constructor(address _crowdsale) public {
        require(_crowdsale != address(0));
        crowdsale = OrcaCrowdsale(_crowdsale);
    }

    function () public payable {
        crowdsale.claimBounty(msg.sender);

        if (msg.value > 0) {
            msg.sender.transfer(msg.value);
        }
    }

    function bountyOf(address beneficiary) public view returns (uint256) {
        return crowdsale.bountyBalances(beneficiary);
    }
}