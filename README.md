# dhcp-hive-mind
Track DHCP leases in Redis.

An example client/server exchange might look like this:
```
client -> broadcast
{ 
  "msg_type": "DHCPDISCOVER",       # option 53
  "client_mac": "my mac address",   # CHADDR
  "hostname": "foobar",             # option 12
  "relay_ip": "ip-helper address"   # GIADDR? (Set by relay agent)
}

server -> client
{ 
  "msg_type": "DHCPOFFER",                  # option 53
  "client_ip": "proposed ip addr",          # YIADDR
  "client_mac": "client's mac address",     # CHADDR
  "server_ip": "my ip addr",                # SIADDR / option 54
  "relay_ip": "ip-helper address"           # GIADDR? (Set by server)
  "lease_time": "lease length in seconds",  # option 51
  "subnet_mask": "255.255.maybe.whatever",  # option 1
  "router": "router's ip addr",             # option 3
}

client -> broadcast/server
{ 
  "msg_type": "DHCPREQUEST",        # option 53
  "client_ip": "requested ip addr", # option 50
  "client_mac": "my mac address",   # CHADDR
  "hostname": "foobar",             # option 12
  "relay_ip": "ip-helper address"   # GIADDR? (Set by relay agent)
}

server -> client
{ 
  "msg_type": "DHCPACK",                    # option 53
  "client_ip": "ack'ed ip addr",            # YIADDR
  "client_mac": "client's mac address",     # CHADDR
  "server_ip": "my ip addr",                # SIADDR / option 54
  "relay_ip": "ip-helper address"           # GIADDR? (Set by server)
  "lease_time": "lease length in seconds",  # option 51
  "subnet_mask": "255.255.maybe.whatever",  # option 1
  "router": "router's ip addr",             # option 3
}
```
