const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const OneToken = new BigNumber(web3.toWei(1, "ether"));

const OrcaToken = artifacts.require("OrcaToken");

contract('Orca Token', async accounts => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    let token;

    before(async () => {
        token = await OrcaToken.new();
    });

    it('token is created in Minting state', async () => {
        (await token.state()).should.be.bignumber.equal(0);
    });

    it('should mint tokens', async () => {
        await token.mint(admin, OneToken);
        (await token.balanceOf(admin)).should.be.bignumber.equal(OneToken);
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
    
    it('should success transfer after minting finished', async () => {
        await token.transfer(user1, OneToken);

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken);
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

        (await token.balanceOf(user1)).should.be.bignumber.equal(OneToken.mul(0.5));
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