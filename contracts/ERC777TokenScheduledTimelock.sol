pragma solidity ^0.4.23;

import { ERC777Token } from "./erc777/contracts/ERC777Token.sol";
import { ERC777TokensRecipient } from "./erc777/contracts/ERC777TokensRecipient.sol";
import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC820Implementer } from "eip820/contracts/ERC820Implementer.sol";


contract ERC777TokenScheduledTimelock is ERC820Implementer, ERC777TokensRecipient, Ownable {
    using SafeMath for uint256;

    ERC777Token public token;
    uint256 public totalVested;

    struct Timelock {
        uint256 till;
        uint256 amount;
    }

    mapping(address => Timelock[]) public schedule;

    event Released(address to, uint256 amount);

    constructor(address _token) public {
        setInterfaceImplementation("ERC777TokensRecipient", this);
        address tokenAddress = interfaceAddr(_token, "ERC777Token");
        require(tokenAddress != address(0));
        token = ERC777Token(tokenAddress);
    }

    function scheduleTimelock(address _beneficiary, uint256 _lockTokenAmount, uint256 _lockTill) public onlyOwner {
        require(_beneficiary != address(0));
        require(_lockTill > getNow());
        require(token.balanceOf(address(this)) >= totalVested.add(_lockTokenAmount));
        totalVested = totalVested.add(_lockTokenAmount);

        schedule[_beneficiary].push(Timelock({ till: _lockTill, amount: _lockTokenAmount }));
    }

    function release(address _to) public {
        Timelock[] storage timelocks = schedule[_to];
        uint256 tokens = 0;
        uint256 till;
        uint256 n = timelocks.length;
        uint256 timestamp = getNow();
        for (uint256 i = 0; i < n; i++) {
            Timelock storage timelock = timelocks[i];
            till = timelock.till;
            if (till > 0 && till <= timestamp) {
                tokens = tokens.add(timelock.amount);
                timelock.amount = 0;
                timelock.till = 0;
            }
        }
        if (tokens > 0) {
            totalVested = totalVested.sub(tokens);
            token.send(_to, tokens, "");
            emit Released(_to, tokens);
        }
    }

    // solhint-disable-next-line no-unused-vars
    function tokensReceived(address operator, address from, address to, uint256 amount, bytes userData, bytes operatorData) public {

    }

    function getScheduledTimelockCount(address _beneficiary) public view returns (uint256) {
        return schedule[_beneficiary].length;
    }

    function getNow() internal view returns (uint256) {
        return now; // solhint-disable-line
    }
}