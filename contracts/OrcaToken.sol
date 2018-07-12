pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "eip820/contracts/ERC820Implementer.sol";
import "./erc777/contracts/ERC20Token.sol";
import "./erc777/contracts/ERC777Token.sol";
import "./erc777/contracts/ERC777TokensSender.sol";
import "./erc777/contracts/ERC777TokensRecipient.sol";
import "./TokenRecoverable.sol";


contract OrcaToken is TokenRecoverable, ERC20Token, ERC777Token, ERC820Implementer {
    using SafeMath for uint256;

    enum State { Minting, Trading, Burning }

    string private constant name_ = "ORCA Token";
    string private constant symbol_ = "ORCA";

    uint256 private constant granularity_ = 1;
    uint256 private totalSupply_;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => bool)) private authorized;
    mapping(address => mapping(address => uint256)) private allowed;

    State public state = State.Minting;
    bool private erc20compatible = true;
    bool public throwOnIncompatibleContract = true;

    event MintFinished();

    /// @notice Constructor to create a OrcaToken
    constructor() public {
        setInterfaceImplementation("ERC20Token", address(this));
        setInterfaceImplementation("ERC777Token", address(this));
    }

    modifier canMint() {
        require(state == State.Minting, "Not in 'Minting' state!");
      _;
    }

    modifier canTrade() {
        require(state == State.Trading || state == State.Burning, "Not in 'Trading' or 'Burning' state!");
        _;
    }

    modifier canBurn() {
        require(state == State.Burning, "Not in 'Burning' state!");
        _;
    }

    /* -- ERC777 Interface Implementation -- */
    //
    /// @return the name of the token
    function name() public view returns (string) { return name_; }

    /// @return the symbol of the token
    function symbol() public view returns(string) { return symbol_; }

    /// @return the granularity of the token
    function granularity() public view returns(uint256) { return granularity_; }

    /// @return the total supply of the token
    function totalSupply() public view returns(uint256) { return totalSupply_; }

    /// @notice Return the account balance of some account
    /// @param _tokenHolder Address for which the balance is returned
    /// @return the balance of `_tokenAddress`.
    function balanceOf(address _tokenHolder) public view returns (uint256) { return balances[_tokenHolder]; }

    /// @notice Send `_amount` of tokens to address `_to`
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    function send(address _to, uint256 _amount) public {
        doSend(msg.sender, _to, _amount, "", msg.sender, "", true);
    }

    /// @notice Send `_amount` of tokens to address `_to` passing `_userData` to the recipient
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    function send(address _to, uint256 _amount, bytes _userData) public {
        doSend(msg.sender, _to, _amount, _userData, msg.sender, "", true);
    }

    /// @notice Authorize a third party `_operator` to manage (send) `msg.sender`'s tokens.
    /// @param _operator The operator that wants to be Authorized
    function authorizeOperator(address _operator) public {
        require(_operator != msg.sender);
        authorized[_operator][msg.sender] = true;
        emit AuthorizedOperator(_operator, msg.sender);
    }

    /// @notice Revoke a third party `_operator`'s rights to manage (send) `msg.sender`'s tokens.
    /// @param _operator The operator that wants to be Revoked
    function revokeOperator(address _operator) public {
        require(_operator != msg.sender);
        authorized[_operator][msg.sender] = false;
        emit RevokedOperator(_operator, msg.sender);
    }

    /// @notice Check whether the `_operator` address is allowed to manage the tokens held by `_tokenHolder` address.
    /// @param _operator address to check if it has the right to manage the tokens
    /// @param _tokenHolder address which holds the tokens to be managed
    /// @return `true` if `_operator` is authorized for `_tokenHolder`
    function isOperatorFor(address _operator, address _tokenHolder) public view returns (bool) {
        return _operator == _tokenHolder || authorized[_operator][_tokenHolder];
    }

    /// @notice Send `_amount` of tokens on behalf of the address `from` to the address `to`.
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    /// @param _userData Data generated by the user to be sent to the recipient
    /// @param _operatorData Data generated by the operator to be sent to the recipient
    function operatorSend(address _from, address _to, uint256 _amount, bytes _userData, bytes _operatorData) public {
        require(isOperatorFor(msg.sender, _from));
        doSend(_from, _to, _amount, _userData, msg.sender, _operatorData, true);
    }

    /* -- Mint And Burn Functions (not part of the ERC777 standard, only the Events/tokensReceived are) -- */
    //
    /// @notice Generates `_amount` tokens to be assigned to `_tokenHolder`
    ///  Sample mint function to showcase the use of the `Minted` event and the logic to notify the recipient.
    /// @param _tokenHolder The address that will be assigned the new tokens
    /// @param _amount The quantity of tokens generated
    function mint(address _tokenHolder, uint256 _amount) public onlyOwner canMint {
        requireMultiple(_amount);
        totalSupply_ = totalSupply_.add(_amount);
        balances[_tokenHolder] = balances[_tokenHolder].add(_amount);

        callRecipient(msg.sender, 0x0, _tokenHolder, _amount, "", "", true);

        emit Minted(msg.sender, _tokenHolder, _amount, "");
        if (erc20compatible) { emit Transfer(0x0, _tokenHolder, _amount); }
    }

    /// @notice Burns `_amount` tokens from `_tokenHolder`
    ///  Sample burn function to showcase the use of the `Burned` event.
    /// @param _amount The quantity of tokens to burn
    function burn(uint256 _amount, bytes _userData, bytes _operatorData) public canBurn {
        requireMultiple(_amount);

        callSender(msg.sender, msg.sender, 0x0, _amount, _userData, _operatorData);

        require(balanceOf(msg.sender) >= _amount);

        balances[msg.sender] = balances[msg.sender].sub(_amount);
        totalSupply_ = totalSupply_.sub(_amount);

        emit Burned(msg.sender, msg.sender, _amount, _userData, _operatorData);
        if (erc20compatible) { emit Transfer(msg.sender, 0x0, _amount); }
    }

    /* -- ERC20 Compatible Methods -- */
    //
    /// @notice This modifier is applied to erc20 obsolete methods that are
    ///  implemented only to maintain backwards compatibility. When the erc20
    ///  compatibility is disabled, this methods will fail.
    modifier erc20 () {
        require(erc20compatible);
        _;
    }

    /// @notice Disables the ERC20 interface. This function can only be called
    ///  by the owner.
    function disableERC20() public onlyOwner {
        erc20compatible = false;
        setInterfaceImplementation("ERC20Token", 0x0);
    }

    /// @notice Re enables the ERC20 interface. This function can only be called
    ///  by the owner.
    function enableERC20() public onlyOwner {
        erc20compatible = true;
        setInterfaceImplementation("ERC20Token", this);
    }

    /// @notice For Backwards compatibility
    /// @return The decimls of the token. Forced to 18 in ERC777.
    function decimals() public erc20 view returns (uint8) { return uint8(18); }

    /// @notice ERC20 backwards compatible transfer.
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be transferred
    /// @return `true`, if the transfer can't be done, it should fail.
    function transfer(address _to, uint256 _amount) public erc20 returns (bool success) {
        doSend(msg.sender, _to, _amount, "", msg.sender, "", false);
        return true;
    }

    /// @notice ERC20 backwards compatible transferFrom.
    /// @param _from The address holding the tokens being transferred
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be transferred
    /// @return `true`, if the transfer can't be done, it should fail.
    function transferFrom(address _from, address _to, uint256 _amount) public erc20 returns (bool success) {
        require(_amount <= allowed[_from][msg.sender]);

        // Cannot be after doSend because of tokensReceived re-entry
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_amount);
        doSend(_from, _to, _amount, "", msg.sender, "", false);
        return true;
    }

    /// @notice ERC20 backwards compatible approve.
    ///  `msg.sender` approves `_spender` to spend `_amount` tokens on its behalf.
    /// @param _spender The address of the account able to transfer the tokens
    /// @param _amount The number of tokens to be approved for transfer
    /// @return `true`, if the approve can't be done, it should fail.
    function approve(address _spender, uint256 _amount) public erc20 returns (bool success) {
        allowed[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    /// @notice ERC20 backwards compatible allowance.
    ///  This function makes it easy to read the `allowed[]` map
    /// @param _owner The address of the account that owns the token
    /// @param _spender The address of the account able to transfer the tokens
    /// @return Amount of remaining tokens of _owner that _spender is allowed
    ///  to spend
    function allowance(address _owner, address _spender) public erc20 view returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    /**
     * @dev Function to stop minting new tokens.
     * @return True if the operation was successful.
     */
    function finishMinting() onlyOwner canMint public returns (bool) {
      state = State.Trading;
      emit MintFinished();
      return true;
    }

    function enableBurn(bool enable) onlyOwner public returns (bool) {
        require(state == State.Trading || state == State.Burning);
        state = (enable ? State.Burning : State.Trading);
    }

    function setThrowOnIncompatibleContract(bool _throwOnIncompatibleContract) onlyOwner public {
        throwOnIncompatibleContract = _throwOnIncompatibleContract;
    }

    /* -- Helper Functions -- */
    //
    /// @notice Internal function that ensures `_amount` is multiple of the granularity
    /// @param _amount The quantity that want's to be checked
    function requireMultiple(uint256 _amount) internal pure {
        require(_amount.div(granularity_).mul(granularity_) == _amount);
    }

    /// @notice Check whether an address is a regular address or not.
    /// @param _addr Address of the contract that has to be checked
    /// @return `true` if `_addr` is a regular address (not a contract)
    function isRegularAddress(address _addr) internal view returns (bool) {
        if (_addr == 0) { return false; }
        uint size;
        assembly { size := extcodesize(_addr) } // solhint-disable-line no-inline-assembly
        return size == 0;
    }

    /// @notice Helper function actually performing the sending of tokens.
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    /// @param _userData Data generated by the user to be passed to the recipient
    /// @param _operatorData Data generated by the operator to be passed to the recipient
    /// @param _preventLocking `true` if you want this function to throw when tokens are sent to a contract not
    ///  implementing `erc777_tokenHolder`.
    ///  ERC777 native Send functions MUST set this parameter to `true`, and backwards compatible ERC20 transfer
    ///  functions SHOULD set this parameter to `false`.
    function doSend(
        address _from,
        address _to,
        uint256 _amount,
        bytes _userData,
        address _operator,
        bytes _operatorData,
        bool _preventLocking
    )
        private
        canTrade
    {
        requireMultiple(_amount);

        callSender(_operator, _from, _to, _amount, _userData, _operatorData);

        require(_to != address(0));          // forbid sending to 0x0 (=burning)
        require(balances[_from] >= _amount); // ensure enough funds

        balances[_from] = balances[_from].sub(_amount);
        balances[_to] = balances[_to].add(_amount);

        callRecipient(_operator, _from, _to, _amount, _userData, _operatorData, _preventLocking);

        emit Sent(_operator, _from, _to, _amount, _userData, _operatorData);
        if (erc20compatible) { emit Transfer(_from, _to, _amount); }
    }

    /// @notice Helper function that checks for ERC777TokensRecipient on the recipient and calls it.
    ///  May throw according to `_preventLocking`
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The number of tokens to be sent
    /// @param _userData Data generated by the user to be passed to the recipient
    /// @param _operatorData Data generated by the operator to be passed to the recipient
    /// @param _preventLocking `true` if you want this function to throw when tokens are sent to a contract not
    ///  implementing `ERC777TokensRecipient`.
    ///  ERC777 native Send functions MUST set this parameter to `true`, and backwards compatible ERC20 transfer
    ///  functions SHOULD set this parameter to `false`.
    function callRecipient(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes _userData,
        bytes _operatorData,
        bool _preventLocking
    ) private {
        address recipientImplementation = interfaceAddr(_to, "ERC777TokensRecipient");
        if (recipientImplementation != 0) {
            ERC777TokensRecipient(recipientImplementation).tokensReceived(
                _operator, _from, _to, _amount, _userData, _operatorData);
        } else if (throwOnIncompatibleContract && _preventLocking) {
            require(isRegularAddress(_to));
        }
    }

    /// @notice Helper function that checks for ERC777TokensSender on the sender and calls it.
    ///  May throw according to `_preventLocking`
    /// @param _from The address holding the tokens being sent
    /// @param _to The address of the recipient
    /// @param _amount The amount of tokens to be sent
    /// @param _userData Data generated by the user to be passed to the recipient
    /// @param _operatorData Data generated by the operator to be passed to the recipient
    ///  implementing `ERC777TokensSender`.
    ///  ERC777 native Send functions MUST set this parameter to `true`, and backwards compatible ERC20 transfer
    ///  functions SHOULD set this parameter to `false`.
    function callSender(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes _userData,
        bytes _operatorData
    ) private {
        address senderImplementation = interfaceAddr(_from, "ERC777TokensSender");
        if (senderImplementation != 0) {
            ERC777TokensSender(senderImplementation).tokensToSend(
                _operator, _from, _to, _amount, _userData, _operatorData);
        }
    }
}
