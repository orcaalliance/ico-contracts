const BigNumber = web3.BigNumber;

require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const OrcaCrowdsale = artifacts.require("OrcaCrowdsale");
const OrcaToken = artifacts.require("OrcaToken");
const TestOrcaCrowdsale = artifacts.require("TestOrcaCrowdsale");
const Whitelist = artifacts.require("Whitelist");
const OrcaBounties = artifacts.require("OrcaBounties");

const END_DATE = 1;
const MAX_PRIORITY_ID = 5;

contract('OrcaCrowdsale', async accounts => {
	const admin = accounts[0];
	const user1 = accounts[1];
	const user2 = accounts[2];
	let contract;
	let token;
	let bounties;
	before(async () => {
		contract = await OrcaCrowdsale.deployed();
		token = await OrcaToken.at(await contract.token());
		bounties = await OrcaBounties.deployed();

		stage0 = await contract.stages(0);
	});

	it('set crowdsale contract as OrcaToken owner', async () => {
		(await token.owner()).should.be.equal(contract.address);
	});

	it('should have one stage', async () => {
		(await contract.getStageCount()).should.be.bignumber.equal(1);
	});

	it('starts from zero stage', async () => {
		(await contract.currentStage()).should.be.bignumber.equal(0);
	});

	it('token minter is owner', async () => {
		await contract.mintTokens([user1], [OneToken]);
		(await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
	});

	it('fails to manually mint to 0x0 address', async () => {
		await contract.mintTokens([0], [OneToken]).should.be.rejected;
	});

	it('fails to manually mint 0 amount', async () => {
		await contract.mintTokens([user1], [0]).should.be.rejected;
	});

	it('sets token minter', async () => {
		await contract.setTokenMinter(user1);
	});

	it('fails to set 0x0 address as token minter', async () => {
		await contract.setTokenMinter(0).should.be.rejected;
	});

	it('fails to manually mint from other account', async () => {
		await contract.mintTokens([user2], [OneToken], {
			from: user2
		}).should.be.rejected;
	});

	it('token minter can manually mint', async () => {
		await contract.mintTokens([user2], [OneToken], {
			from: user1
		});
		(await token.balanceOf(user2)).should.be.bignumber.equal(OneToken);
	});

	it('owner can manually mint', async () => {
		await contract.mintTokens([user2], [OneToken], {
			from: admin
		});
		(await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(2));
	});

	it('fails to transfer tokens before ICO end', async () => {
		await token.transfer(user1, OneToken, {
			from: user2
		}).should.be.rejected;
	});

	it('fails to send tokens before ICO end', async () => {
		await token.send(user1, OneToken, '', {
			from: user2
		}).should.be.rejected;
	});

	it('mints to many addresses', async () => {
		await contract.mintTokens([user1, user2], [OneToken, OneToken], {
			from: user1
		});

		(await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(2));
		(await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(3));
	});

	it('fails to mint to many addresses when array size unequal 1', async () => {
		await contract.mintTokens([user1], [OneToken, OneToken], {
			from: user1
		}).should.be.rejected;
	});

	it('fails to mint to many addresses when array size unequal 2', async () => {
		await contract.mintTokens([user1, user2], [OneToken], {
			from: user1
		}).should.be.rejected;
	});

	it('fails to mint to many addresses when array is empty', async () => {
		await contract.mintTokens([], [], {
			from: user1
		}).should.be.rejected;
	});

	it('fails to mint to many addresses when array have > 100 elements', async () => {
		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 101; i++) {
			receivers.push(admin);
			amounts.push(OneToken);
		}
		await contract.mintTokens(receivers, amounts, {
			from: user1
		}).should.be.rejected;
	});

	it('allows to set pre sale tokens', async () => {
		const tokens = OneToken.mul(10);
		await contract.setPreSaleTokens(tokens);
		(await contract.preSaleTokens()).should.be.bignumber.equal(tokens);
	});

	it('fails to set pre sale tokens twice', async () => {
		await contract.setPreSaleTokens(OneToken.mul(20)).should.be.rejected;
	});

	it('mints pre sale tokens', async () => {
		const preSaleTokens = await contract.preSaleTokens();
		preSaleTokens.should.be.bignumber.above(0);
		await contract.mintPreSaleTokens([user1], [preSaleTokens], [Date.now() + 365 * 24 * 60 * 60]);
		(await contract.preSaleTokens()).should.be.bignumber.equal(0);
	});

	it('manually mints all left tokens', async () => {
		const tx = await contract.mintTokens([user1], [OneToken.mul(100000000000)]);

		(await contract.icoTokensLeft()).should.be.bignumber.equal(0);

		(tx.logs[0].event).should.be.equal('ManualTokenMintRequiresRefund');
	});

	it('unknown user should fail to set ETH rate', async () => {
		await (contract.setExchangeRate(100, {
			from: user2
		})).should.be.rejected;
	});

	it('unknown user should not set rate orcale', async () => {
		await contract.setExchangeRateOracle(user2, {
			from: user1
		}).should.be.rejected;
	});

	it('known account should set ETH rate', async () => {
		await contract.setExchangeRateOracle(user2);
		await contract.setExchangeRate(100, {
			from: user2
		});
		(await contract.exchangeRate()).should.be.bignumber.equal(100);
	});

	it('owner should set ETH rate', async () => {
		await contract.setExchangeRate(200);
		(await contract.exchangeRate()).should.be.bignumber.equal(200);
	});

	it('should mint bounty tokens', async () => {
		await contract.mintBounty([user2], [OneToken]);

		(await contract.bountyBalances(user2)).should.be.bignumber.equal(OneToken);
	});

	it('bounty tokens should be visible in bounties', async () => {
		(await bounties.bountyOf(user2)).should.be.bignumber.equal(OneToken);
	});

	it('should be possible to claim bounty tokens', async () => {
		const balanceBefore = await token.balanceOf(user2);

		await contract.claimBounty(user2);

		const balanceAfter = await token.balanceOf(user2);

		(balanceAfter.sub(balanceBefore)).should.be.bignumber.equal(OneToken);
	});

	it('should be possible to claim bounty tokens through sending ETH to bounties contract', async () => {
		await contract.mintBounty([user2], [OneToken]);

		const balanceBefore = await token.balanceOf(user2);

		await bounties.sendTransaction({
			from: user2,
			value: 0,
			gas: 300000
		});

		const balanceAfter = await token.balanceOf(user2);

		(balanceAfter.sub(balanceBefore)).should.be.bignumber.equal(OneToken);
	});

	it('should fail to claim bounty tokens when there are not bounty tokens left', async () => {
		await contract.claimBounty(user2).should.be.rejected;
	});

	it('should not be possible to claim after finalize() call', async () => {
		await contract.mintBounty([user2], [OneToken]);
		(await contract.bountyBalances(user2)).should.be.bignumber.equal(OneToken);

		await contract.finalize();

		await contract.claimBounty(user2).should.be.rejected;
	});
});

