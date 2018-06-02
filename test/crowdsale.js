const BigNumber = web3.BigNumber;

require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const OrcaCrowdsale = artifacts.require("OrcaCrowdsale");
const OrcaToken = artifacts.require("OrcaToken");
const TestOrcaCrowdsale = artifacts.require("TestOrcaCrowdsale");
const Whitelist = artifacts.require("Whitelist");

contract('OrcaCrowdsale', async accounts => {
	const admin = accounts[0];
	const user1 = accounts[1];
	const user2 = accounts[2];
	let contract;
	let token;
	let start;
	let end;
	before(async () => {
		contract = await OrcaCrowdsale.deployed();
		token = await OrcaToken.at(await contract.token());
		[start, end] = await Promise.all([contract.START_TIME(), contract.END_TIME()]);
	});

	it('sum of all percents is 100', async () => {
		const [ico, partner, bounty, team, advisors] = await Promise.all([
			contract.ICO_PERCENT(),
			contract.PARTNER_PERCENT(),
			contract.BOUNTY_PERCENT(),
			contract.TEAM_PERCENT(),
			contract.FOUNDERS_PERCENT()
		]);

		ico.add(partner).add(bounty).add(team).add(advisors).should.be.bignumber.equal(100);
	});

	it('set crowdsale contract as OrcaToken owner', async () => {
		(await token.owner()).should.be.equal(contract.address);
	});

	it('ICO period should be 30 days', async () => {
		const icoPeriodInSecs = (60 * 60 * 24 * 30);
		(end - start).should.be.equal(icoPeriodInSecs);
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

	it('mints pre sale tokens', async () => {
		const preSaleTokens = await contract.preSaleTokensLeft();
		preSaleTokens.should.be.bignumber.above(0);
		await contract.mintPreSaleTokens([user1], [preSaleTokens], [Date.now() + 365 * 24 * 60 * 60]);
		(await contract.preSaleTokensLeft()).should.be.bignumber.equal(0);
	});

	it('manually mints all left tokens', async () => {

		const tx = await contract.mintTokens([user1], [OneToken.mul(10000000000)]);

		(await token.totalSupply()).should.be.bignumber.equal(await contract.ICO_TOKENS());

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
});

contract('OrcaCrowdsale convert functions', async accounts => {
	let token;
	let contract;
	let whitelist;

	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
		contract = await TestOrcaCrowdsale.new(token.address, whitelist.address);
	});

	it('should convert usd to tokens', async () => {
		(await contract.usdToTokensTest(600, 2)).should.be.bignumber.equal(10000);
	});

	it('should convert tokens to usd', async () => {
		(await contract.tokensToUsdTest(10000, 2)).should.be.bignumber.equal(600);
	});

	it('should convert usd to tokens with bonus', async () => {
		(await contract.usdToTokensTest(600, 0)).should.be.bignumber.equal(13500);
	});

	it('should convert usd to tokens with bonus', async () => {
		(await contract.tokensToUsdTest(13500, 0)).should.be.bignumber.equal(600);
	});

});