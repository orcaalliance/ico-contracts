require('babel-register');
require('babel-polyfill');

module.exports = {

    rpc: {
        host: "localhost",
        port: 8545
    },
    networks: {
        development: {
            host: 'localhost',
            port: 8545,
            network_id: '*' // Match any network id
        },
        prod: {
            host: 'localhost',
            port: 8545,
            network_id: 3,
            gas:   4700000,
            from: '<your-account-address>'
        }
    }
};