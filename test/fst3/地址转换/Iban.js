const config = require('../../config');

const {Storm3} = require('../../export');

(async function () {
  let ins = new Storm3(config.host);
  await ins.eth.isSyncing();
  console.log(new ins.eth.Iban('XE81ETHXREGGAVOFYORK'));
}());




