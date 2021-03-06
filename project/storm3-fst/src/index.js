const _ = require('underscore');
const core = require('storm3-core');
const helpers = require('storm3-core-helpers');
const Subscriptions = require('storm3-core-subscriptions').subscriptions;
const Method = require('storm3-core-method');
// const Method = require('../../storm3-core-method/export');
const utils = require('storm3-utils');
const Net = require('storm3-net');

const ENS = require('storm3-fst-ens');
const Personal = require('storm3-fst-personal');
const BaseContract = require('storm3-fst-contract');
const Iban = require('storm3-fst-iban');
const Accounts = require('storm3-fst-accounts');
const abi = require('storm3-fst-abi');

const getNetworkType = require('./getNetworkType.js');
const formatter = helpers.formatters;


const blockCall = function (args) {
  return (_.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'fst_getBlockByHash' : 'fst_getBlockByNumber';
};

const transactionFromBlockCall = function (args) {
  return (_.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'fst_getTransactionByBlockHashAndIndex' : 'fst_getTransactionByBlockNumberAndIndex';
};

const uncleCall = function (args) {
  return (_.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'fst_getUncleByBlockHashAndIndex' : 'fst_getUncleByBlockNumberAndIndex';
};

const getBlockTransactionCountCall = function (args) {
  return (_.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'fst_getBlockTransactionCountByHash' : 'fst_getBlockTransactionCountByNumber';
};

const uncleCountCall = function (args) {
  return (_.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'fst_getUncleCountByBlockHash' : 'fst_getUncleCountByBlockNumber';
};


const Fst = function Fst() {
  let _this = this;

  // sets _requestmanager
  core.packageInit(this, arguments);

  // overwrite setProvider
  const setProvider = this.setProvider;
  this.setProvider = function () {
    setProvider.apply(_this, arguments);
    _this.net.setProvider.apply(_this, arguments);
    _this.personal.setProvider.apply(_this, arguments);
    _this.accounts.setProvider.apply(_this, arguments);
    _this.Contract.setProvider(_this.currentProvider, _this.accounts);
  };


  let defaultAccount = null;
  let defaultBlock = 'latest';
  let transactionBlockTimeout = 50;
  let transactionConfirmationBlocks = 24;
  let transactionPollingTimeout = 750;
  let defaultChain, defaultHardfork, defaultCommon;

  Object.defineProperty(this, 'defaultCommon', {
    get: function () {
      return defaultCommon;
    },
    set: function (val) {
      defaultCommon = val;

      // also set on the Contract object
      _this.Contract.defaultCommon = defaultCommon;

      // update defaultBlock
      methods.forEach(function (method) {
        method.defaultCommon = defaultCommon;
      });
    },
    enumerable: true
  });
  Object.defineProperty(this, 'defaultHardfork', {
    get: function () {
      return defaultHardfork;
    },
    set: function (val) {
      defaultHardfork = val;

      // also set on the Contract object
      _this.Contract.defaultHardfork = defaultHardfork;

      // update defaultBlock
      methods.forEach(function (method) {
        method.defaultHardfork = defaultHardfork;
      });
    },
    enumerable: true
  });
  Object.defineProperty(this, 'defaultChain', {
    get: function () {
      return defaultChain;
    },
    set: function (val) {
      defaultChain = val;

      // also set on the Contract object
      _this.Contract.defaultChain = defaultChain;

      // update defaultBlock
      methods.forEach(function (method) {
        method.defaultChain = defaultChain;
      });
    },
    enumerable: true
  });
  Object.defineProperty(this, 'transactionPollingTimeout', {
    get: function () {
      return transactionPollingTimeout;
    },
    set: function (val) {
      transactionPollingTimeout = val;

      // also set on the Contract object
      _this.Contract.transactionPollingTimeout = transactionPollingTimeout;

      // update defaultBlock
      methods.forEach(function (method) {
        method.transactionPollingTimeout = transactionPollingTimeout;
      });
    },
    enumerable: true
  });
  Object.defineProperty(this, 'transactionConfirmationBlocks', {
    get: function () {
      return transactionConfirmationBlocks;
    },
    set: function (val) {
      transactionConfirmationBlocks = val;

      // also set on the Contract object
      _this.Contract.transactionConfirmationBlocks = transactionConfirmationBlocks;

      // update defaultBlock
      methods.forEach(function (method) {
        method.transactionConfirmationBlocks = transactionConfirmationBlocks;
      });
    },
    enumerable: true
  });
  Object.defineProperty(this, 'transactionBlockTimeout', {
    get: function () {
      return transactionBlockTimeout;
    },
    set: function (val) {
      transactionBlockTimeout = val;

      // also set on the Contract object
      _this.Contract.transactionBlockTimeout = transactionBlockTimeout;

      // update defaultBlock
      methods.forEach(function (method) {
        method.transactionBlockTimeout = transactionBlockTimeout;
      });
    },
    enumerable: true
  });
  Object.defineProperty(this, 'defaultAccount', {
    get: function () {
      return defaultAccount;
    },
    set: function (val) {
      if (val) {
        defaultAccount = utils.toChecksumAddress(formatter.inputAddressFormatter(val));
      }

      // also set on the Contract object
      _this.Contract.defaultAccount = defaultAccount;
      _this.personal.defaultAccount = defaultAccount;

      // update defaultBlock
      methods.forEach(function (method) {
        method.defaultAccount = defaultAccount;
      });

      return val;
    },
    enumerable: true
  });
  Object.defineProperty(this, 'defaultBlock', {
    get: function () {
      return defaultBlock;
    },
    set: function (val) {
      defaultBlock = val;
      // also set on the Contract object
      _this.Contract.defaultBlock = defaultBlock;
      _this.personal.defaultBlock = defaultBlock;

      // update defaultBlock
      methods.forEach(function (method) {
        method.defaultBlock = defaultBlock;
      });

      return val;
    },
    enumerable: true
  });


  this.clearSubscriptions = _this._requestManager.clearSubscriptions;

  // add net
  this.net = new Net(this.currentProvider);
  // add chain detection
  this.net.getNetworkType = getNetworkType.bind(this);

  // add accounts
  this.accounts = new Accounts(this.currentProvider);

  // add personal
  this.personal = new Personal(this.currentProvider);
  this.personal.defaultAccount = this.defaultAccount;

  // create a proxy Contract type for this instance, as a Contract's provider
  // is stored as a class member rather than an instance variable. If we do
  // not create this proxy type, changing the provider in one instance of
  // web3-eth would subsequently change the provider for _all_ contract
  // instances!
  let self = this;
  let Contract = function Contract() {
    BaseContract.apply(this, arguments);

    // when Fst.setProvider is called, call packageInit
    // on all contract instances instantiated via this Fst
    // instances. This will update the currentProvider for
    // the contract instances
    let _this = this;
    let setProvider = self.setProvider;
    self.setProvider = function () {
      setProvider.apply(self, arguments);
      core.packageInit(_this, [self.currentProvider]);
    };
  };

  Contract.setProvider = function () {
    BaseContract.setProvider.apply(this, arguments);
  };

  // make our proxy Contract inherit from web3-eth-contract so that it has all
  // the right functionality and so that instanceof and friends work properly
  Contract.prototype = Object.create(BaseContract.prototype);
  Contract.prototype.constructor = Contract;

  // add contract
  this.Contract = Contract;
  this.Contract.defaultAccount = this.defaultAccount;
  this.Contract.defaultBlock = this.defaultBlock;
  this.Contract.transactionBlockTimeout = this.transactionBlockTimeout;
  this.Contract.transactionConfirmationBlocks = this.transactionConfirmationBlocks;
  this.Contract.transactionPollingTimeout = this.transactionPollingTimeout;
  this.Contract.setProvider(this.currentProvider, this.accounts);

  // add IBAN
  this.Iban = Iban;

  // add ABI
  this.abi = abi;

  // add ENS
  this.ens = new ENS(this);

  let methods = [
    new Method({
      name: 'getNodeInfo',
      call: 'storm3_clientVersion'
    }),
    new Method({
      name: 'getProtocolVersion',
      call: 'fst_protocolVersion',
      params: 0
    }),
    new Method({
      name: 'getCoinbase',
      call: 'fst_coinbase',
      params: 0
    }),
    new Method({
      name: 'isMining',
      call: 'fst_mining',
      params: 0
    }),
    new Method({
      name: 'getHashrate',
      call: 'fst_hashrate',
      params: 0,
      outputFormatter: utils.hexToNumber
    }),
    new Method({
      name: 'isSyncing',
      call: 'fst_syncing',
      params: 0,
      outputFormatter: formatter.outputSyncingFormatter
    }),
    new Method({
      name: 'getGasPrice',
      call: 'fst_gasPrice',
      params: 0,
      outputFormatter: formatter.outputBigNumberFormatter
    }),
    new Method({
      name: 'getAccounts',
      call: 'fst_accounts',
      params: 0,
      outputFormatter: utils.toChecksumAddress
    }),
    new Method({
      name: 'getBlockNumber',
      call: 'fst_blockNumber',
      params: 0,
      outputFormatter: utils.hexToNumber
    }),
    new Method({
      name: 'getBalance',
      call: 'fst_getBalance',
      params: 2,
      inputFormatter: [formatter.inputAddressFormatter, formatter.inputDefaultBlockNumberFormatter],
      outputFormatter: formatter.outputBigNumberFormatter
    }),
    new Method({
      name: 'getStorageAt',
      call: 'fst_getStorageAt',
      params: 3,
      inputFormatter: [formatter.inputAddressFormatter, utils.numberToHex, formatter.inputDefaultBlockNumberFormatter]
    }),
    new Method({
      name: 'getCode',
      call: 'fst_getCode',
      params: 2,
      inputFormatter: [formatter.inputAddressFormatter, formatter.inputDefaultBlockNumberFormatter]
    }),
    new Method({
      name: 'getBlock',
      call: blockCall,
      params: 2,
      inputFormatter: [formatter.inputBlockNumberFormatter, function (val) {
        return !!val;
      }],
      outputFormatter: formatter.outputBlockFormatter
    }),
    new Method({
      name: 'getUncle',
      call: uncleCall,
      params: 2,
      inputFormatter: [formatter.inputBlockNumberFormatter, utils.numberToHex],
      outputFormatter: formatter.outputBlockFormatter,

    }),
    new Method({
      name: 'getBlockTransactionCount',
      call: getBlockTransactionCountCall,
      params: 1,
      inputFormatter: [formatter.inputBlockNumberFormatter],
      outputFormatter: utils.hexToNumber
    }),
    new Method({
      name: 'getBlockUncleCount',
      call: uncleCountCall,
      params: 1,
      inputFormatter: [formatter.inputBlockNumberFormatter],
      outputFormatter: utils.hexToNumber
    }),
    new Method({
      name: 'getTransaction',
      call: 'fst_getTransactionByHash',
      params: 1,
      inputFormatter: [null],
      outputFormatter: formatter.outputTransactionFormatter
    }),
    new Method({
      name: 'getTransactionFromBlock',
      call: transactionFromBlockCall,
      params: 2,
      inputFormatter: [formatter.inputBlockNumberFormatter, utils.numberToHex],
      outputFormatter: formatter.outputTransactionFormatter
    }),
    new Method({
      name: 'getTransactionReceipt',
      call: 'fst_getTransactionReceipt',
      params: 1,
      inputFormatter: [null],
      outputFormatter: formatter.outputTransactionReceiptFormatter
    }),
    new Method({
      name: 'getTransactionCount',
      call: 'fst_getTransactionCount',
      params: 2,
      inputFormatter: [formatter.inputAddressFormatter, formatter.inputDefaultBlockNumberFormatter],
      outputFormatter: utils.hexToNumber
    }),
    new Method({
      name: 'sendSignedTransaction',
      call: 'fst_sendRawTransaction',
      params: 1,
      inputFormatter: [null]
    }),
    new Method({
      name: 'signTransaction',
      call: 'fst_signTransaction',
      params: 1,
      inputFormatter: [formatter.inputTransactionFormatter]
    }),
    new Method({
      name: 'sendTransaction',
      call: 'fst_sendTransaction',
      params: 1,
      inputFormatter: [formatter.inputTransactionFormatter]
    }),
    new Method({
      name: 'sign',
      call: 'fst_sign',
      params: 2,
      inputFormatter: [formatter.inputSignFormatter, formatter.inputAddressFormatter],
      transformPayload: function (payload) {
        payload.params.reverse();
        return payload;
      }
    }),
    new Method({
      name: 'call',
      call: 'fst_call',
      params: 2,
      inputFormatter: [formatter.inputCallFormatter, formatter.inputDefaultBlockNumberFormatter]
    }),
    new Method({
      name: 'estimateGas',
      call: 'fst_estimateGas',
      params: 1,
      inputFormatter: [formatter.inputCallFormatter],
      outputFormatter: utils.hexToNumber
    }),
    new Method({
      name: 'submitWork',
      call: 'fst_submitWork',
      params: 3
    }),
    new Method({
      name: 'getWork',
      call: 'fst_getWork',
      params: 0
    }),
    new Method({
      name: 'getPastLogs',
      call: 'fst_getLogs',
      params: 1,
      inputFormatter: [formatter.inputLogFormatter],
      outputFormatter: formatter.outputLogFormatter
    }),
    new Method({
      name: 'getChainId',
      call: 'fst_chainId',
      params: 0,
      outputFormatter: utils.hexToNumber
    }),

    // subscriptions
    new Subscriptions({
      name: 'subscribe',
      type: 'eth',
      subscriptions: {
        'newBlockHeaders': {
          // TODO rename on RPC side?
          subscriptionName: 'newHeads', // replace subscription with this name
          params: 0,
          outputFormatter: formatter.outputBlockFormatter
        },
        'pendingTransactions': {
          subscriptionName: 'newPendingTransactions', // replace subscription with this name
          params: 0
        },
        'logs': {
          params: 1,
          inputFormatter: [formatter.inputLogFormatter],
          outputFormatter: formatter.outputLogFormatter,
          // DUBLICATE, also in web3-eth-contract
          subscriptionHandler: function (output) {
            if (output.removed) {
              this.emit('changed', output);
            } else {
              this.emit('data', output);
            }

            if (_.isFunction(this.callback)) {
              this.callback(null, output, this);
            }
          }
        },
        'syncing': {
          params: 0,
          outputFormatter: formatter.outputSyncingFormatter,
          subscriptionHandler: function (output) {
            let _this = this;

            // fire TRUE at start
            if (this._isSyncing !== true) {
              this._isSyncing = true;
              this.emit('changed', _this._isSyncing);

              if (_.isFunction(this.callback)) {
                this.callback(null, _this._isSyncing, this);
              }

              setTimeout(function () {
                _this.emit('data', output);

                if (_.isFunction(_this.callback)) {
                  _this.callback(null, output, _this);
                }
              }, 0);

              // fire sync status
            } else {
              this.emit('data', output);
              if (_.isFunction(_this.callback)) {
                this.callback(null, output, this);
              }

              // wait for some time before fireing the FALSE
              clearTimeout(this._isSyncingTimeout);
              this._isSyncingTimeout = setTimeout(function () {
                if (output.currentBlock > output.highestBlock - 200) {
                  _this._isSyncing = false;
                  _this.emit('changed', _this._isSyncing);

                  if (_.isFunction(_this.callback)) {
                    _this.callback(null, _this._isSyncing, _this);
                  }
                }
              }, 500);
            }
          }
        }
      }
    })
  ];

  methods.forEach(function (method) {
    method.attachToObject(_this);
    method.setRequestManager(_this._requestManager, _this.accounts); // second param means is eth.accounts (necessary for wallet signing)
    method.defaultBlock = _this.defaultBlock;
    method.defaultAccount = _this.defaultAccount;
    method.transactionBlockTimeout = _this.transactionBlockTimeout;
    method.transactionConfirmationBlocks = _this.transactionConfirmationBlocks;
    method.transactionPollingTimeout = _this.transactionPollingTimeout;
  });

};

core.addProviders(Fst);


module.exports = Fst;

