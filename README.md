# dhcp-hive-mind
Track DHCP leases in Redis.

## Example Configuration

A sample `config/config.json` might look something like this:
```
{
  "hostname": "dhcphm.localhost.localdomain",
  "interface": "localhost",
  "port": 1067,
  "subnets": [
    {
      "subnet": "67.201.192.0/24",
      "router": "67.201.192.1",
      "dynStart": "67.201.192.9",
      "dynEnd": "67.201.192.250",
      "leaseTime": 1200
    },
    {
      "subnet": "140.160.138.0/24",
      "router": "140.160.138.1",
      "dynStart": "140.160.138.2",
      "dynEnd": "140.160.138.254",
      "leaseTime": 1600
    }
  ]
}
```

## Client-server message exchange format

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

## Lease storage in Redis

```
> hset "67.201.248.10" "mac" "aa:bb:cc:dd:ee:ff"
(integer) 1
> hset "67.201.248.10" "hostname" "foobar"
(integer) 1
> expire "67.201.248.10" 1200
(integer) 1
> ttl "67.201.248.10"
(integer) 1195
> hgetall "67.201.248.10"
1) "mac"
2) "aa:bb:cc:dd:ee:ff"
3) "hostname"
4) "foobar"
> hget "67.201.248.10" "mac"
"aa:bb:cc:dd:ee:ff"
> hget "67.201.248.10" "hostname"
"foobar"

Fields are mac address and hostname.

When a lease is granted (or renewed), the key's "expires" should be set to the lease length in seconds.
```
