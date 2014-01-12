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
var async          = require('async');
var async          = require('async');
var bignum         = require('bignum');
var p              = console.log;



program
	.version('0.0.1')
	.option('--rpcport [port]', 'Bitcoind RPC port [18332]', Number, 18332)
	.option('--rpcuser [user]', 'Bitcoind RPC user [user]', String, 'user')
	.option('--rpcpass [password]', 'Bitcoind RPC password [pass]', String, 'pass')
	.option('-N --network [testnet]', 'Bitcoind Network [testnet]', String, 'testnet')
	.option('-v --verbose', 'Verbose')
	.parse(process.argv);

var txid = program.args[0];

if (!txid) {
  p("\nNo transaction ID given");
  program.help();
}



var network = program.network == 'livenet' ? networks.livenet : networks.testnet;

var rpc = new BitcoinRPC({
		'port' : program.rpcport,
		'user' : program.rpcuser,
		'pass' : program.rpcpass,
		'protocol' : 'http'
});

if (program.verbose) {
  pv = p;
}
else {
  pv = function(){};
}


p('\n\n## TXID');
p("\t" + txid);

rpc.getRawTransaction(txid, 1, function(err, txdata) {
  if (err) 
    p(err);
  else {
    if (txdata) {
      showBlockChainInfo(txdata.result);

      parseTX(txdata.result.hex, function(tx) {

        if (err) 
          p(err); 
        else 
          showTxInfo(tx);
      });
    }
  }
});

var parseTX = function(data, next) {


  var b = new Buffer(data,'hex');
  var tx = new Transaction();

  var c=0;

  tx.parse(b);

  async.each(tx.ins, function(i, cb) {

      var outHash = i.getOutpointHash();
      var outIndex = i.getOutpointIndex();
      var outHashBase64 = outHash.reverse().toString('hex');

      var c=0;
      rpc.getRawTransaction(outHashBase64, function(err, txdata) {
        var txin = new Transaction();
        var b = new Buffer(txdata.result,'hex');
        txin.parse(b);

        txin.outs.forEach( function(j) {
          // console.log( c + ': ' + util.formatValue(j.v) );
          if (c == outIndex) {
            i.value = j.v;

            // This is used for pay-to-pubkey transaction in which
            // the pubkey is not provided on the input
            var scriptPubKey = j.getScript();
            var txType       = scriptPubKey.classify();
            var hash         = scriptPubKey.simpleOutHash();
            if (hash) {
              var addr          = new Address(network.addressPubkey, hash);
              i.addrFromOutput  = addr.toString();
            }
          }
          c++;
        });
        return cb();
      });

    },
    function(err) {
      return next(tx);
  });
}


var showBlockChainInfo = function(txInfo) {
  pv(require('util').inspect(txInfo, true, 10)); // 10 levels deep

  var d = new Date(txInfo.time*1000);

  p('## Blockchain Data');
  p('\tBlock:'); 
  p('\t%s',txInfo.blockhash);
  p('\tConfirmations: %d', txInfo.confirmations);
  p('\tTime         : %s', d );

}

var satoshisToBTC = function(n) {
  return n/100000000.;
}


var showTxInfo = function(tx) {

  p('## Transaction');

  p('\tversion      : %d', tx.version); 
  p('\tlocktime     : %d', tx.lock_time); 


  p('## Inputs');

  var c        = 0;
  var valueIn  = bignum(0);
  var valueOut = bignum(0);

  tx.ins.forEach( function(i) {

    if (i.isCoinBase() ) {
      p("\tCoinbase");
    }
    else {
      var scriptSig     = i.getScript();
      var pubKey        = scriptSig.simpleInPubKey();
      var addrStr       = '[could not parse it]';
      if (pubKey) {
        var pubKeyHash    = util.sha256ripe160(pubKey);
        var addr          = new Address(network.addressPubkey, pubKeyHash);
        addrStr           = addr.toString();
      }
      else {
        if (i.addrFromOutput) addrStr = i.addrFromOutput;
      }
      var outHash       = i.getOutpointHash();
      var outIndex      = i.getOutpointIndex();
      var outHashBase64 = outHash.toString('hex');

      p("\t#%d (%s) %s [%d BTC]", c++, scriptSig.getInType(), addrStr,
        util.formatValue(i.value));
      p("\t  (Outpoint: %s @%d)",outHashBase64, outIndex );

      var n =util.valueToBigInt(i.value).toNumber();
      valueIn           = valueIn.add( n );

    }

  });
  p('\tTotal Inputs: %d',  satoshisToBTC( valueIn ));

  p('## Outputs');

  var c = 0;
  tx.outs.forEach( function(i) {

    var scriptPubKey = i.getScript();
    var txType       = scriptPubKey.classify();
    var hash         = scriptPubKey.simpleOutHash();
    var addrStr      = '[could not parse it]'
    if (hash) {
      var addr = new Address(network.addressPubkey, hash);
      addrStr  = addr.toString();
    }
    p("\t#%d (%s) %s [%d BTC]", c++, scriptPubKey.getOutType(), addrStr,
      util.formatValue(i.v)
     );

    var n =  util.valueToBigInt(i.v).toNumber();
    valueOut = valueOut.add(n);
  });
  p('\tTotal Outputs: %d BTC', satoshisToBTC( valueOut ) );
  p('\tFee: %d BTC', satoshisToBTC( valueIn.sub(valueOut.toNumber()))) ;
}

