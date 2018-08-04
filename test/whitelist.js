const BigNumber = web3.BigNumber;

require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const Web3Latest = require("web3");
const web3latest = new Web3Latest('http://localhost:8545');

const Whitelist = artifacts.require("Whitelist");

contract('Whitelist', async accounts => {
    let whitelist;

    before(async () => {
        whitelist = await Whitelist.new();
    });

    it('adds addresses', async () => {
        const addresses = Array(100).fill({}).map(() => web3latest.eth.accounts.create()).map(x => x.address);
        await whitelist.addAddresses(addresses);
    });
});