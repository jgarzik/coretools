#!/usr/bin/env node

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var program        = require('commander');
var BitcoinRPC     = require('bitcore/RpcClient').class();
var Transaction    = require('bitcore/Transaction').class();
var Address        = require('bitcore/Address').class();
var Script         = require('bitcore/Script').class();
var networks       = require('bitcore/networks');
var util           = require('bitcore/util/util');
var buffertools    = require('buffertools');
var colors         = require('colors');
var p              = console.log;



program
	.version('0.0.1')
	.option('--rpcport [port]', 'Bitcoind RPC port [18332]', Number, 18332)
	.option('--rpcuser [user]', 'Bitcoind RPC user [user]', String, 'user')
	.option('--rpcpass [password]', 'Bitcoind RPC password [pass]', String, 'pass')
	.option('-N --network [testnet]', 'Bitcoind Network [testnet]', String, 'testnet')
	.option('-v --verbose', 'Verbose')
	.parse(process.argv);


var network = program.network == 'livenet' ? networks.livenet : networks.testnet;

var rpc = new BitcoinRPC({
		'port' : program.rpcport,
		'user' : program.rpcuser,
		'pass' : program.rpcpass,
		'protocol' : 'http'
});


var txid = program.args[0];

if (!txid) {
  p("\t No transaction ID given");
  program.help();
}

if (program.verbose) {
  pv = p;
}


p('\n\n## TXID'.bold.green);
p("\t" + txid);

rpc.getRawTransaction(txid, 1, function(err, tx) {
  if (err) 
    p(err);
  else {
    if (tx) {


      showTX(tx.result);
      parseTX(tx.result.hex);
    }
  }
});


var showTX = function(txInfo) {
  pv(require('util').inspect(txInfo, true, 10)); // 10 levels deep

  var d = new Date(txInfo.time*1000);

  p('# Blockchain Data'.bold.red);
  p('\tBlock'); 
  p('\t%s',txInfo.blockhash);
  p('\tConfirmations: %d', txInfo.confirmations);
  p('\tTime         : %s', d );


}


var parseTX = function(data) {
  var b = new Buffer(data,'hex');

  var tx = new Transaction();
  tx.parse(b);


  p('# Transaction'.bold.red);


  p('\tversion      : %d', tx.version); 
  p('\tlocktime     : %d', tx.lock_time); 

  p('## Hex'.bold.green);
  p(data.grey);

  p('## Inputs'.bold.green);

  var c = 0;
  tx.ins.forEach( function(i) {

    if (i.isCoinBase() ) {
      p("\tCoinbase");
    }
    else {
      var scriptSig = i.getScript();
      var pubKey    = scriptSig.simpleInPubKey();
      var pubKeyHash = util.sha256ripe160(pubKey);

      var addr = new Address(network.addressPubkey, pubKeyHash);
      var addrStr = addr.toString();
      p("\t#%d (%s) %s", c++, scriptSig.getInType(), addrStr);


      var outHash = i.getOutpointHash();

      var outIndex = i.getOutpointIndex();
      var outHashBase64 = outHash.reverse().toString('hex');

      p("\t\tOutpoint: %s @%d",outHashBase64, outIndex );

    }

  });


  p('## Outputs'.bold.green);

  var c = 0;
  tx.outs.forEach( function(i) {

    var scriptPubKey = i.getScript();
    var txType = scriptPubKey.classify();

    var hash =  scriptPubKey.simpleOutHash();
    var addr = new Address(network.addressPubkey, hash);
    var addrStr = addr.toString();
    p("\t#%d (%s) %s [%d BTC]", c++, scriptPubKey.getOutType(), addrStr,
      util.formatValue(i.v)
     );
  });



}