contract('OrcaCrowdsale staging', async () => {
	let contract;
	let token;
	let whitelist;
	let stage0;
	let stage1;

	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()])
		contract = await TestOrcaCrowdsale.new(token.address, whitelist.address)
		await token.transferOwnership(contract.address);
		await contract.initialize()
		stage0 = await contract.stages(0)
	});

	it('successfully adds stage', async () => {
		await contract.addStage(stage0[END_DATE].add(1), stage0[END_DATE].add(2), 10, 0, stage0[MAX_PRIORITY_ID], 0);
		(await contract.getStageCount()).should.be.bignumber.equal(2)

		stage1 = await contract.stages(1)
	});

	it('fails to add stage if startDate is less than current time', async () => {
		await contract.addStage(0, stage1[END_DATE].add(1), 10, 0, stage1[MAX_PRIORITY_ID], 0).should.be.rejected;
	});

	it('fails to add stage if startDate is not greater than end date of last stage', async () => {
		await contract.addStage(stage1[END_DATE], stage1[END_DATE].add(3), 10, 0, stage1[MAX_PRIORITY_ID], 0).should.be.rejected;
	});

	it('fails to add stage with endDate less than startDate', async () => {
		await contract.addStage(stage1[END_DATE].add(10), stage1[END_DATE].add(9), 10, 0, stage1[MAX_PRIORITY_ID], 0).should.be.rejected;
	});

	it('fails to add stage with endDate equals startDate', async () => {
		await contract.addStage(stage1[END_DATE].add(10), stage1[END_DATE].add(10), 10, 0, stage1[MAX_PRIORITY_ID], 0).should.be.rejected;
	});

	it('fails to add stage with priority date after endDate', async () => {
		await contract.addStage(stage1[END_DATE].add(10), stage1[END_DATE].add(11), 10, 0, stage1[MAX_PRIORITY_ID], 5).should.be.rejected;
	});

	it('fails to add stage with too large cap', async () => {
		await contract.addStage(stage1[END_DATE].add(10), stage1[END_DATE].add(11), OneToken.mul(1000000000), 0, stage1[MAX_PRIORITY_ID], 0).should.be.rejected;
	});

	it('fails to add stage with small max priority id', async () => {
		await contract.addStage(stage1[END_DATE].add(10), stage1[END_DATE].add(11), 10, 0, 0, 0).should.be.rejected;
	});

	it('successfully calls finalize()', async () => {
		await contract.setNow(stage1[END_DATE].add(10));
		await contract.finalize();
	});

	it('fails to add stage after finalize() call', async () => {
		await contract.addStage(stage1[END_DATE].add(100), stage1[END_DATE].add(200), 0, 0, stage1[MAX_PRIORITY_ID], 0).should.be.rejected;
	});
});

contract('OrcaCrowdsale convert functions', async accounts => {
	let token;
	let contract;
	let whitelist;
	let stage0;

	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
		contract = await TestOrcaCrowdsale.new(token.address, whitelist.address);
		await token.transferOwnership(contract.address);
		await contract.initialize();

		stage0 = await contract.stages(0);
		await contract.addStage(stage0[END_DATE].add(1), stage0[END_DATE].add(2), 10, 0, stage0[MAX_PRIORITY_ID], 0);
	});

	it('should convert usd to tokens', async () => {
		(await contract.usdToTokensTest(600, 1)).should.be.bignumber.equal(10000);
	});

	it('should convert tokens to usd', async () => {
		(await contract.tokensToUsdTest(10000, 1)).should.be.bignumber.equal(600);
	});

	it('should convert usd to tokens with bonus', async () => {
		(await contract.usdToTokensTest(600, 0)).should.be.bignumber.equal(12000);
	});

	it('should convert usd to tokens with bonus', async () => {
		(await contract.tokensToUsdTest(12000, 0)).should.be.bignumber.equal(600);
	});

});