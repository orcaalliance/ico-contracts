const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const OneToken = new BigNumber(web3.toWei(1, "ether"));

const OrcaToken = artifacts.require("TestOrcaToken");
const CommunityLock = artifacts.require("CommunityLock");

contract('Community Lock', async accounts => {
    const user1 = accounts[1];
    let token;
    let communityLock;

    before(async () => {
        token = await OrcaToken.new();
        communityLock = await CommunityLock.new(token.address);
    });

    it('stranger cannot set community lock address', async () => {
        await token.setCommunityLock(communityLock.address, { from: user1 }).should.be.rejected;
    });

    it('should possible to set community lock address', async () => {
        await token.setCommunityLock(communityLock.address);

        (await token.communityLock()).should.be.equal(communityLock.address);
    });

    it('community lock should be able to burn own tokens', async () => {
        await token.mint(communityLock.address, OneToken, '');

        (await token.balanceOf(communityLock.address)).should.be.bignumber.equal(OneToken);

        await communityLock.burn(OneToken.mul(0.5));

        (await token.balanceOf(communityLock.address)).should.be.bignumber.equal(OneToken.mul(0.5));
    });

    it('community token cannot burn more tokens than it owns', async () => {
        await communityLock.burn(OneToken).should.be.rejected;
    });
});