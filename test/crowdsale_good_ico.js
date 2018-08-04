const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const OrcaCrowdsale = artifacts.require("TestOrcaCrowdsale");
const OrcaToken = artifacts.require("TestOrcaToken");
const Whitelist = artifacts.require("Whitelist");
const ERC777TokenScheduledTimelock = artifacts.require("ERC777TokenScheduledTimelock");

const START_DATE = 0;
const END_DATE = 1;
const BONUS = 4;
const MAX_PRIORITY_ID = 5;

contract('OrcaCrowdsale Good ICO, Token Hard Cap reached', async accounts => {
    const user1 = accounts[1];
    const user2 = accounts[2];
    const preSaleTokens = OneToken.mul(1000);
    let contract;
    let token;
    let whitelist;
    let tokenPrice;
    let walletBalance;
    let usdExchangeRate;
    let stage0;

    function ethToTokens(wei, bonus) {
        const usd = wei.mul(usdExchangeRate).div(1000);
        return usd.mul(bonus.add(100)).div(tokenPrice);
    }

    before(async () => {
        [token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
        contract = await OrcaCrowdsale.new(token.address, whitelist.address);
        [tokenPrice, usdExchangeRate] = await Promise.all([contract.getTokenPrice(), contract.exchangeRate()]);
        await token.transferOwnership(contract.address);
        await Promise.all([
            token.setNow(1),
            contract.initialize()
        ]);

        stage0 = await contract.stages(0);

        walletBalance = await web3.eth.getBalance(await contract.getWallet());
        await whitelist.addAddress(user1);
        await contract.setNow(stage0[START_DATE].add(1));
    });


    it('should sell tokens', async () => {
        (await contract.currentStage()).should.be.bignumber.equal(0);
        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(7600),
            gas: 200000
        });

        (await token.balanceOf(user1)).should.be.bignumber.equal(ethToTokens(OneEther.mul(7600), stage0[BONUS]).round());
    });

    it('have 7600 Ether on balance', async () => {
        const walletBalanceAfter = await web3.eth.getBalance(await contract.getWallet());

        (walletBalanceAfter.sub(walletBalance)).should.be.bignumber.equal(OneEther.mul(7600));
    });

    it('should set preSaleTokens', async () => {
        await contract.setPreSaleTokens(preSaleTokens);
        (await contract.preSaleTokens()).should.be.bignumber.equal(preSaleTokens);
    });

    it('should mint pre sale tokens', async () => {
        await contract.mintPreSaleTokens([user1], [await contract.preSaleTokens()], [Date.now() + 365 * 24 * 60 * 60]);
    });

    it('should mint many tokens', async () => {
        await contract.mintTokens([user1], [OneToken.mul(50000000)]);
    });

    it('should add stage', async () => {
        await contract.addStage(stage0[END_DATE].add(1), stage0[END_DATE].add(48 * 60 * 60), OneToken.mul(10000000), 10, stage0[MAX_PRIORITY_ID], 24 * 60 * 60);
    });

    it('should buy all tokens', async () => {
        const stage1 = await contract.stages(1);
        await contract.setNow(stage1[START_DATE].add(1));

        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(20000),
            gas: 300000
        });

        (await contract.icoTokensLeft()).should.be.bignumber.equal(0);
    });

    it('should successfully finalize successfull ICO before end', async () => {
        const stage1 = await contract.stages(1);

        await contract.setNow(stage1[END_DATE].sub(1));
        await contract.finalize().should.be.fulfilled;
    });

    it('should reject tx after finalize()', async () => {
        await contract.sendTransaction({
            from: user1,
            value: OneEther
        }).should.be.rejected;
    });

    it('should change token owner to crowdsale owner', async () => {
        (await token.owner()).should.be.equal(await contract.owner());
    });

    it('should finish minting', async () => {
        (await token.mintingFinished()).should.be.equal(true);
    });

    it('should correctly mint tokens to partners,advisors,...', async () => {
        const [
            partnerWallet,
            advisorsWallet,
            timelock
        ] =
        await Promise.all([
            contract.getPartnerWallet(),
            contract.getAdvisorsWallet(),
            contract.timelock()
        ]);

        const [partnerBalance, advisorsBalance, timelockBalance] = await Promise.all([
            token.balanceOf(partnerWallet),
            token.balanceOf(advisorsWallet),
            token.balanceOf(timelock)
        ]);

        (await contract.getPartnerTokens()).should.be.bignumber.equal(partnerBalance);
        (await contract.getAdvisorsTokens()).should.be.bignumber.equal(advisorsBalance);
        (await contract.getTeamTokens()).add(preSaleTokens).should.be.bignumber.equal(timelockBalance);
    });

	it('should correctly timelock tokens on finalize', async () => {
	    const timelock = await contract.timelock();
	    const timelockContract = ERC777TokenScheduledTimelock.at(timelock);

	    (await timelockContract.schedule(await contract.getTeamWallet(), 0))[0].should.be.bignumber.equal(await contract.getTeamTokenLockDate());
	});

    it('succeeds to transfer tokens after ICO end', async () => {
        const balanceBefore = await token.balanceOf(user2);
        await token.transfer(user2, OneToken, {
            from: user1
        }).should.be.fulfilled;
        const balanceAfter = await token.balanceOf(user2);
        (balanceAfter.sub(balanceBefore)).should.be.bignumber.equal(OneToken);
    });
});