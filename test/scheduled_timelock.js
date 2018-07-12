const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const OneToken = new BigNumber(web3.toWei(1, "ether"));

const ERC777TokenScheduledTimelock = artifacts.require("TestERC777TokenScheduledTimelock");
const OrcaToken = artifacts.require("OrcaToken");

contract('ERC777Token Scheduled Timelock', async accounts => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    let token;
    let vesting;

    before(async () => {
        token = await OrcaToken.new();
        vesting = await ERC777TokenScheduledTimelock.new(token.address);
        await vesting.setNow(1);
        await token.mint(vesting.address, OneToken.mul(10));
        await token.finishMinting(); // to allow sending
    });

    /** SINGLE SLOT */

    it('should not add vesting slot with amount smaller than balance', async () => {
        await vesting.scheduleTimelock(user1, OneToken.mul(100), 10).should.be.rejected;
    });

    it('sucessfully adds vesting slot', async () => {
        await vesting.scheduleTimelock(user1, OneToken, 10);
        const [till, amount] = await vesting.schedule(user1, 0);
        till.should.be.bignumber.equal(10);
        amount.should.be.bignumber.equal(OneToken);
    });

    it('user1 should not have tokens', async () => {
        (await token.balanceOf(user1)).should.be.bignumber.equal(0);
    });

    it('should not release until date', async () => {
        await vesting.release(user1);

        (await token.balanceOf(user1)).should.be.bignumber.equal(0);
    });

    it('should release when date passes', async () => {
        await vesting.setNow(10);
        await vesting.release(user1);

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    });

    /** MULTIPLE SLOTS */

    it('sucessfully adds multiple vesting slots', async () => {
        for (let i = 0; i < 5; i++) {
            await vesting.scheduleTimelock(user2, OneToken, 15 + i * 5);
        }
        for (let i = 0; i < 5; i++) {
            const [till, amount] = await vesting.schedule(user2, i);
            till.should.be.bignumber.equal(15 + (i * 5));
            amount.should.be.bignumber.equal(OneToken);
        }
    });

    it('user2 should not have tokens', async () => {
        (await token.balanceOf(user2)).should.be.bignumber.equal(0);
    });

    it('should not release until date', async () => {
        await vesting.release(user2);
        (await token.balanceOf(user2)).should.be.bignumber.equal(0);
    });

    it('should partially release tokens', async () => {
        await vesting.setNow(21);
        await vesting.release(user2);

        (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(2));
    });

    it('should release all left tokens when date passes', async () => {
        await vesting.setNow(50);
        await vesting.release(user2);

        (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(5));
    });

    it('should allow vesting all left tokens', async () => {
        await vesting.scheduleTimelock(user2, OneToken.mul(4), 100);
    });

    it('should release all vested tokens', async () => {
        await vesting.setNow(100);
        await vesting.release(user2, { from: user2 });

        (await token.balanceOf(user2)).should.be.bignumber.equal(OneToken.mul(9));
        (await token.balanceOf(vesting.address)).should.be.bignumber.equal(0);
    });
});