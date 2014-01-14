#!/usr/bin/env node

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var program        = require('commander');
var BitcoinRPC     = require('bitcore/RpcClient').class();
var Transaction    = require('bitcore/Transaction').class();
var Address        = require('bitcore/Address').class();
var Block          = require('bitcore/Block').class();
var Script         = require('bitcore/Script').class();
var networks       = require('bitcore/networks');
var util           = require('bitcore/util/util');
var buffertools    = require('buffertools');
var async          = require('async');
var async          = require('async');
var bignum         = require('bignum');
var p              = console.log;


var dfltPort       =  process.env.BITCOIND_PORT || 18332;
var dfltHost       =  process.env.BITCOIND_HOST || 'localhost';
var dfltUser       =  process.env.BITCOIND_USER || 'user';
var dfltPass       =  process.env.BITCOIND_PASS || 'pass';



program.on('--help', function(){
    console.log('  Default values are also read from BITCOIND_PORT, BITCOIND_HOST, BITCOIND_USER, BITCOIND_PASS environment variables.');
});


program
	.version('0.0.2')
	.option('--rpchost [host]', 'Bitcoind RPC host [localhost]', Number, dfltHost)
	.option('--rpcport [port]', 'Bitcoind RPC port [18332]', Number, dfltPort)
	.option('--rpcuser [user]', 'Bitcoind RPC user [user]', String, dfltUser)
	.option('--rpcpass [password]', 'Bitcoind RPC password [pass]', String, dfltPass)
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
        'host' : program.rpchost,
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

rpc.getRawTransaction(txid, 1, function(err, txData) {
  if (err) p(err);
  else {
    if (txData) {
        rpc.getBlock(txData.result.blockhash, function(err, blockData) {
            if (err) p(err);
            pv("BLOCK DATA", require('util').inspect(blockData, true, 10));

            showBlockChainInfo(txData.result, blockData.result);

            parseTX(txData.result.hex, blockData.result, function(tx) {

                if (err) 
                p(err); 
                else 
                showTxInfo(tx);
            });
        });
    }
  }
});

var parseTX = function(txHex, blockInfo, next) {

  var b = new Buffer(txHex,'hex');
  var tx = new Transaction();

  var c=0;

  tx.parse(b);

  if (tx.isCoinBase() ) {
      tx.blockReward = Block.getBlockValue(blockInfo.height) / util.COIN;
      return next(tx);
  }

  async.each(tx.ins, function(i, cb) {

      var outHash = i.getOutpointHash();
      var outIndex = i.getOutpointIndex();
      var outHashBase64 = outHash.reverse().toString('hex');

      var c=0;
      rpc.getRawTransaction(outHashBase64, function(err, txData) {

        var txin = new Transaction();
        var b = new Buffer(txData.result,'hex');
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


var showBlockChainInfo = function(txInfo,blockInfo) {
  pv("TX DATA", require('util').inspect(txInfo, true, 10)); // 10 levels deep

  var d = new Date(txInfo.time*1000);

  p('## Blockchain Data');
  p('\tBlock:'); 
  p('\t%s',txInfo.blockhash);
  p('\tConfirmations: %d', txInfo.confirmations);
  p('\tHeight       : %d', blockInfo.height);
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
      p("\tReward       : %d", tx.blockReward );
      valueIn           = valueIn.add( tx.blockReward * util.COIN );
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

