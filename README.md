# Orca Crowdsale and Token contracts

## Testing

Before running test suite you need to start `ganache-cli` with the following command

`ganache-cli -a 200 -e 1000000`

After that start test suite with `truffle test` in a separate terminal session.

## Deployment

1. Before deployment you have to change addresses in OrcaCrowdsale.sol for:
    - WALLET (line 14)
    - PARTNER_WALLET (line 16)
    - BOUNTY_WALLET (line 18)
    - TEAM_WALLET (line 20)
    - ADVISORS_WALLET (line 22)
2. Change the following constants in OrcaCrowdsale.sol to correct values:
    - PRE_SALE_TOKENS (line 25)
    - START_TIME (line 26)
    - END_TIME (line 27)
    - FIRST_24H_ALLOWED_USERS_COUNT (line 31)
3. Recheck token name and symbol in OrcaToken.sol (lines 18, 19).
4. First you have to deploy Whitelist smart contract.
5. Then you have to deploy OrcaToken smart contract.
6. Then, you have to deploy OrcaCrowdsale and pass deployed token and whitelist smart contract addresses into constructor.
7. Then you have to execute `transferOwnership` function on OrcaToken with address of OrcaCrowdsale smart-contract.

P.S. You can also deploy it using `truffle migrate`.

## Token functionality

* All the futures of standart ERC20 and ERC777
* Possibility to enable/disable ERC20 compatibility via `enableERC20` and `disableERC20`
* ERC20 `transfer` throws when tokens are transfered into smart-contact which not supporting ERC777 receiver. This is preventing on token loses.
* Ability to switch on/off throwing on sending into incompatible contracts.
* Allow to enable token burning (for potential migration in the future) via `enableBurn(bool enable)`

