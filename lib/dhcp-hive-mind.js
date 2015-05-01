'use strict';

// Require the networking and redis modules.
var net = require('net');
var path = require('path');
var redis = require('redis');


function DHCPHiveMind(opts) {

  // Make the current scope of this available as self.
  var self = this;

  // Make function parameters optional.
  opts = opts || {};
  this.name = opts.name || path.basename(process.argv[1]);
  this.host = opts.host || 'localhost';
  this.port = opts.port || 1067;
  this.discoverKeys = opts.discoverKeys || ['hostname', 'mac', 'router'];
  this.requestKeys = opts.requestKeys || ['ip'];

  this.validateRequest = function(data) {

    // Try to parse the data as JSON.
    try {
      var req = JSON.parse(data);

      // Verify the request has valid keys and possibly set the request type.
      var reqKeys = JSON.stringify(Object.keys(req).sort());
      if (reqKeys === JSON.stringify(self.discoverKeys.sort())) {
        req.type = 'DHCPDISCOVER';
      } else if (reqKeys === JSON.stringify(self.requestKeys.sort())) {
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
          // SEND RESPONSE TO CLIENT HERE.
        } else {
          console.log(self.name + ': error: invalid request from ' + remote);
        }
      });
    });

    // Listen on the default interface and port.
    server.listen(self.port, self.host, function() {
      console.log(self.name + ': info: server bound on ' + self.host + ':' + self.port);
    });
  }
}

// Export a DHCPHiveMind factory.
module.exports = function createDHCPHiveMind(opts) {
  return new DHCPHiveMind(opts);
}
