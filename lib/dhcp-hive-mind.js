'use strict';

// Require the networking and redis modules.
var fs = require('fs'),
    net = require('net'),
    path = require('path'),
    redis = require('redis');


function DHCPHiveMind(opts) {

  // Make the current scope of this available as self.
  var self = this;

  // Make function parameters optional.
  opts = opts || {};
  this.name = opts.name || path.basename(process.argv[1]);
  this.configFile = path.join(opts.rootDir, 'config/config.json');
  this.config = require(self.configFile);
  this.masterConfig = {};
  this.redisClient = redis.createClient();
  this.discoverKeys = ['msg_type', 'client_mac', 'hostname', 'relay_ip'];
  this.requestKeys = ['msg_type', 'client_ip', 'client_mac', 'hostname', 'relay_ip'];

  this.setMasterConfig = function() {

    self.redisClient.select(1);
    self.redisClient.set('hostname', self.config.hostname);
    self.redisClient.set('interface', self.config.interface);
    self.redisClient.set('port', self.config.port);

    var subnetCount = self.config.subnets.length;
    self.redisClient.set('subnetCount', subnetCount);

    for (var i = 0; i < subnetCount; i++) {
      self.redisClient.hmset('subnet' + i, self.config.subnets[i]);
    }
  }

  this.loadMasterConfig = function() {

    self.redisClient.select(1);
    self.redisClient.mget('hostname', 'interface', 'port', 'subnetCount', function(err, res) {
      self.config.hostname = res[0];
      self.config.interface = res[1];
      self.config.port = res[2];
      self.config.subnetCount = res[3];

      self.config.subnets = [];
      for (var i = 0; i < self.config.subnetCount; i++) {
        self.redisClient.hgetall('subnet' + i, function(err, res) {
          self.config.subnets.push(res);
        });
      }
    });
  }

  this.dumpMasterConfig = function() {
    self.loadMasterConfig();

    fs.writeFileSync(self.configFile, JSON.stringify(self.config, null, 2));

    //fs.writeFile(self.configFile, JSON.stringify(self.config, null, 2), function(err) {
    //  if (err) {
    //    console.log(self.name + ' error: error writing ' + self.configFile + ': ' + err);
    //  } else {
    //    console.log(self.name + ' info: wrote ' + self.configFile);
    //  }
    //});
  }

  this.handleDiscover = function(conn, req) {

    // Handle and respond to client's DHCPDISCOVER.
    var clientIP = '240.0.0.2'; // fake
    var serverIP = '67.201.248.10'; // also fake
    var subnetMask = '255.255.255.128'; // also fake
    var leaseTime = 86400; // seconds

    var resp = { 
      "msg_type": "DHCPOFFER",
      "client_ip": clientIP,
      "client_mac": req.client_mac,
      "server_ip": serverIP,
      "relay_ip": req.relay_ip,
      "lease_time": leaseTime,
      "subnet_mask": subnetMask,
      "router": req.relay_ip
    };

    this.sendOffer(conn, resp);
  }

  this.sendOffer = function(conn, resp) {

    // Send DHCPOFFER.
    var msg = 'DHCPOFFER on ' + resp.client_ip + ' to ' + resp.client_mac;
    conn.write(msg + '\r\n');
    console.log(self.name + ': info: ' + msg);
  }

  this.handleRequest = function(conn, req) {

    // Respond to client's DHCPREQUEST.
    // Just ACK without validating (for now).
    var serverIP = '67.201.248.10'; // fake
    var subnetMask = '255.255.255.128'; // also fake
    var leaseTime = 86400; // seconds

    var resp = {
      "msg_type": "DHCPACK",
      "client_ip": req.client_ip,
      "client_mac": req.client_mac,
      "server_ip": serverIP,
      "relay_ip": req.relay_ip,
      "lease_time": leaseTime,
      "subnet_mask": subnetMask,
      "router": req.relay_ip
    }

    this.sendAck(conn, resp);
  }

  this.sendAck = function(conn, resp) {

    // Send DHCPACK.
    var msg = 'DHCPACK on ' + resp.client_ip + ' to ' + resp.client_mac + ' -- lease length ' + resp.lease_time + ' seconds';
    conn.write(msg + '\r\n');
    console.log(self.name + ': info: ' + msg);
  }

  this.validateRequest = function(data) {

    // Try to parse the data as JSON.
    try {
      var req = JSON.parse(data);

      // Verify the request has valid keys and possibly set the request type.
      var reqKeys = JSON.stringify(Object.keys(req).sort());
      if (reqKeys === JSON.stringify(self.discoverKeys.sort()) && req.msg_type === 'DHCPDISCOVER') {
        req.type = 'DHCPDISCOVER'; // Not sure if explicitly setting this is needed anymore
      } else if (reqKeys === JSON.stringify(self.requestKeys.sort()) && req.msg_type === 'DHCPREQUEST') {
        req.type = 'DHCPREQUEST';
      } else {
        return false;
      }

      // Everything's OK! Return the request object.
      return req;

    } catch (err) {
      return false;
    }
  }

  this.serve = function() {

    // Register a signal handler for SIGINT (A.K.A You can't fire me, I quit!).
    process.on('SIGINT', function() {

      console.log(self.name + ' info: dumping master configuration to file.');
      self.dumpMasterConfig();

      console.log(self.name + ' info: exiting...');
      process.exit();
    });

    // Check to see if a master config exists, otherwise set config in Redis.
    // I don't see a way to do this without it being a callback.
    self.redisClient.dbsize(function(err,numKeys) {
      if (numKeys > 0) {
        self.LoadMasterConfig();
      } else {
        self.setMasterConfig();
      }

      // Instantiate a net.Server class.
      var server = net.createServer(function(conn) {

        // Store the remote address of the client.
        var remote = conn.remoteAddress + ':' + conn.remotePort;

        // Log client connections.
        console.log(self.name + ': info: ' + remote + ' connected');

        // Log client disconnections.
        conn.on('end', function() {
          console.log(self.name + ': info: ' + remote + ' disconnected');
        });

        // Handle data from connected clients.
        conn.on('data', function(data) {

          // Validate incoming data as JSON.
          var req = self.validateRequest(data.toString());

          // If the request is valid, process it.
          if (req) {
            console.log(self.name + ': info: ' + req.type + ' from ' + remote);
            // UPDATE REDIS DB WITH REQUEST VALUES HERE.

            if (req.type === 'DHCPDISCOVER') {
              self.handleDiscover(conn, req);
            } else if (req.type === 'DHCPREQUEST') {
              self.handleRequest(conn, req);
            }

          } else {
            console.log(self.name + ': error: invalid request from ' + remote);
          }
        });
      });

      // Listen on the default interface and port.
      server.listen(self.config.port, self.config.interface, function() {
        console.log(self.name + ': info: server bound on ' + self.config.interface + ':' + self.config.port);
      });
    });
  }
}

// Export a DHCPHiveMind factory.
module.exports = function createDHCPHiveMind(opts) {
  return new DHCPHiveMind(opts);
}
