# dhcp-hive-mind
Track DHCP leases in Redis.

An example client/server exchange might look like this:
```
DHCPDISCOVER client ------> {'mac': 'aa:bb:cc:dd:ee:ff',
                             'hostname': 'foobar',
                             'router': '10.0.0.1'} -----------------> broadcast
# I have no layer 3 and what is this?

DHCPOFFER    client <------ {'ip': '10.0.0.2'} <------------------------ server
# Hey, use this IP.

DHCPREQUEST  client ------> {'ip': '10.0.0.2'} ------------------------> server
# Hey, I want to use this IP.

DHCPACK      client <------ {'lease end': 'some datetime'} <------------ server
# K.
```
