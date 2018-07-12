const OrcaToken = artifacts.require('./OrcaToken.sol');
const Whitelist = artifacts.require('./Whitelist.sol');
const OrcaCrowdsale = artifacts.require('./OrcaCrowdsale.sol');
const EIP820Registry = require("eip820");

module.exports = function(deployer, network, accounts) {
    deployer.deploy(Whitelist).then(() => {
        if (network === 'development') {
            const Web3Latest = require("web3");
            const web3latest = new Web3Latest('http://localhost:8545');
            return EIP820Registry.deploy(web3latest, accounts[0]);
        } else {
            return null;
        }
    })
    .then(() => deployer.deploy(OrcaToken))
    .then(() => deployer.deploy(OrcaCrowdsale, OrcaToken.address, Whitelist.address))
    .then(() => OrcaToken.deployed())
    .then(token => token.transferOwnership(OrcaCrowdsale.address));
};
