const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const ExchangeRateConsumer = artifacts.require("ExchangeRateConsumer");

contract('ExchangeRateConsumer', async accounts => {
    const user1 = accounts[1];
    const user2 = accounts[2];
    let contract;
    before(async () => {
        contract = await ExchangeRateConsumer.new();
    });

    it('unknown user should fail to set ETH rate', async () => {
        await (contract.setExchangeRate(100, { from: user2 })).should.be.rejected;
    });

    it('unknown user should not set rate orcale', async () => {
        await contract.setExchangeRateOracle(user2, { from: user1 }).should.be.rejected;
    });

    it('known account should set ETH rate', async () => {
        await contract.setExchangeRateOracle(user2);
        await contract.setExchangeRate(100, { from: user2 });
        (await contract.exchangeRate()).should.be.bignumber.equal(100);
    });

    it('owner should set ETH rate', async () => {
        await contract.setExchangeRate(200);
        (await contract.exchangeRate()).should.be.bignumber.equal(200);
    });
});
