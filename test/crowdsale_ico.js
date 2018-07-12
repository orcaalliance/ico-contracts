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

contract('OrcaCrowdsale ICO', async accounts => {
	const user1 = accounts[1];
	let contract;
	let token;
	let whitelist;
	let tokenPrice;
	let start;
	let end;
	let usdExchangeRate;

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
	});

	it('should not accept funds before ICO start', async () => {
		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 200000
		}).should.be.rejected;
	});

	it('should not accept funds after startTime from non whitelisted addresses', async () => {
		await contract.setNow(start.add(1));

		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 200000
		}).should.be.rejected;
	});

	it('should accept funds after startTime from whitelisted addresses', async () => {
		await whitelist.addAddress(user1);

		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 200000
		});

		const bonus = await contract.getStageBonus(0);
		const balance = await token.balanceOf(user1);
		balance.should.be.bignumber.equal(ethToTokens(OneEther, bonus).floor());
	});

	it('should not accept payments from late users in first 24 hours after crowdsale start', async() => {
		await whitelist.addAddresses(accounts.slice(2, 53));

		await contract.sendTransaction({
			from: accounts[52],
			value: OneEther,
			gas: 200000
		}).should.be.rejected;
	});

	it('should accept payments from late users in after 24 hours after crowdsale start', async () => {
		await contract.setNow(start.add(86400 + 1)); // 1 day + 1 second

		await contract.sendTransaction({
			from: accounts[52],
			value: OneEther,
			gas: 200000
		}).should.be.fulfilled;

		(await token.balanceOf(accounts[52])).should.be.bignumber.above(0);
	});

	it('should correctly pass from stage 0 to stage 1', async () => {
		const balanceBefore = await token.balanceOf(user1);

		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(3800),
			gas: 200000
		});

		(await contract.currentStage()).should.be.bignumber.equal(1);

		const [bonus, balanceAfter] = await Promise.all([contract.getStageBonus(0), token.balanceOf(user1)]);

		(balanceAfter.minus(balanceBefore)).should.be.bignumber.equal(ethToTokens(OneEther.mul(3800), bonus).floor());
	});

	it('should not accept payments from late users in first 24 hours after stage change', async () => {
		await whitelist.addAddresses(accounts.slice(53, 104));

		await contract.sendTransaction({
			from: accounts[103],
			value: OneEther.mul(3.33),
			gas: 200000
		}).should.be.rejected;
	});

	it('should accept payments from late users in after 24 hours after stage change', async () => {
		await contract.setNow((await contract.getNowTest()).add(86400 + 1)); // 1 day + 1 second

		await contract.sendTransaction({
			from: accounts[103],
			value: OneEther.mul(3.33),
			gas: 200000
		}).should.be.fulfilled;

		(await token.balanceOf(accounts[103])).should.be.bignumber.above(0);
	});

	it('should not be able to finalize ICO before end time', async () => {
		await contract.finalize().should.be.rejected;
	});

	it('should fail to finalize ICO without minting pre sale tokens', async () => {
		await contract.setNow(end.add(1));
		await contract.finalize().should.be.rejected;
	});

	it('should mint pre sale tokens', async () => {
		const preSaleTokensLeft = await contract.preSaleTokensLeft();
		const receivers = [];
		const amounts = [];
		const locks = [];
		const now = await contract.getNowTest();

		for (let i = 0; i < 100; i++) {
			receivers.push(user1);
			amounts.push(preSaleTokensLeft.div(100));
			locks.push(now.add(365 * 24 * 60 * 60));
		}
		await contract.mintPreSaleTokens(receivers, amounts, locks).should.be.fulfilled;
	});

	it('should successfully finalize ICO', async () => {
		const totalSupply = await token.totalSupply();
		const expectedTotalSupply = totalSupply.mul(100).div(60).floor(); // 40% above sold tokens goes to bounty, reserve, team and advisors
		await contract.finalize().should.be.fulfilled;

		(await token.totalSupply()).should.be.bignumber.equal(expectedTotalSupply);
	});
});