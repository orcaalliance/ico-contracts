const BigNumber = web3.BigNumber;

require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const OneEther = new BigNumber(web3.toWei(1, 'ether'));

const OrcaCrowdsale = artifacts.require("TestOrcaCrowdsale");
const OrcaToken = artifacts.require("TestOrcaToken");
const Whitelist = artifacts.require("Whitelist");
const ERC777TokenScheduledTimelock = artifacts.require("ERC777TokenScheduledTimelock");

const START_DATE = 0;
const END_DATE = 1;
const BONUS = 4;

contract('OrcaCrowdsale Medium ICO', async accounts => {
	const user1 = accounts[1];
	let contract;
	let token;
	let whitelist;
	let tokenPrice;
	let usdExchangeRate;
	let walletBalance;
	let stage0;

	function ethToTokens(wei, bonus) {
		const usd = wei.mul(usdExchangeRate).div(1000);
		return usd.mul(bonus.add(100)).div(tokenPrice);
	}

	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
		contract = await OrcaCrowdsale.new(token.address, whitelist.address);
		await token.transferOwnership(contract.address);
		[tokenPrice, usdExchangeRate] = await Promise.all([contract.getTokenPrice(), contract.exchangeRate()]);
		await Promise.all([
			contract.setNow(0),
			contract.initialize()
		]);
		walletBalance = await web3.eth.getBalance(await contract.getWallet());
		stage0 = await contract.stages(0);
		await whitelist.addAddress(user1);
	});

	it('should not accept funds before ICO start', async () => {
		await contract.sendTransaction({
			from: user1,
			value: OneEther
		}).should.be.rejected;
	});

	it('should accept funds after startTime', async () => {
		await contract.setNow(stage0[START_DATE].add(1));

		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 200000
		});

		(await token.balanceOf(user1)).should.be.bignumber.equal(ethToTokens(OneEther, stage0[BONUS]).round());
	});

	it('should correctly give tokens event if stage does not have enough', async () => {
		const bonus = stage0[BONUS];
		const balanceBefore = await token.balanceOf(user1);

		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(3800),
			gas: 200000
		});

		const balanceAfter = await token.balanceOf(user1);
		(balanceAfter.sub(balanceBefore)).should.be.bignumber.equal(ethToTokens(OneEther.mul(3800), bonus).floor());
	});


	it('should have 3801 Ether on balance', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.getWallet());
		(walletBalanceAfter.sub(walletBalance)).should.be.bignumber.equal(OneEther.mul(3801));
	});

	it('should not be able to finalize() ICO before end time', async () => {
		await contract.finalize().should.be.rejected;
	});

	it('should successfully finalize() successfull ICO', async () => {
		const wallet = await contract.getWallet();

		await contract.setNow(stage0[END_DATE].add(1));
		await contract.finalize().should.be.fulfilled;

		const etherBalanceAfter = await web3.eth.getBalance(wallet);
		(web3.fromWei(etherBalanceAfter.sub(walletBalance)).toNumber()).should.be.closeTo(3801, 0.01);
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
		(await contract.getTeamTokens()).should.be.bignumber.equal(timelockBalance);
	});

	it('should correctly timelock tokens on finalize', async () => {
		const timelock = await contract.timelock();
		const timelockContract = ERC777TokenScheduledTimelock.at(timelock);

		(await timelockContract.schedule(await contract.getTeamWallet(), 0))[0].should.be.bignumber.equal(await contract.getTeamTokenLockDate());
	});
});