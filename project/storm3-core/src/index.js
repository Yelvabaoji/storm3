const requestManager = require('storm3-core-requestmanager');
const extend = require('./extend.js');

module.exports = {
  packageInit: function (pkg, args) {
    args = Array.prototype.slice.call(args);

    if (!pkg) {
      throw new Error('You need to instantiate using the "new" keyword.');
    }


    // make property of pkg._provider, which can properly set providers
    Object.defineProperty(pkg, 'currentProvider', {
      get: function () {
        return pkg._provider;
      },
      set: function (value) {
        return pkg.setProvider(value);
      },
      enumerable: true,
      configurable: true
    });

    // inherit from web3 umbrella package
    if (args[0] && args[0]._requestManager) {
      pkg._requestManager = new requestManager.Manager(args[0].currentProvider);

      // set requestmanager on package
    } else {
      pkg._requestManager = new requestManager.Manager();
      pkg._requestManager.setProvider(args[0], args[1]);
    }

    // add givenProvider
    pkg.givenProvider = requestManager.Manager.givenProvider;
    pkg.providers = requestManager.Manager.providers;

    pkg._provider = pkg._requestManager.provider;

    // add SETPROVIDER function (don't overwrite if already existing)
    if (!pkg.setProvider) {
      pkg.setProvider = function (provider, net) {
        pkg._requestManager.setProvider(provider, net);
        pkg._provider = pkg._requestManager.provider;
        return true;
      };
    }

    // attach batch request creation
    pkg.BatchRequest = requestManager.BatchManager.bind(null, pkg._requestManager);

    // attach extend function
    pkg.extend = extend(pkg);
  },
  addProviders: function (pkg) {
    pkg.givenProvider = requestManager.Manager.givenProvider;
    pkg.providers = requestManager.Manager.providers;
  }
};

