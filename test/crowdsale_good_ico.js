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

contract('OrcaCrowdsale Good ICO, Token Hard Cap reached', async accounts => {
    const user1 = accounts[1];
    const user2 = accounts[2];
    let contract;
    let token;
    let whitelist;
    let tokenPrice;
    let start;
    let end;
    let walletBalance;

    function ethToTokens(wei, bonus) {
        const usd = wei.mul(usdExchangeRate).div(1000);
        return usd.mul(bonus.add(100)).div(tokenPrice);
    }

    before(async () => {
        [token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
        contract = await OrcaCrowdsale.new(token.address, whitelist.address);
        await token.transferOwnership(contract.address);
        await token.setNow(1);
        [start, end, tokenPrice, usdExchangeRate] = await Promise.all([contract.START_TIME(), contract.END_TIME(), contract.TOKEN_PRICE(), contract.exchangeRate()]);
        walletBalance = await web3.eth.getBalance(await contract.WALLET());
        await whitelist.addAddress(user1);
        await contract.setNow(start.add(1));
    });

    it('should always work', () => {});

    it('should pass from stage 0 to stage 2', async () => {
        const balanceBefore = token.balanceOf(user1);

        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(7600),
            gas: 200000
        });

        (await contract.currentStage()).should.be.bignumber.equal(2);
    });

    it('have 7600 Ether on balance', async () => {
        const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());

        (walletBalanceAfter.sub(walletBalance)).should.be.bignumber.equal(OneEther.mul(7600));
    });

    it('should mint pre sale tokens', async () => {
        await contract.mintPreSaleTokens([user1], [await contract.preSaleTokensLeft()], [Date.now() + 365 * 24 * 60 * 60]);
    });

    it('should mint and send ether until token cap', async () => {
        await contract.mintTokens([user1], [OneToken.mul(50000000)]);

        await contract.sendTransaction({
            from: user1,
            value: OneEther.mul(20000),
            gas: 300000
        });

        const totalSupply = await token.totalSupply();
        (await contract.ICO_TOKENS()).should.be.bignumber.equal(totalSupply);
    });

    it('should successfully finalize successfull ICO before end', async () => {
        await contract.setNow(end.sub(1));
        await contract.finalize().should.be.fulfilled;
    });

    it('should reject tx after finalize()', async () => {
        await contract.sendTransaction({
            from: user1,
            value: 0
        }).should.be.rejected;
    });

    it('should change token owner to crowdsale owner', async () => {
        (await token.owner()).should.be.equal(await contract.owner());
    });

    it('should finish minting', async () => {
        (await token.state()).should.be.bignumber.equal(1); // Trading
    });

    it('should correctly mint tokens on finalize', async () => {
        const [
            soldTokens,
            icoTokens,
            totalSupply,
            icoPercent,
            partnerPercent,
            bountyPercent,
            teamPercent,
            advisorsPercent,
            partnerWallet,
            bountyWallet,
            timelock,
            preSaleTokens
        ] =
        await Promise.all([
            token.balanceOf(user1),
            contract.ICO_TOKENS(),
            token.totalSupply(),
            contract.ICO_PERCENT(),
            contract.PARTNER_PERCENT(),
            contract.BOUNTY_PERCENT(),
            contract.TEAM_PERCENT(),
            contract.FOUNDERS_PERCENT(),
            contract.PARTNER_WALLET(),
            contract.BOUNTY_WALLET(),
            contract.timelock(),
            contract.PRE_SALE_TOKENS()
        ]);

        const [partnerBalance, bountyBalance, timelockBalance] = await Promise.all([
            token.balanceOf(partnerWallet),
            token.balanceOf(bountyWallet),
            token.balanceOf(timelock)
        ]);

        (await token.balanceOf(await contract.TEAM_WALLET())).should.be.bignumber.equal(0);
        (await token.balanceOf(await contract.FOUNDERS_WALLET())).should.be.bignumber.equal(0);

        const totalSold = soldTokens.add(preSaleTokens);

        const expectedPartnerTokens = totalSold.mul(partnerPercent).div(icoPercent).floor();
        partnerBalance.should.be.bignumber.equal(expectedPartnerTokens);
        const expectedBountyTokens = totalSold.mul(bountyPercent).div(icoPercent).floor();
        bountyBalance.should.be.bignumber.equal(expectedBountyTokens);
        const expectedTimelockTokens = totalSold.mul(teamPercent.add(advisorsPercent)).div(icoPercent).floor();
        timelockBalance.should.be.bignumber.equal(expectedTimelockTokens.add(preSaleTokens));
    });

	it('should correctly timelock tokens on finalize', async () => {
	    const timelock = await contract.timelock();
	    const timelockContract = ERC777TokenScheduledTimelock.at(timelock);

	    (await timelockContract.schedule(await contract.TEAM_WALLET(), 0))[0].should.be.bignumber.equal(await contract.TEAM_TOKEN_LOCK_DATE());
	    (await timelockContract.schedule(await contract.FOUNDERS_WALLET(), 0))[0].should.be.bignumber.equal(await contract.FOUNDERS_TOKEN_LOCK_DATE());
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