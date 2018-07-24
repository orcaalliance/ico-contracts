pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./OrcaToken.sol";
import "./Whitelist.sol";
import "./TokenRecoverable.sol";
import "./ERC777TokenScheduledTimelock.sol";
import "./ExchangeRateConsumer.sol";


contract OrcaCrowdsale is TokenRecoverable, ExchangeRateConsumer {
    using SafeMath for uint256;

    // Wallet where all ether will be stored
    address public constant WALLET = 0x1111111111111111111111111111111111111111;
    // Partner wallet
    address public constant PARTNER_WALLET = 0x2222222222222222222222222222222222222222;
    // Bounty wallet
    address public constant BOUNTY_WALLET = 0x3333333333333333333333333333333333333333;
    // Team wallet
    address public constant TEAM_WALLET = 0x4444444444444444444444444444444444444444;
    // Advisors wallet
    address public constant FOUNDERS_WALLET = 0x5555555555555555555555555555555555555555;

    uint256 public constant ICO_TOKENS = 276000000e18; // 276 000 000 tokens
    uint256 public constant PRE_SALE_TOKENS = 1e18; // Exact token amount will be set befor ICO start
    uint256 public constant START_TIME = 1523836800; // 2018/04/16 00:00 UTC
    uint256 public constant END_TIME = 1526428800; // 2018/05/16 00:00 UTC
    uint256 public constant TOKEN_PRICE = 6; // Token costs 0.06 USD
    uint256 public constant TEAM_TOKEN_LOCK_DATE = 1559347200; // 2019/06/01 00:00 UTC
    uint256 public constant FOUNDERS_TOKEN_LOCK_DATE = 1543622400; // 2018/12/01 00:00 UTC
    uint8 public constant ICO_PERCENT = 60;
    uint8 public constant PARTNER_PERCENT = 20;
    uint8 public constant BOUNTY_PERCENT = 3;
    uint8 public constant TEAM_PERCENT = 12;
    uint8 public constant FOUNDERS_PERCENT = 5;

    struct Stage {
        uint256 cap;
        uint64 bonus;
        uint64 maxPriorityId;
    }

    Stage[3] internal stages;

    // The token being sold
    OrcaToken public token;
    Whitelist public whitelist;
    ERC777TokenScheduledTimelock public timelock;

    // amount of raised money in USD
    uint256 public preSaleTokensLeft = PRE_SALE_TOKENS;

    uint256 public batchAllowTime = START_TIME.add(24 hours);

    address public tokenMinter;
    address public teamTokenTimelock;
    address public advisorsTokenTimelock;

    uint8 public currentStage = 0;
    bool public isFinalized = false;

    /**
    * event for token purchase logging
    * @param purchaser who paid for the tokens
    * @param beneficiary who got the tokens
    * @param weis paid for purchase
    * @param usd paid for purchase
    * @param amount amount of tokens purchased
    */
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 weis, uint256 usd, uint256 rate, uint256 amount);

    event Finalized();
    /**
     * When there no tokens left to mint and token minter tries to manually mint tokens
     * this event is raised to signal how many tokens we have to charge back to purchaser
     */
    event ManualTokenMintRequiresRefund(address indexed purchaser, uint256 value);

    constructor(address _token, address _whitelist) public {
        require(_token != address(0));
        require(_whitelist != address(0));
        stages[0] = Stage({ bonus: 35, cap: 30000000e18, maxPriorityId: 50 }); // 30 000 000 tokens
        stages[1] = Stage({ bonus: 30, cap: 40000000e18, maxPriorityId: 70 }); // 40 000 000 tokens
        stages[2] = Stage({ bonus: 0, cap: uint256(206000000e18).sub(PRE_SALE_TOKENS), maxPriorityId: ~uint64(0) });  // 206 000 000 tokens

        token = OrcaToken(_token);
        whitelist = Whitelist(_whitelist);
        timelock = new ERC777TokenScheduledTimelock(_token);
    }

    function () external payable {
        buyTokens(msg.sender);
    }

    function mintPreSaleTokens(address[] _receivers, uint256[] _amounts, uint256[] _lockPeroids) external {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(_receivers.length == _lockPeroids.length);
        require(!isFinalized);
        require(preSaleTokensLeft > 0);
        uint256 totalBatchTokens = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            totalBatchTokens = totalBatchTokens.add(_amounts[i]);
        }
        require(preSaleTokensLeft >= totalBatchTokens);

        preSaleTokensLeft = preSaleTokensLeft.sub(totalBatchTokens);
        token.mint(timelock, totalBatchTokens);

        address receiver;
        uint256 lockTill;
        uint256 timestamp = getNow();
        for (i = 0; i < _receivers.length; i++) {
            receiver = _receivers[i];
            require(receiver != address(0));

            lockTill = _lockPeroids[i];
            require(lockTill > timestamp);

            timelock.scheduleTimelock(receiver, _amounts[i], lockTill);
        }
    }

    function mintToken(address _receiver, uint256 _amount) external {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(!isFinalized);
        require(currentStage < stages.length);
        require(_receiver != address(0));
        require(_amount > 0);

        uint256 excessTokens = updateStageCap(_amount);

        token.mint(_receiver, _amount.sub(excessTokens));

        if (excessTokens > 0) {
            emit ManualTokenMintRequiresRefund(_receiver, excessTokens); // solhint-disable-line
        }
    }

    function mintTokens(address[] _receivers, uint256[] _amounts) external {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);
        require(currentStage < stages.length);

        address receiver;
        uint256 amount;
        uint256 excessTokens;

        for (uint256 i = 0; i < _receivers.length; i++) {
            receiver = _receivers[i];
            amount = _amounts[i];

            require(receiver != address(0));
            require(amount > 0);

            excessTokens = updateStageCap(amount);

            token.mint(receiver, amount.sub(excessTokens));

            if (excessTokens > 0) {
                emit ManualTokenMintRequiresRefund(receiver, excessTokens); // solhint-disable-line
            }
        }
    }

    function buyTokens(address _beneficiary) public payable {
        require(_beneficiary != address(0));
        validatePurchase();
        uint256 weiReceived = msg.value;
        uint256 usdReceived = weiToUsd(weiReceived);

        uint8 stageIndex = currentStage;
        uint256 tokens = usdToTokens(usdReceived, stageIndex);
        uint256 weiToReturn = 0;

        uint256 excessTokens = updateStageCap(tokens);

        if (excessTokens > 0) { // out of tokens
            uint256 usdToReturn = tokensToUsd(excessTokens, stageIndex);
            usdReceived = usdReceived.sub(usdToReturn);
            weiToReturn = weiToReturn.add(usdToWei(usdToReturn));
            weiReceived = weiReceived.sub(weiToReturn);
            tokens = tokens.sub(excessTokens);
        }

        token.mint(_beneficiary, tokens);

        WALLET.transfer(weiReceived);
        emit TokenPurchase(msg.sender, _beneficiary, weiReceived, usdReceived, exchangeRate, tokens); // solhint-disable-line
        if (weiToReturn > 0) {
            msg.sender.transfer(weiToReturn);
        }
    }

    /**
    * @dev Must be called after crowdsale ends, to do some extra finalization
    * work. Calls the contract's finalization function.
    */
    function finalize() public onlyOwner {
        require(!isFinalized);
        require(getNow() > END_TIME || token.totalSupply() == ICO_TOKENS);
        require(preSaleTokensLeft == 0);

        uint256 totalSupply = token.totalSupply();

        uint256 teamTokens =  uint256(TEAM_PERCENT).mul(totalSupply).div(ICO_PERCENT);
        uint256 foundersTokens =  uint256(FOUNDERS_PERCENT).mul(totalSupply).div(ICO_PERCENT);

        token.mint(PARTNER_WALLET, uint256(PARTNER_PERCENT).mul(totalSupply).div(ICO_PERCENT));
        token.mint(BOUNTY_WALLET, uint256(BOUNTY_PERCENT).mul(totalSupply).div(ICO_PERCENT));
        token.mint(timelock, teamTokens.add(foundersTokens));

        timelock.scheduleTimelock(TEAM_WALLET, teamTokens, TEAM_TOKEN_LOCK_DATE);
        timelock.scheduleTimelock(FOUNDERS_WALLET, foundersTokens, FOUNDERS_TOKEN_LOCK_DATE);

        token.finishMinting();
        token.transferOwnership(owner);

        emit Finalized(); // solhint-disable-line

        isFinalized = true;
    }

    function setTokenMinter(address _tokenMinter) public onlyOwner {
        require(_tokenMinter != address(0));
        tokenMinter = _tokenMinter;
    }

    function updateStageCap(uint256 _tokens) internal returns (uint256) {
        uint256 excessTokens = _tokens;
        while (excessTokens > 0 && currentStage < stages.length) {
            Stage storage stage = stages[currentStage];
            if (excessTokens < stage.cap) {
                stage.cap = stage.cap.sub(excessTokens);
                excessTokens = 0;
            } else {
                excessTokens = excessTokens.sub(stage.cap);
                stage.cap = 0;
                currentStage++;
                batchAllowTime = getNow().add(24 hours);
            }
        }
        return excessTokens;
    }

    function weiToUsd(uint256 _wei) internal view returns (uint256) {
        return _wei.mul(exchangeRate).div(10 ** uint256(EXCHANGE_RATE_DECIMALS));
    }

    function usdToWei(uint256 _usd) internal view returns (uint256) {
        return _usd.mul(10 ** uint256(EXCHANGE_RATE_DECIMALS)).div(exchangeRate);
    }

    function usdToTokens(uint256 _usd, uint8 _stage) internal view returns (uint256) {
        return _usd.mul(stages[_stage].bonus + 100).div(TOKEN_PRICE);
    }

    function tokensToUsd(uint256 _tokens, uint8 _stage) internal view returns (uint256) {
        return _tokens.mul(TOKEN_PRICE).div(stages[_stage].bonus + 100);
    }

    function validatePurchase() internal view {
        require(!isFinalized);
        require(msg.value != 0);
        require(currentStage < stages.length);
        require(getNow() >= START_TIME && getNow() <= END_TIME);
        require(token.totalSupply() < ICO_TOKENS);
        uint256 userId = whitelist.whitelist(msg.sender);
        require(userId > 0);
        if (batchAllowTime > getNow()) {
            require(stages[currentStage].maxPriorityId > userId);
        }
    }

    function getNow() internal view returns (uint256) {
        return now; // solhint-disable-line
    }
}