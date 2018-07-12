const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const { increaseTime } = require('./utils.js');

const OneToken = new BigNumber(web3.toWei(1, "ether"));

const ERC777TokenTimelock = artifacts.require("ERC777TokenTimelock");
const OrcaToken = artifacts.require("OrcaToken");

contract('ERC777 Token Timelock', async accounts => {
    const user1 = accounts[1];
    let token;
    let timelock;
    let now;
    const duration = 60; // seconds

    before(async () => {
        token = await OrcaToken.new();

        now = await web3.eth.getBlock('latest').timestamp;

        timelock = await ERC777TokenTimelock.new(token.address, user1, now + duration);

        await token.mint(timelock.address, OneToken);
        await token.finishMinting();
    });

    it('user does not have tokens', async () => {
        (await token.balanceOf(user1)).should.be.bignumber.equal(0);
    });

    it('should not release tokens before specified date', async () => {
        await timelock.release().should.be.rejected;
    });

    it('should release tokens after date', async () => {
        await increaseTime(duration);

        await timelock.release();

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    });

    it ('should not allow release twice', async () => {
        await timelock.release().should.be.rejected;
    });
});