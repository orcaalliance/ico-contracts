pragma solidity ^0.4.24;
import { ERC777TokensRecipient } from "./erc777/contracts/ERC777TokensRecipient.sol";
import "./erc777/contracts/ERC777Token.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { ERC820Implementer } from "./eip820/contracts/ERC820Implementer.sol";
import "./TokenRecoverable.sol";


contract CommunityLock is ERC777TokensRecipient, ERC820Implementer, TokenRecoverable {

    ERC777Token public token;

    constructor(address _token) public {
        setInterfaceImplementation("ERC777TokensRecipient", this);
        address tokenAddress = interfaceAddr(_token, "ERC777Token");
        require(tokenAddress != address(0));
        token = ERC777Token(tokenAddress);
    }

    function burn(uint256 _amount) public onlyOwner {
        require(_amount > 0);
        token.burn(_amount, '');
    }

    function tokensReceived(address, address, address, uint256, bytes, bytes) public {
        require(msg.sender == address(token));
    }
}