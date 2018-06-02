pragma solidity 0.4.18;

import './zeppelin/SafeMath.sol';
import './zeppelin/Ownable.sol';
import './zeppelin/StandardToken.sol';
import './interface/iERC223Receiver.sol';
import './interface/iERC223Token.sol';


contract FreezableToken is iERC223Token, StandardToken, Ownable {

    event ContractTransfer(address indexed _from, address indexed _to, uint _value, bytes _data);

    bool public freezed;

    modifier canTransfer(address _transferer) {
        require(owner == _transferer || !freezed);
        _;
    }

    function FreezableToken() public {
        freezed = true;
    }

    function transfer(address _to, uint _value, bytes _data) canTransfer(msg.sender)
        public
        canTransfer(msg.sender)
        returns (bool success) {
        //filtering if the target is a contract with bytecode inside it
        require(super.transfer(_to, _value)); // do a normal token transfer
        if (isContract(_to)) {
            require(contractFallback(msg.sender, _to, _value, _data));
        }
        return true;
    }

    function transferFrom(address _from, address _to, uint _value, bytes _data) public canTransfer(msg.sender) returns (bool success) {
        require(super.transferFrom(_from, _to, _value)); // do a normal token transfer
        if (isContract(_to)) {
            require(contractFallback(_from, _to, _value, _data));
        }
        return true;
    }

    function transfer(address _to, uint _value) canTransfer(msg.sender) public canTransfer(msg.sender) returns (bool success) {
        return transfer(_to, _value, new bytes(0));
    }

    function transferFrom(address _from, address _to, uint _value) public canTransfer(msg.sender) returns (bool success) {
        return transferFrom(_from, _to, _value, new bytes(0));
    }

    //function that is called when transaction target is a contract
    function contractFallback(address _origin, address _to, uint _value, bytes _data) private returns (bool) {
        ContractTransfer(_origin, _to, _value, _data);
        ERC223Receiver reciever = ERC223Receiver(_to);
        require(reciever.tokenFallback(_origin, _value, _data));
        return true;
    }

    //assemble the given address bytecode. If bytecode exists then the _addr is a contract.
    function isContract(address _addr) private view returns (bool is_contract) {
        uint length;
        assembly { length := extcodesize(_addr) }
        return length > 0;
    }

    function unfreeze() public onlyOwner returns (bool){
        freezed = false;
        return true;
    }
}