#!/usr/bin/env python3
import valkey
import json
import time

def main():
    r = valkey.Valkey(host='localhost', port=6379, decode_responses=True)

    # STRINGS
    for i in range(1, 6):
        r.set(f"string:{i}", f"value_{i}")

    # LIST
    for i in range(1, 6):
        r.rpush("list", f"item_{i}")

    # SET
    for i in range(1, 6):
        r.sadd("set", f"member_{i}")

    # HASH
    for i in range(1, 6):
        r.hset("hash", f"field_{i}", f"value_{i}")

    # SORTED SET
    for i in range(1, 6):
        r.zadd("zset", {f"zmember_{i}": i})

    # STREAM
    for i in range(1, 6):
        r.xadd("stream", {"sensor": f"{1000 + i}", "value": f"{20 + i}"})
        time.sleep(0.01)  # unique IDs

    # BITMAP (using SETBIT)
    for i in range(1, 6):
        r.setbit("bitmap", i, 1)

    # HYPERLOGLOG (PFADD)
    for i in range(1, 6):
        r.pfadd("hll", f"user_{i}")

    # GEOSPATIAL (GEOADD)
    geodata = [
        ("London", -0.1278, 51.5074),
        ("Paris", 2.3522, 48.8566),
        ("NewYork", -74.0060, 40.7128),
        ("Tokyo", 139.6917, 35.6895),
        ("Sydney", 151.2093, -33.8688)
    ]
    for name, lon, lat in geodata:
        r.geoadd("geo", (lon, lat, name))    
               
    # REJSON (JSON.SET)
    for i in range(1, 6):
        r.execute_command('JSON.SET', f"json:{i}", '.', json.dumps({
            "id": i,
            "user": f"user_{i}",
            "roles": ["tester", "dev"]
        }))

    print("Loaded 5 entries for all Valkey data types.")

if __name__ == "__main__":
    main()
