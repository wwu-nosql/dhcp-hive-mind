'use strict';

// Require filesystem, networking, path manipulation, and redis modules.
var fs = require('fs'),
    net = require('net'),
    path = require('path'),
    redis = require('redis'),
    Netmask = require('netmask').Netmask;


function DHCPHiveMind(opts) {

  // Make the current scope of this available as self.
  var self = this;

  // Make function parameters optional.
  opts = opts || {};
  this.name = opts.name || path.basename(process.argv[1]);
  this.configFile = path.join(opts.rootDir, 'config/config.json');
  try {
    this.config = require(self.configFile);
  } catch (err) {
    this.config = require(path.join(opts.rootDir, 'config/defaultConfig.json'));
  }
  this.masterConfig = {};
  this.redisClient = redis.createClient();
  this.discoverKeys = ['msg_type', 'client_mac', 'hostname', 'relay_ip'];
  this.requestKeys = ['msg_type', 'client_ip', 'client_mac', 'hostname', 'relay_ip'];

  this.setMasterConfig = function() {

    // Select the configuration database.
    self.redisClient.select(0);

    // Set Redis keys to match the currently loaded configuration.
    self.redisClient.set('hostname', self.config.hostname);
    self.redisClient.set('interface', self.config.interface);
    self.redisClient.set('port', self.config.port);
    // Set the number of subnets.
    var subnetCount = self.config.subnets.length;
    self.redisClient.set('subnetCount', subnetCount);
    // Set each subnet in the config database.
    for (var i = 0; i < subnetCount; i++) {
      self.redisClient.hmset('subnet' + (i+1), self.config.subnets[i]);
    }
  }

  this.loadMasterConfig = function() {

    // Select the configuration database.
    self.redisClient.select(0);

    // Get all keys that aren't hashes.
    self.redisClient.mget('hostname', 'interface', 'port', 'subnetCount', function(err, res) {
      self.config.hostname = res[0];
      self.config.interface = res[1];
      self.config.port = res[2];
      self.config.subnetCount = res[3];

      // Create an empty array of subnets.
      self.config.subnets = [];
      for (var i = 0; i < self.config.subnetCount; i++) {

        // Fill it subnets.
        self.redisClient.hgetall('subnet' + (i+1), function(err, res) {
          self.config.subnets.push(res);
        });
      }
    });
  }

  this.dumpMasterConfig = function() {

    // Override whatever the current configuration might be with what Redis has.
    self.loadMasterConfig();

    // Synchronously write the configuration as JSON to a file.
    fs.writeFileSync(self.configFile, JSON.stringify(self.config, null, 2));
  }

  this.handleDiscover = function(conn, req) {

    // Handle and respond to client's DHCPDISCOVER.
    var serverIP = self.config.interface;
    for (var i = 0; i < self.config.subnets.length; i++) {
      var block = new Netmask(self.config.subnets[i].subnet);
      if (block.contains(req.relay_ip)) {
        var subnetMask = block.mask;
        var leaseTime = self.config.subnets[i].leaseTime;
        var start = block.first.split('.');
        var end = block.last.split('.');
        var found = false;
        self.redisClient.select(i+1);
        for (var j = Number(start[start.length-1])+1; j < end[end.length-1]; j++) {
          var ip = block.base.split('.').slice(0,3);
          ip.push(j);
          ip = ip.join('.');
          if (!found) {
            var ip = ip;
            self.redisClient.exists(ip, function(err, res) {
              if (!res && !found) {
                found = true;
                var clientIP = ip;
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
                console.log("Setting " + ip);
                self.redisClient.hmset(ip, {'client_mac': req.client_mac,
                  'client_hostname': req.hostname});
                self.redisClient.expire([ip, leaseTime], function(err, res) {
                  if (err) {
                    console.log(self.name + ': err: ' + 'could not set ' +
                      'expiration for ' + ip);
                  }
                }); 
                self.sendOffer(conn, resp);
              }
            });
          }
        }
      }
    }
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
    var serverIP = self.config.interface;
    for (var i = 0; i < self.config.subnets.length; i++) {
      var block = new Netmask(self.config.subnets[i].subnet);
      if (block.contains(req.relay_ip)) {
        var subnetMask = block.mask;
        var leaseTime = self.config.subnets[i].leaseTime;
        self.redisClient.select(i+1);
        self.redisClient.exists(req.client_ip, function(err, res) {
       // self.redisClient.hgetall(req.client_ip, function(err, res) {
          if (res) {
            var ack = 'DHCPACK';
          } else {
            var ack = 'DHCPNACK';
          }  

          var resp = {
            "msg_type": ack,
            "client_ip": req.client_ip,
            "client_mac": req.client_mac,
            "server_ip": serverIP,
            "relay_ip": req.relay_ip,
            "lease_time": leaseTime,
            "subnet_mask": subnetMask,
            "router": req.relay_ip
          };
          self.redisClient.hmset(req.client_ip, {'client_mac': req.client_mac,
            'client_hostname': req.hostname});
          self.redisClient.expire([req.client_ip, leaseTime], function(err, res) {
            if (err) {
              console.log(self.name + ': err: ' + 'could not set expiration ' +
                'for ' + req.client_ip);
            }
          });
          self.sendAck(conn, resp);
        });
      }
    }
    /*var subnetMask = '255.255.255.128'; // also fake
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
    */
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
    // Start serving regardless.
    self.redisClient.dbsize(function(err,numKeys) {
      if (numKeys > 0) {
        self.loadMasterConfig();
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
