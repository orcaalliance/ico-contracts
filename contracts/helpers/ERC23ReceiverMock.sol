pragma solidity 0.4.18;


contract ERC23ReceiverMock {

    bool public isTokenReceiver;
    event TokenReceived(address _origin, uint _value, bytes _data, bool answer);

    function ERC23ReceiverMock(bool _isReceiver) public {
        isTokenReceiver = _isReceiver;
    }

    function () public payable {
    }

    function tokenFallback(address _origin, uint _value, bytes _data) public returns (bool ok){
        TokenReceived(_origin, _value, _data, isTokenReceiver);
        return isTokenReceiver;
    }

    function transferEth(address _to, uint _value) public returns (bool success) {
        require(_to != address(0));
        require(_value <= this.balance);

        _to.transfer(_value);
        return true;
    }
}
