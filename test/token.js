const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const OneToken = new BigNumber(web3.toWei(1, "ether"));

const OrcaToken = artifacts.require("TestOrcaToken");
const RandomContract = artifacts.require("RandomContract");

contract.only('Orca Token', async accounts => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    let token;
    let random;

    before(async () => {
        token = await OrcaToken.new();
        random = await RandomContract.new();
    });

    it('token is created in Minting state', async () => {
        (await token.state()).should.be.bignumber.equal(0);
    });

    it('should mint tokens', async () => {
        await token.mint(admin, OneToken.mul(10));
        (await token.balanceOf(admin)).should.be.bignumber.equal(OneToken.mul(10));
    });

    it('should fail to transfer while minting', async () => {
        await token.transfer(user1, OneToken).should.be.rejected;
    });

    it('should fail to switch on burning before finished minting', async () => {
        await token.enableBurn(true).should.be.rejected;
    });

    it("should successfully finish minting", async () => {
      await token.finishMinting();

      (await token.state()).should.be.bignumber.equal(1);
    });

    it("should fail to finish minting again", async () => {
        await token.finishMinting().should.be.rejected;
    });

    it('should success erc20 transfer after minting finished', async () => {
        await token.transfer(user1, OneToken);

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
    });

    it('should success erc777 send after minting finished', async () => {
        await token.sendProxy(user1, OneToken, '');

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(2));
    });

    it('should successfully transfer into non ERC777 receiver smart contract', async () => {
        await token.transfer(random.address, OneToken);

        (await token.balanceOf(random.address)).should.be.bignumber.equal(OneToken);
    });

    it('should fail erc777 send into non ERC777 receiver smart contract', async () => {
        await token.sendProxy(random.address, OneToken, "").should.be.rejected;
    });

    it('should fail to burn before burning is enabled', async () => {
        await token.burn(OneToken.mul(0.5), "", "", { from: user1 }).should.be.rejected;
    });

    it('should success enable burning', async () => {
        await token.enableBurn(true);

        (await token.state()).should.be.bignumber.equal(2);
    });

    it('should successfully burn', async () => {
        const totalSupply = await token.totalSupply();

        await token.burn(OneToken.mul(0.5), "", "", { from: user1 });

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(1.5));
        (await token.totalSupply()).should.be.bignumber.equal(totalSupply.sub(OneToken.mul(0.5)));
    });

    it("should successfully disable burning", async () => {
        await token.enableBurn(false);

        (await token.state()).should.be.bignumber.equal(1);
    });

    it('should fail to burn after burning is disabled', async () => {
        await token.burn(OneToken.mul(0.5), "", "", { from: user1 }).should.be.rejected;
    });
});