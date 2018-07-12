const BigNumber = web3.BigNumber;

require('chai')
	.use(require('chai-as-promised'))
	.use(require('chai-bignumber')(BigNumber))
	.should();

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const OrcaCrowdsale = artifacts.require("TestOrcaCrowdsale");
const OrcaToken = artifacts.require("OrcaToken");
const Whitelist = artifacts.require("Whitelist");

contract('OrcaCrowdsale Complex', async accounts => {
	const user1 = accounts[1];
	let contract;
	let token;
	let whitelist;
	let start;
	let end;
	let walletBalance;
	before(async () => {
		[token, whitelist] = await Promise.all([OrcaToken.new(), Whitelist.new()]);
		contract = await OrcaCrowdsale.new(token.address, whitelist.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end] = await Promise.all([contract.START_TIME(), contract.END_TIME()]);
		walletBalance = await web3.eth.getBalance(await contract.WALLET());
		await whitelist.addAddress(user1);
	});

	it('should manually mint tokens', async () => {
		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(user1);
			amounts.push(OneToken);
		}
		await contract.mintTokens(receivers, amounts).should.be.fulfilled;

		(await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(100));
	});

	it('manual minting moves stages', async () => {
		const stageBefore = await contract.currentStage();

		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(user1);
			amounts.push(OneToken.mul(600001));
		}
		await contract.mintTokens(receivers, amounts).should.be.fulfilled;

		(await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(600001).mul(100).add(OneToken.mul(100)));
		(stageBefore).should.be.bignumber.equal(0);
		(await contract.currentStage()).should.be.bignumber.equal(1);
	});

	it('ether transfers moves multiple stages', async () => {
		await contract.setNow(start.add(1));

		await contract.sendTransaction({
			from: user1,
			value: OneEther.mul(10500),
			gas: 300000
		});

		(await contract.currentStage()).should.be.bignumber.equal(2);
	});

	it('should be possible to mint after ICO end and before finalize', async () => {
		await contract.setNow(end.add(10));

		const balanceBefore = await token.balanceOf(user1);
		await contract.mintTokens([user1], [OneToken]).should.be.fulfilled;

		const balanceAfter = await token.balanceOf(user1);

		(balanceAfter.sub(balanceBefore)).should.be.bignumber.equal(OneToken);
	});

	it('should fail to accept funds after ICO end and before finalize', async () => {
		await contract.sendTransaction({
			from: user1,
			value: OneEther,
			gas: 300000
		}).should.be.rejected;
	});

});