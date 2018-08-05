pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./OrcaToken.sol";
import "./Whitelist.sol";
import "./TokenRecoverable.sol";
import "./ERC777TokenScheduledTimelock.sol";
import "./ExchangeRateConsumer.sol";
import "./CommunityLock.sol";
import "./Debuggable.sol";


contract OrcaCrowdsale is TokenRecoverable, ExchangeRateConsumer, Debuggable {
    using SafeMath for uint256;

    // Wallet where all ether will be stored
    address internal constant WALLET = 0x0909Fb46D48eea996197573415446A26c001994a;
    // Partner wallet
    address internal constant PARTNER_WALLET = 0x2222222222222222222222222222222222222222;
    // Team wallet
    address internal constant TEAM_WALLET = 0x3333333333333333333333333333333333333333;
    // Advisors wallet
    address internal constant ADVISORS_WALLET = 0x4444444444444444444444444444444444444444;

    uint256 internal constant TEAM_TOKENS = 58200000e18;      // 58 200 000 tokens
    uint256 internal constant ADVISORS_TOKENS = 20000000e18;  // 20 000 000 tokens
    uint256 internal constant PARTNER_TOKENS = 82800000e18;   // 82 800 000 tokens
    uint256 internal constant COMMUNITY_TOKENS = 92000000e18; // 92 000 000 tokens

    uint256 internal constant TOKEN_PRICE = 6; // Token costs 0.06 USD
    uint256 internal constant TEAM_TOKEN_LOCK_DATE = 1565049600; // 2019/08/06 00:00 UTC

    struct Stage {
        uint256 startDate;
        uint256 endDate;
        uint256 priorityDate; // allow priority users to purchase tokens until this date
        uint256 cap;
        uint64 bonus;
        uint64 maxPriorityId;
    }

    uint256 public icoTokensLeft = 193200000e18;   // 193 200 000 tokens for ICO
    uint256 public bountyTokensLeft = 13800000e18; // 13 800 000 bounty tokens
    uint256 public preSaleTokens = 0;

    Stage[] public stages;

    // The token being sold
    OrcaToken public token;
    Whitelist public whitelist;
    ERC777TokenScheduledTimelock public timelock;
    CommunityLock public communityLock;

    mapping(address => uint256) public bountyBalances;

    address public tokenMinter;

    uint8 public currentStage = 0;
    bool public initialized = false;
    bool public isFinalized = false;
    bool public isPreSaleTokenSet = false;

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

    modifier onlyInitialized() {
        require(initialized);
        _;
    }

    constructor(address _token, address _whitelist) public {
        require(_token != address(0));
        require(_whitelist != address(0));

        uint256 stageCap = 30000000e18; // 30 000 000 tokens

        stages.push(Stage({
            startDate: 1533546000, // 6th of August, 9:00 UTC
            endDate: 1534064400, // 12th of August, 9:00 UTC
            cap: stageCap,
            bonus: 20,
            maxPriorityId: 5000,
            priorityDate: uint256(1533546000).add(48 hours) // 6th of August, 9:00 UTC + 48 hours
        }));

        icoTokensLeft = icoTokensLeft.sub(stageCap);

        token = OrcaToken(_token);
        whitelist = Whitelist(_whitelist);
        timelock = new ERC777TokenScheduledTimelock(_token);
    }

    function initialize() public onlyOwner {
        require(!initialized);

        token.mint(timelock, TEAM_TOKENS, '');
        timelock.scheduleTimelock(TEAM_WALLET, TEAM_TOKENS, TEAM_TOKEN_LOCK_DATE);

        token.mint(ADVISORS_WALLET, ADVISORS_TOKENS, '');
        token.mint(PARTNER_WALLET, PARTNER_TOKENS, '');

        communityLock = new CommunityLock(token);
        token.mint(communityLock, COMMUNITY_TOKENS, '');

        initialized = true;
    }

    function () external payable {
        buyTokens(msg.sender);
    }

    function mintPreSaleTokens(address[] _receivers, uint256[] _amounts, uint256[] _lockPeroids) external onlyInitialized {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(_receivers.length == _lockPeroids.length);
        require(!isFinalized);
        uint256 tokensInBatch = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            tokensInBatch = tokensInBatch.add(_amounts[i]);
        }
        require(preSaleTokens >= tokensInBatch);

        preSaleTokens = preSaleTokens.sub(tokensInBatch);
        token.mint(timelock, tokensInBatch, '');

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

    function mintToken(address _receiver, uint256 _amount) external onlyInitialized {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(!isFinalized);
        require(_receiver != address(0));
        require(_amount > 0);

        ensureCurrentStage();

        uint256 excessTokens = updateStageCap(_amount);

        token.mint(_receiver, _amount.sub(excessTokens), '');

        if (excessTokens > 0) {
            emit ManualTokenMintRequiresRefund(_receiver, excessTokens); // solhint-disable-line
        }
    }

    function mintTokens(address[] _receivers, uint256[] _amounts) external onlyInitialized {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);

        ensureCurrentStage();

        address receiver;
        uint256 amount;
        uint256 excessTokens;

        for (uint256 i = 0; i < _receivers.length; i++) {
            receiver = _receivers[i];
            amount = _amounts[i];

            require(receiver != address(0));
            require(amount > 0);

            excessTokens = updateStageCap(amount);

            uint256 tokens = amount.sub(excessTokens);

            token.mint(receiver, tokens, '');

            if (excessTokens > 0) {
                emit ManualTokenMintRequiresRefund(receiver, excessTokens); // solhint-disable-line
            }
        }
    }

    function mintBounty(address[] _receivers, uint256[] _amounts) external onlyInitialized {
        require(msg.sender == tokenMinter || msg.sender == owner);
        require(_receivers.length > 0 && _receivers.length <= 100);
        require(_receivers.length == _amounts.length);
        require(!isFinalized);
        require(bountyTokensLeft > 0);

        uint256 tokensLeft = bountyTokensLeft;
        address receiver;
        uint256 amount;
        for (uint256 i = 0; i < _receivers.length; i++) {
            receiver = _receivers[i];
            amount = _amounts[i];

            require(receiver != address(0));
            require(amount > 0);

            tokensLeft = tokensLeft.sub(amount);
            bountyBalances[receiver] = bountyBalances[receiver].add(amount);
        }

        bountyTokensLeft = tokensLeft;
    }

    function buyTokens(address _beneficiary) public payable onlyInitialized {
        require(_beneficiary != address(0));
        ensureCurrentStage();
        validatePurchase();
        uint256 weiReceived = msg.value;
        uint256 usdReceived = weiToUsd(weiReceived);

        uint8 stageIndex = currentStage;

        uint256 tokens = usdToTokens(usdReceived, stageIndex);
        uint256 weiToReturn = 0;

        uint256 excessTokens = updateStageCap(tokens);

        if (excessTokens > 0) {
            uint256 usdToReturn = tokensToUsd(excessTokens, stageIndex);
            usdReceived = usdReceived.sub(usdToReturn);
            weiToReturn = weiToReturn.add(usdToWei(usdToReturn));
            weiReceived = weiReceived.sub(weiToReturn);
            tokens = tokens.sub(excessTokens);
        }

        token.mint(_beneficiary, tokens, '');

        WALLET.transfer(weiReceived);
        emit TokenPurchase(msg.sender, _beneficiary, weiReceived, usdReceived, exchangeRate, tokens); // solhint-disable-line
        if (weiToReturn > 0) {
            msg.sender.transfer(weiToReturn);
        }
    }

    function ensureCurrentStage() internal {
        uint256 currentTime = getNow();
        uint256 stageCount = stages.length;

        uint8 curStage = currentStage;
        uint8 nextStage = curStage + 1;

        while (nextStage < stageCount && stages[nextStage].startDate <= currentTime) {
            stages[nextStage].cap = stages[nextStage].cap.add(stages[curStage].cap);
            curStage = nextStage;
            nextStage = nextStage + 1;
        }
        if (currentStage != curStage) {
            currentStage = curStage;
        }
    }

    /**
    * @dev Must be called after crowdsale ends, to do some extra finalization
    * work. Calls the contract's finalization function.
    */
    function finalize() public onlyOwner onlyInitialized {
        require(!isFinalized);
        require(preSaleTokens == 0);
        Stage storage lastStage = stages[stages.length - 1];
        require(getNow() >= lastStage.endDate || (lastStage.cap == 0 && icoTokensLeft == 0));

        token.finishMinting();
        token.transferOwnership(owner);
        communityLock.transferOwnership(owner); // only in finalize just to be sure that it is the same owner as crowdsale

        emit Finalized(); // solhint-disable-line

        isFinalized = true;
    }

    function setTokenMinter(address _tokenMinter) public onlyOwner onlyInitialized {
        require(_tokenMinter != address(0));
        tokenMinter = _tokenMinter;
    }

    function claimBounty(address beneficiary) public onlyInitialized {
        uint256 balance = bountyBalances[beneficiary];
        require(balance > 0);
        bountyBalances[beneficiary] = 0;

        token.mint(beneficiary, balance, '');
    }

    /// @notice Updates current stage cap and returns amount of excess tokens if ICO does not have enough tokens
    function updateStageCap(uint256 _tokens) internal returns (uint256) {
        Stage storage stage = stages[currentStage];
        uint256 cap = stage.cap;
        // normal situation, early exit
        if (cap >= _tokens) {
            stage.cap = cap.sub(_tokens);
            return 0;
        }

        stage.cap = 0;
        uint256 excessTokens = _tokens.sub(cap);
        if (icoTokensLeft >= excessTokens) {
            icoTokensLeft = icoTokensLeft.sub(excessTokens);
            return 0;
        }
        icoTokensLeft = 0;
        return excessTokens.sub(icoTokensLeft);
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

    function addStage(uint256 startDate, uint256 endDate, uint256 cap, uint64 bonus, uint64 maxPriorityId, uint256 priorityTime) public onlyOwner onlyInitialized {
        require(!isFinalized);
        require(startDate > getNow());
        require(endDate > startDate);
        Stage storage lastStage = stages[stages.length - 1];
        require(startDate > lastStage.endDate);
        require(startDate.add(priorityTime) <= endDate);
        require(icoTokensLeft >= cap);
        require(maxPriorityId >= lastStage.maxPriorityId);

        stages.push(Stage({
            startDate: startDate,
            endDate: endDate,
            cap: cap,
            bonus: bonus,
            maxPriorityId: maxPriorityId,
            priorityDate: startDate.add(priorityTime)
        }));
    }

    function validatePurchase() internal view {
        require(!isFinalized);
        require(msg.value != 0);

        require(currentStage < stages.length);
        Stage storage stage = stages[currentStage];
        require(stage.cap > 0);

        uint256 currentTime = getNow();
        require(stage.startDate <= currentTime && currentTime <= stage.endDate);

        uint256 userId = whitelist.whitelist(msg.sender);
        require(userId > 0);
        if (stage.priorityDate > currentTime) {
            require(userId < stage.maxPriorityId);
        }
    }

    function setPreSaleTokens(uint256 amount) public onlyOwner onlyInitialized {
        require(!isPreSaleTokenSet);
        require(amount > 0);
        preSaleTokens = amount;
        isPreSaleTokenSet = true;
    }

    function getStageCount() public view returns (uint256) {
        return stages.length;
    }

    function getNow() internal view returns (uint256) {
        return now; // solhint-disable-line
    }
}