const config = require('../../config');

const {Web3} = require('../../export');

(async function () {
  let ins = new Web3(config.host);
  await ins.eth.isSyncing();
  console.log(await ins.eth.getTransactionCount('0xd02443b8d564fed4ad332cd52508b69b511df5b8'));
}());


