pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";

contract ExchangeRateConsumer is Ownable {

    uint8 public constant EXCHANGE_RATE_DECIMALS = 3; // 3 digits precision for exchange rate

    uint256 public exchangeRate = 500000; // by default exchange rate is $500 with EXCHANGE_RATE_DECIMALS precision

    address public exchangeRateOracle;

    function setExchangeRateOracle(address _exchangeRateOracle) public onlyOwner {
        require(_exchangeRateOracle != address(0));
        exchangeRateOracle = _exchangeRateOracle;
    }

    function setExchangeRate(uint256 _exchangeRate) public {
        require(msg.sender == exchangeRateOracle || msg.sender == owner);
        require(_exchangeRate > 0);
        exchangeRate = _exchangeRate;
    }
}
