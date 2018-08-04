pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./eip820/contracts/ERC820Implementer.sol";
import "./erc777/contracts/ERC20Token.sol";
import "./erc777/contracts/ERC777ERC20BaseToken.sol";
import "./erc777/contracts/ERC777TokensSender.sol";
import "./erc777/contracts/ERC777TokensRecipient.sol";
import "./TokenRecoverable.sol";


contract OrcaToken is TokenRecoverable, ERC777ERC20BaseToken {
    using SafeMath for uint256;

    string private constant name_ = "ORCA Token";
    string private constant symbol_ = "ORCA";
    uint256 private constant granularity_ = 1;

    bool public throwOnIncompatibleContract = true;
    bool public burnEnabled = false;
    bool public mintingFinished = false;

    address public communityLock = address(0);

    event MintFinished();

    /// @notice Constructor to create a OrcaToken
    constructor() public ERC777ERC20BaseToken(name_, symbol_, granularity_, new address[](0)) {
        setInterfaceImplementation("ERC20Token", address(this));
        setInterfaceImplementation("ERC777Token", address(this));
    }

    modifier canMint() {
        require(!mintingFinished);
      _;
    }

    modifier canTrade() {
        require(mintingFinished);
        _;
    }

    modifier canBurn() {
        require(burnEnabled || msg.sender == communityLock);
        _;
    }

    /// @notice Disables the ERC20 interface. This function can only be called
    ///  by the owner.
    function disableERC20() public onlyOwner {
        mErc20compatible = false;
        setInterfaceImplementation("ERC20Token", 0x0);
    }

    /// @notice Re enables the ERC20 interface. This function can only be called
    ///  by the owner.
    function enableERC20() public onlyOwner {
        mErc20compatible = true;
        setInterfaceImplementation("ERC20Token", this);
    }

    function send(address _to, uint256 _amount, bytes _userData) public canTrade {
        super.send(_to, _amount, _userData);
    }

    function operatorSend(address _from, address _to, uint256 _amount, bytes _userData, bytes _operatorData) public canTrade {
        super.operatorSend(_from, _to, _amount, _userData, _operatorData);
    }

    function transfer(address _to, uint256 _amount) public erc20 canTrade returns (bool success) {
        return super.transfer(_to, _amount);
    }

    function transferFrom(address _from, address _to, uint256 _amount) public erc20 canTrade returns (bool success) {
        return super.transferFrom(_from, _to, _amount);
    }

    /* -- Mint And Burn Functions (not part of the ERC777 standard, only the Events/tokensReceived call are) -- */
    //
    /// @notice Generates `_amount` tokens to be assigned to `_tokenHolder`
    ///  Sample mint function to showcase the use of the `Minted` event and the logic to notify the recipient.
    /// @param _tokenHolder The address that will be assigned the new tokens
    /// @param _amount The quantity of tokens generated
    /// @param _operatorData Data that will be passed to the recipient as a first transfer
    function mint(address _tokenHolder, uint256 _amount, bytes _operatorData) public onlyOwner canMint {
        requireMultiple(_amount);
        mTotalSupply = mTotalSupply.add(_amount);
        mBalances[_tokenHolder] = mBalances[_tokenHolder].add(_amount);

        callRecipient(msg.sender, 0x0, _tokenHolder, _amount, "", _operatorData, true);

        emit Minted(msg.sender, _tokenHolder, _amount, _operatorData);
        if (mErc20compatible) { emit Transfer(0x0, _tokenHolder, _amount); }
    }

    /// @notice Burns `_amount` tokens from `_tokenHolder`
    ///  Sample burn function to showcase the use of the `Burned` event.
    /// @param _amount The quantity of tokens to burn
    function burn(uint256 _amount, bytes _holderData) public canBurn {
        super.burn(_amount, _holderData);
    }

    /**
     * @dev Function to stop minting new tokens.
     * @return True if the operation was successful.
     */
    function finishMinting() public onlyOwner canMint {
        mintingFinished = true;
        emit MintFinished();
    }

    function setThrowOnIncompatibleContract(bool _throwOnIncompatibleContract) public onlyOwner {
        throwOnIncompatibleContract = _throwOnIncompatibleContract;
    }

    function setCommunityLock(address _communityLock) public onlyOwner {
        require(_communityLock != address(0));
        communityLock = _communityLock;
    }

    function permitBurning(bool _enable) public onlyOwner {
        burnEnabled = _enable;
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
    ) internal {
        address recipientImplementation = interfaceAddr(_to, "ERC777TokensRecipient");
        if (recipientImplementation != 0) {
            ERC777TokensRecipient(recipientImplementation).tokensReceived(
                _operator, _from, _to, _amount, _userData, _operatorData);
        } else if (throwOnIncompatibleContract && _preventLocking) {
            require(isRegularAddress(_to));
        }
    }
}
