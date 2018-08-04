const BigNumber = web3.BigNumber;

require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const OrcaCrowdsale = artifacts.require("TestOrcaCrowdsale");
const OrcaToken = artifacts.require("TestOrcaToken");
const Whitelist = artifacts.require("TestWhitelist");

const START_DATE = 0;
const END_DATE = 1;
const BONUS = 4;
const MAX_PRIORITY_ID = 5;

contract('OrcaCrowdsale ICO', async accounts => {
	const user1 = accounts[1];
	let contract;
	let token;
	let whitelist;
	let tokenPrice;
	let stage0;
	let usdExchangeRate;

	function ethToTokens(wei, bonus) {
		const usd = wei.mul(usdExchangeRate).div(1000);
		return usd.mul(bonus.add(100)).div(tokenPrice);
	}

	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
		contract = await OrcaCrowdsale.new(token.address, whitelist.address);
		await token.transferOwnership(contract.address);
		await Promise.all([
			contract.setNow(0),
			contract.initialize()
		]);
		[stage0, tokenPrice, usdExchangeRate] = await Promise.all([
			contract.stages(0),
			contract.getTokenPrice(), 
			contract.exchangeRate()
		]);
	});

	it('should not accept funds before ICO start', async () => {
		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 200000
		}).should.be.rejected;
	});

	it('should not accept funds after startTime from non whitelisted addresses', async () => {
		await contract.setNow(stage0[START_DATE].add(1));

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

		(await token.balanceOf(user1)).should.be.bignumber.equal(ethToTokens(OneEther, stage0[BONUS]).floor());
	});

	it('should not accept payments from late users in first 24 hours after stage start', async () => {
		await whitelist.setNextUserId(stage0[MAX_PRIORITY_ID].add(1));

		await whitelist.addAddress(accounts[2]);

		await contract.sendTransaction({
			from: accounts[2],
			value: OneEther,
			gas: 200000
		}).should.be.rejected;
	});

	it('should accept payments from late users in after 48 hours after stage start', async () => {
		await contract.setNow(stage0[START_DATE].add(49 * 60 * 60)); // 49 hours

		await contract.sendTransaction({
			from: accounts[2],
			value: OneEther,
			gas: 200000
		}).should.be.fulfilled;

		(await token.balanceOf(accounts[2])).should.be.bignumber.above(0);
	});

	it('should add stage', async () => {
		await contract.addStage(stage0[END_DATE].add(1), stage0[END_DATE].add(48 * 60 * 60), OneToken.mul(1000), 0, stage0[MAX_PRIORITY_ID], 24 * 60 * 60);

		(await contract.getStageCount()).should.be.bignumber.equal(2);
	});

	it('should correctly pass from stage 0 to stage 1', async () => {
		await contract.setNow(stage0[END_DATE].add(2));

		(await contract.currentStage()).should.be.bignumber.equal(0);

		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(3),
			gas: 200000
		});

		(await contract.currentStage()).should.be.bignumber.equal(1);
	});

	it('should add two stages', async () => {
		const stage1 = await contract.stages(1);
		
		await contract.addStage(stage1[END_DATE].add(1), stage1[END_DATE].add(48 * 60 * 60), OneToken.mul(1000), 0, stage1[MAX_PRIORITY_ID], 24 * 60 * 60);

		const stage2 = await contract.stages(2);

		await contract.addStage(stage2[END_DATE].add(1), stage2[END_DATE].add(48 * 60 * 60), OneToken.mul(1000), 0, stage2[MAX_PRIORITY_ID], 24 * 60 * 60);

		(await contract.getStageCount()).should.be.bignumber.equal(4);
	});

	it('should correctly pass from stage 1 to stage 3', async () => {
		const stage2 = await contract.stages(2);

		await contract.setNow(stage2[END_DATE].add(1));

		(await contract.currentStage()).should.be.bignumber.equal(1);

		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(3),
			gas: 200000
		});

		(await contract.currentStage()).should.be.bignumber.equal(3);
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

	it('should add pre sale tokens', async () => {
		await contract.setPreSaleTokens(OneToken.mul(10));

		(await contract.preSaleTokens()).should.be.bignumber.equal(OneToken.mul(10));
	});

	it('should fail to finalize ICO without minting pre sale tokens', async () => {
		const stage1 = await contract.stages(1);
		await contract.setNow(stage1[END_DATE].add(1));
		await contract.finalize().should.be.rejected;
	});

	it('should mint pre sale tokens', async () => {
		const preSaleTokens = await contract.preSaleTokens();
		const receivers = [];
		const amounts = [];
		const locks = [];
		const now = await contract.getNowTest();

		for (let i = 0; i < 100; i++) {
			receivers.push(user1);
			amounts.push(preSaleTokens.div(100));
			locks.push(now.add(365 * 24 * 60 * 60));
		}
		await contract.mintPreSaleTokens(receivers, amounts, locks).should.be.fulfilled;
	});

	it('should successfully finalize ICO', async () => {
		const stage3 = await contract.stages(3);
		await contract.setNow(stage3[END_DATE].add(1));

		await contract.finalize().should.be.fulfilled;
	});
});