const config = require('../../config');

const {Storm3} = require('../../export');

(async function () {
  let ins = new Storm3(config.host);
  await ins.eth.isSyncing();
  console.log(ins.eth.Iban.toIban("0x00c5496aEe77C1bA1f0854206A26DdA82a81D6D8"));
}());




