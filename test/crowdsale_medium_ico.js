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

contract('OrcaCrowdsale Medium ICO', async accounts => {
	const user1 = accounts[1];
	let contract;
	let token;
	let whitelist;
	let tokenPrice;
	let start;
	let end;
	let usdExchangeRate;
	let walletBalance;

	function ethToTokens(wei, bonus) {
		const usd = wei.mul(usdExchangeRate).div(1000);
		return usd.mul(bonus.add(100)).div(tokenPrice);
	}

	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
		contract = await OrcaCrowdsale.new(token.address, whitelist.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, tokenPrice, usdExchangeRate] = await Promise.all([contract.START_TIME(), contract.END_TIME(), contract.TOKEN_PRICE(), contract.exchangeRate()]);
		walletBalance = await web3.eth.getBalance(await contract.WALLET());
		await whitelist.addAddress(user1);
	});

	it('should always work', () => {});

	it('should not accept funds before ICO start', async () => {
		await contract.sendTransaction({
			from: user1,
			value: OneEther
		}).should.be.rejected;
	});

	it('should accept funds after startTime', async () => {
		await contract.setNow(start.add(1));

		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 200000
		});
		const bonus = await contract.getStageBonus(0);

		(await token.balanceOf(user1)).should.be.bignumber.equal(ethToTokens(OneEther, bonus).round());
	});

	it('should correctly pass from stage 0 to stage 1', async () => {
		const [balanceBefore, bonus] = await Promise.all([
			token.balanceOf(user1),
			contract.getStageBonus(0)
		]);;

		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(3800),
			gas: 200000
		});

		(await contract.currentStage()).should.be.bignumber.equal(1);

		const balanceAfter = await token.balanceOf(user1);
		(balanceAfter.sub(balanceBefore)).should.be.bignumber.equal(ethToTokens(OneEther.mul(3800), bonus).floor());
	});

	it('should correctly pass from stage 1 to stage 3', async () => {
		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(12000),
			gas: 200000
		});

		(await contract.currentStage()).should.be.bignumber.equal(2);
	});

	it('should have 15801 Ether on balance', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());
		(walletBalanceAfter.sub(walletBalance)).should.be.bignumber.equal(OneEther.mul(15801));
	});

	it('should mint pre sale tokens', async () => {
		await contract.mintPreSaleTokens([user1], [await contract.preSaleTokensLeft()], [Date.now() + 365 * 24 * 60 * 60]);
	});

	it('should not be able to Finalize ICO before end time', async () => {
		await contract.finalize().should.be.rejected;
	});

	it('should successfully finalize successfull ICO', async () => {
		const wallet = await contract.WALLET();

		await contract.setNow(end.add(1));
		await contract.finalize().should.be.fulfilled;

		const etherBalanceAfter = await web3.eth.getBalance(wallet);
		(web3.fromWei(etherBalanceAfter.sub(walletBalance)).toNumber()).should.be.closeTo(15801, 0.01);
	});

	it('should not be possible to get refund', async () => {
		await (contract.sendTransaction({
			from: user1,
			value: 0
		})).should.be.rejected;
	});

	it('should change token owner to token', async () => {
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
});