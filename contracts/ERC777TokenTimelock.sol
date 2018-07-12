pragma solidity ^0.4.23;

import { ERC777Token } from "./erc777/contracts/ERC777Token.sol";
import { ERC777TokensRecipient } from "./erc777/contracts/ERC777TokensRecipient.sol";
import { ERC820Implementer } from "eip820/contracts/ERC820Implementer.sol";


/**
 * @title TokenTimelock
 * @dev TokenTimelock is a token holder contract that will allow a
 * beneficiary to extract the tokens after a given release time
 */
contract ERC777TokenTimelock is ERC820Implementer, ERC777TokensRecipient {

    // ERC20 basic token contract being held
    ERC777Token public token;

    // beneficiary of tokens after they are released
    address public beneficiary;

    // timestamp when token release is enabled
    uint256 public releaseTime;

    constructor(address _token, address _beneficiary, uint256 _releaseTime) public {
        // solium-disable-next-line security/no-block-members
        setInterfaceImplementation("ERC777TokensRecipient", this);
        address tokenAddress = interfaceAddr(_token, "ERC777Token");
        require(tokenAddress != address(0));
        token = ERC777Token(tokenAddress);

        require(_releaseTime > now);
        beneficiary = _beneficiary;
        releaseTime = _releaseTime;
    }

    /**
    * @notice Transfers tokens held by timelock to beneficiary.
    */
    function release() public {
        // solium-disable-next-line security/no-block-members
        require(now >= releaseTime);

        uint256 amount = token.balanceOf(address(this));
        require(amount > 0);

        token.send(beneficiary, amount, "");
    }


    // solhint-disable-next-line no-unused-vars
    function tokensReceived(address operator, address from, address to, uint amount, bytes userData, bytes operatorData) public {

    }
}