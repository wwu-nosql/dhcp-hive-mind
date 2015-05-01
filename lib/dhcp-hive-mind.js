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

  this.validateRequest = function(data) {
    try {
      var validJSON = JSON.parse(data);
      return validJSON;
    } catch (err) {
      return false;
    }
  }

  this.serve = function() {

    // Instantiate a net.Server class.
    var server = net.createServer(function(conn) {

      // Log client connections.
      console.log(self.name + ': client connected');

      // Log client disconnections.
      conn.on('end', function() {
        console.log(self.name + ': client disconnected');
      });

      // Handle data from connected clients.
      conn.on('data', function(data) {
        // Validate incoming data as JSON.
        var req = self.validateRequest(data.toString());
        if (req) {
          console.log(self.name + ': ' + req);
          // If it's JSON parse the request.
          // Update Redis DB accordingly.
        } else {
          console.log(self.name + ': error: invalid request');
        }
      });
    });

    // Listen on the default interface and port.
    server.listen(self.port, self.host, function() {
      console.log(self.name + ': server bound on ' + self.host + ':' + self.port);
    });
  }
}

// Export a DHCPHiveMind factory.
module.exports = function createDHCPHiveMind(opts) {
  return new DHCPHiveMind(opts);
}
