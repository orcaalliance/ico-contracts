pragma solidity 0.4.18;

import './zeppelin/Ownable.sol';

contract Migrations is Ownable {
  address public owner;
  uint public last_completed_migration;

  function Migrations() public {
    owner = msg.sender;
  }

  function setCompleted(uint completed) public onlyOwner() {
    last_completed_migration = completed;
  }

  function upgrade(address new_address)  public onlyOwner() {
    Migrations upgraded = Migrations(new_address);
    upgraded.setCompleted(last_completed_migration);
  }
}
