let MultiSigWallet = artifacts.require("./SimpleMultiSigWallet.sol");
let Token = artifacts.require("./OrcaToken.sol");

contract('SimpleMultiSigWallet', function (accounts) {

    it('Requires multiple confirmations', async function () {
        let additionalOwners = accounts.slice(0, 4);
        let wallet = await MultiSigWallet.new(additionalOwners, 2);

        await wallet.sendTransaction(
            {
                from: web3.eth.accounts[0],
                to: contract.address,
                value: web3.toWei(3, 'ether'),
            }
        );

        let transaction = await wallet.submitTransaction(web3.eth.accounts[2], 2);
        assert.equal(transaction.logs.length, 2);
        let txid = transaction.logs[0].args.transactionId.toNumber();

        assert.equal(transaction.logs[0].event, 'Submission');
        assert.equal(transaction.logs[1].event, 'Confirmation');

        let confirmations = await wallet.getConfirmations(txid);
        assert.equal(confirmations.length, 1);

        assert.equal((await wallet.getConfirmationCount(txid)).toNumber(), 1);

        await wallet.revokeConfirmation(txid);
        assert.equal((await wallet.getConfirmationCount(txid)).toNumber(), 0);
    });

    it('After getting required confirmations ether transferred to destination', async function () {
        //given
        let additionalOwners = accounts.slice(0, 4);
        const REQUIRED_CONFIRMATIONS = 2;
        const TRANSACTION_DESTINATION = web3.eth.accounts[2];
        const BALANCE_OF_DESTINATION = web3.eth.getBalance(TRANSACTION_DESTINATION);
        const TRANSACTION_AMOUNT = web3.toWei(2, 'ether');
        let wallet = await MultiSigWallet.new(additionalOwners, REQUIRED_CONFIRMATIONS);

        await wallet.sendTransaction(
            {
                from: web3.eth.accounts[0],
                to: contract.address,
                value: web3.toWei(3, 'ether'),
            }
        );

        //when
        let transaction = await wallet.submitTransaction(TRANSACTION_DESTINATION, TRANSACTION_AMOUNT);
        let txid = transaction.logs[0].args.transactionId.toNumber();
        await wallet.confirmTransaction(txid, {from: accounts[1]})

        //then
        assert.equal(web3.eth.getBalance(TRANSACTION_DESTINATION) - BALANCE_OF_DESTINATION, TRANSACTION_AMOUNT, "Ether balance of transaction destination increased by " + TRANSACTION_AMOUNT);
        assert.equal((await wallet.getTransactionCount(false, true)).toNumber(), 1, "Number of executed transaction is equal to 1");
    });

    it('Transaction can not be added if wallet has not enough balance', async function () {
        //given
        let transferError;
        let additionalOwners = accounts.slice(0, 4);
        const REQUIRED_CONFIRMATIONS = 2;
        const TRANSACTION_DESTINATION = web3.eth.accounts[2];
        const BALANCE_OF_DESTINATION = web3.eth.getBalance(TRANSACTION_DESTINATION);
        const TRANSACTION_AMOUNT = web3.toWei(2, 'ether');
        let wallet = await MultiSigWallet.new(additionalOwners, REQUIRED_CONFIRMATIONS);

        await wallet.sendTransaction(
            {
                from: web3.eth.accounts[0],
                to: contract.address,
                value: TRANSACTION_AMOUNT - web3.toWei(1, 'ether'),
            }
        );

        //when
        try {
            await wallet.submitTransaction(TRANSACTION_DESTINATION, TRANSACTION_AMOUNT);
        } catch (error) {
            transferError = error;
        }

        //then
        assert.notEqual(transferError, undefined, 'Error must be thrown, when owner tries to transfer more ether, then wallet balance has');
    });


    it('After getting required confirmations tokens transferred to destination', async function () {
        //given
        let token = await Token.new();
        await token.unfreeze();
        let additionalOwners = accounts.slice(0, 4);
        const REQUIRED_CONFIRMATIONS = 2;
        const TRANSACTION_DESTINATION = web3.eth.accounts[2];
        const TRANSACTION_AMOUNT = web3.toWei(2, 'ether');
        let wallet = await MultiSigWallet.new(additionalOwners, REQUIRED_CONFIRMATIONS);
        await token.transfer(wallet.address, TRANSACTION_AMOUNT);

        //when
        let transaction = await wallet.submitTokenTransaction(token.address, TRANSACTION_DESTINATION, TRANSACTION_AMOUNT);
        let txid = transaction.logs[0].args.transactionId.toNumber();
        await wallet.confirmTransaction(txid, {from: accounts[1]})

        //then
        assert.equal((await token.balanceOf(TRANSACTION_DESTINATION)).toNumber(), TRANSACTION_AMOUNT, "Token balance of transaction destination is equal to " + TRANSACTION_AMOUNT);
        assert.equal((await wallet.getTransactionCount(false, true)).toNumber(), 1, "Number of executed transaction is equal to 1");
    });

    it('Token transaction can not be added if wallet has not enough tokens', async function () {
        //given
        let transferError;
        let token = await Token.new();
        await token.unfreeze();
        let additionalOwners = accounts.slice(0, 4);
        const REQUIRED_CONFIRMATIONS = 2;
        const TRANSACTION_DESTINATION = web3.eth.accounts[2];
        const TRANSACTION_AMOUNT = web3.toWei(2, 'ether');
        let wallet = await MultiSigWallet.new(additionalOwners, REQUIRED_CONFIRMATIONS);
        await token.transfer(wallet.address, TRANSACTION_AMOUNT);

        //when
        try {
            await wallet.submitTokenTransaction(token.address, TRANSACTION_DESTINATION, web3.toWei(3, 'ether'));
        } catch (error) {
            transferError = error;
        }
        assert.notEqual(transferError, undefined, 'Error must be thrown, when owner tries to transfer more token, then wallet has');
    });

    it("Eth transaction confirmation cannot be revoked by owner who not confirmed transaction earlier", async function () {
        //given
        let transferError;
        let additionalOwners = accounts.slice(0, 4);
        let wallet = await MultiSigWallet.new(additionalOwners, 4);
        const TRANSACTION_DESTINATION = web3.eth.accounts[2];
        const TRANSACTION_AMOUNT = web3.toWei(2, 'ether');

        //when
        await wallet.sendTransaction(
            {
                from: web3.eth.accounts[0],
                to: contract.address,
                value: TRANSACTION_AMOUNT,
            }
        );
        let transaction = await wallet.submitTransaction(TRANSACTION_DESTINATION, TRANSACTION_AMOUNT);
        let txid = transaction.logs[0].args.transactionId.toNumber();
        await wallet.confirmTransaction(txid, {from: accounts[1]})

        try {
            await wallet.revokeConfirmation(txid, {from: accounts[2]});
        } catch (error) {
            transferError = error;
        }

        //then
        assert.notEqual(transferError, undefined, 'Error must be thrown, when owner, who did not confirmed transaction tries to revoke it');
    });


    it("Token balance can be listed in wallet", async function () {
        //given
        let additionalOwners = accounts.slice(0, 3);
        const REQUIRED_CONFIRMATION = 3;
        let token = await Token.new();
        await token.unfreeze();
        let wallet = await MultiSigWallet.new(additionalOwners, REQUIRED_CONFIRMATION);

        //when
        await token.transfer(wallet.address, web3.toWei(2, 'ether'));

        //then
        assert.equal(await wallet.tokenBalance(token.address), web3.toWei(2, 'ether'), "Tokens supply listed in wallet");
    });

    it("Transactions can be listed in wallet", async function () {
        let additionalOwners = accounts.slice(0, 4);
        let wallet = await MultiSigWallet.new(additionalOwners, 2);

        await wallet.sendTransaction(
            {
                from: web3.eth.accounts[0],
                to: contract.address,
                value: web3.toWei(3, 'ether'),
            }
        );

        await wallet.submitTransaction(web3.eth.accounts[2], 2);
        let transaction = await wallet.submitTransaction(web3.eth.accounts[2], 2);
        let txid = transaction.logs[0].args.transactionId.toNumber();

        await wallet.confirmTransaction(txid, {from: accounts[2]});
        assert.equal((await wallet.getTransactionCount(true, true)).toNumber(), 2, "All transactions founded ");
        assert.equal((await wallet.getTransactionCount(false, true)).toNumber(), 1, "Executed transactions founded");
        assert.equal((await wallet.getTransactionCount(true, false)).toNumber(), 1, "Pending transactions founded");

        assert.equal((await wallet.getTransactionIds(0, 2, true, true)).length, 2, "All transactions founded ");
        assert.equal((await wallet.getTransactionIds(0, 2, false, true)).length, 1, "Executed transactions founded");
        assert.equal((await wallet.getTransactionIds(0, 2, true, false)).length, 1, "Pending transactions founded");
    });


});