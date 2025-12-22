// Will need to delte this after integrating real data

// Hot slots data - numbers represent access count (how many times keys are accessed)
export const nodes = [
  { connectionId: "A", slots: { 1234: { keys: { "user:1001": 45, "session:a1b2": 23, "cart:5678": 12 } }, 1235: { keys: { "user:1002": 67, "profile:a1": 34 } }, 1236: { keys: { "cart:9012": 89, "wishlist:x1": 56 } } } },
  { connectionId: "B", slots: { 5678: { keys: { "order:2001": 89, "payment:xyz": 67, "invoice:123": 34 } } } },
  { connectionId: "C", slots: { 9012: { keys: { "product:501": 156, "category:tech": 98, "product:101": 445, "product:102": 423, "product:103": 398, "product:104": 367, "product:105": 334, "product:106": 312, "product:107": 289, "product:108": 267, "product:109": 245, "product:110": 223, "product:111": 201, "product:112": 189, "product:113": 167, "product:114": 156, "product:115": 145, "product:116": 134, "product:117": 123, "product:118": 112, "product:119": 101, "product:120": 98, "product:121": 87, "product:122": 76, "product:123": 67, "product:124": 59, "product:125": 54, "product:126": 48, "product:127": 43, "product:128": 39, "product:129": 34, "product:130": 29, "product:131": 25, "product:132": 23, "product:133": 19, "product:134": 17, "product:135": 15, "product:136": 13, "product:137": 12, "product:138": 11, "product:139": 10, "product:140": 9, "product:141": 8, "product:142": 7, "product:143": 6, "product:144": 5, "product:145": 4, "product:146": 3, "product:147": 2, "product:148": 1 } }, 9013: { keys: { "product:502": 234, "review:101": 178 } }, 9014: { keys: { "inventory:a1": 123, "stock:b2": 98 } }, 9015: { keys: { "price:501": 87, "discount:x1": 45 } } } },
  { connectionId: "D", slots: { 3456: { keys: { "analytics:daily": 234, "metrics:cpu": 189, "stats:mem": 145 } } } },
  { connectionId: "E", slots: { 7890: { keys: { "cache:page1": 56, "cache:page2": 43, "cache:page3": 29 } }, 7891: { keys: { "cache:api1": 123, "cache:api2": 98 } } } },
  { connectionId: "F", slots: { 2345: { keys: { "auth:token1": 312, "auth:token2": 278, "auth:refresh": 156 } }, 2346: { keys: { "auth:session1": 201, "auth:session2": 167 } }, 2347: { keys: { "auth:jwt1": 289, "auth:jwt2": 234 } } } },
  { connectionId: "G", slots: { 6789: { keys: { "log:error": 23, "log:warn": 45, "log:info": 12 } } } },
  { connectionId: "H", slots: { 4567: { keys: { "queue:jobs": 189, "queue:tasks": 167, "queue:events": 134 } }, 4568: { keys: { "queue:email": 256, "queue:sms": 198 } } } },
  { connectionId: "I", slots: { 8901: { keys: { "config:app": 67, "config:db": 54, "config:redis": 43 } } } },
  { connectionId: "J", slots: { 1357: { keys: { "user:2002": 234, "user:2003": 198, "user:2004": 176 } }, 1358: { keys: { "user:2005": 312, "user:2006": 267 } }, 1359: { keys: { "user:2007": 189, "user:2008": 145 } } } },
  { connectionId: "K", slots: { 2468: { keys: { "search:query1": 145, "search:query2": 123, "search:filter": 98 } } } },
  { connectionId: "L", slots: { 3579: { keys: { "notification:1": 89, "notification:2": 67, "notification:3": 45 } }, 3580: { keys: { "alert:critical": 301, "alert:warn": 234 } } } },
  { connectionId: "M", slots: { 4680: { keys: { "feature:flag1": 312, "feature:flag2": 289, "feature:flag3": 234 } } } },
  { connectionId: "N", slots: { 5791: { keys: { "rate:limit1": 456, "rate:limit2": 389, "rate:limit3": 312 } }, 5792: { keys: { "rate:api1": 523, "rate:api2": 467 } }, 5793: { keys: { "throttle:user1": 345, "throttle:user2": 289 } } } },
  { connectionId: "O", slots: { 6802: { keys: { "session:b2c3": 78, "session:c3d4": 65, "session:d4e5": 54 } } } },
  { connectionId: "P", slots: { 7913: { keys: { "temp:data1": 123, "temp:data2": 98, "temp:data3": 76 } } } },
  { connectionId: "Q", slots: { 8024: { keys: { "backup:file1": 45, "backup:file2": 34, "backup:file3": 23 } } } },
  { connectionId: "R", slots: { 9135: { keys: { "api:endpoint1": 567, "api:endpoint2": 489, "api:endpoint3": 423 } }, 9136: { keys: { "api:v2/users": 612, "api:v2/orders": 534 } } } },
  { connectionId: "S", slots: { 1246: { keys: { "webhook:gh": 234, "webhook:stripe": 198, "webhook:slack": 167 } } } },
  { connectionId: "T", slots: { 3680: { keys: { "monitor:cpu": 389, "monitor:ram": 345, "monitor:disk": 298 } } } },
] as const

// Large slots data - numbers represent key size in bytes (more random distribution)
export const largeSlotNodes = [
  { connectionId: "A", slots: { 1234: { keys: { "user:1001": 89000, "session:a1b2": 230, "cart:5678": 450 } }, 1235: { keys: { "user:1002": 120, "profile:a1": 67000 } }, 1236: { keys: { "cart:9012": 12400, "wishlist:x1": 340 } } } },
  { connectionId: "B", slots: { 5678: { keys: { "order:2001": 450, "payment:xyz": 98000, "invoice:123": 3200 } } } },
  { connectionId: "C", slots: { 9012: { keys: { "product:501": 156, "category:tech": 234, "product:101": 89, "product:102": 312, "product:103": 445, "product:104": 178, "product:105": 256, "product:106": 523, "product:107": 167, "product:108": 398, "product:109": 289, "product:110": 134, "product:111": 412, "product:112": 356, "product:113": 198, "product:114": 267, "product:115": 489, "product:116": 145, "product:117": 378, "product:118": 223, "product:119": 534, "product:120": 298, "product:121": 189, "product:122": 456, "product:123": 312, "product:124": 245, "product:125": 501, "product:126": 187, "product:127": 367, "product:128": 278, "product:129": 423, "product:130": 156, "product:131": 334, "product:132": 201, "product:133": 467, "product:134": 289, "product:135": 178, "product:136": 512, "product:137": 245, "product:138": 389, "product:139": 156, "product:140": 298, "product:141": 401, "product:142": 234, "product:143": 167, "product:144": 478, "product:145": 312, "product:146": 189, "product:147": 356, "product:148": 267 } }, 9013: { keys: { "product:502": 78, "review:101": 145 } }, 9014: { keys: { "inventory:a1": 234, "stock:b2": 456 } }, 9015: { keys: { "price:501": 189, "discount:x1": 312 } } } },
  { connectionId: "D", slots: { 3456: { keys: { "analytics:daily": 150000, "metrics:cpu": 820, "stats:mem": 45000 } } } },
  { connectionId: "E", slots: { 7890: { keys: { "cache:page1": 256, "cache:page2": 134000, "cache:page3": 890 } }, 7891: { keys: { "cache:api1": 67, "cache:api2": 89000 } } } },
  { connectionId: "F", slots: { 2345: { keys: { "auth:token1": 45000, "auth:token2": 110, "auth:refresh": 78000 } }, 2346: { keys: { "auth:session1": 145, "auth:session2": 23000 } }, 2347: { keys: { "auth:jwt1": 56000, "auth:jwt2": 98 } } } },
  { connectionId: "G", slots: { 6789: { keys: { "log:error": 189, "log:warn": 112000, "log:info": 345 } } } },
  { connectionId: "H", slots: { 4567: { keys: { "queue:jobs": 67000, "queue:tasks": 234, "queue:events": 89000 } }, 4568: { keys: { "queue:email": 456, "queue:sms": 123000 } } } },
  { connectionId: "I", slots: { 8901: { keys: { "config:app": 98000, "config:db": 567, "config:redis": 34000 } } } },
  { connectionId: "J", slots: { 1357: { keys: { "user:2002": 234, "user:2003": 78000, "user:2004": 456 } }, 1358: { keys: { "user:2005": 89, "user:2006": 45000 } }, 1359: { keys: { "user:2007": 123000, "user:2008": 312 } } } },
  { connectionId: "K", slots: { 2468: { keys: { "search:query1": 145, "search:query2": 67000, "search:filter": 234 } } } },
  { connectionId: "L", slots: { 3579: { keys: { "notification:1": 156000, "notification:2": 89, "notification:3": 23000 } }, 3580: { keys: { "alert:critical": 45000, "alert:warn": 178 } } } },
  { connectionId: "M", slots: { 4680: { keys: { "feature:flag1": 89, "feature:flag2": 134000, "feature:flag3": 267 } } } },
  { connectionId: "N", slots: { 5791: { keys: { "rate:limit1": 78000, "rate:limit2": 145, "rate:limit3": 56000 } }, 5792: { keys: { "rate:api1": 234, "rate:api2": 98000 } }, 5793: { keys: { "throttle:user1": 123000, "throttle:user2": 367 } } } },
  { connectionId: "O", slots: { 6802: { keys: { "session:b2c3": 456, "session:c3d4": 89000, "session:d4e5": 234 } } } },
  { connectionId: "P", slots: { 7913: { keys: { "temp:data1": 345, "temp:data2": 167000, "temp:data3": 567 } } } },
  { connectionId: "Q", slots: { 8024: { keys: { "backup:file1": 245000, "backup:file2": 890, "backup:file3": 178000 } } } },
  { connectionId: "R", slots: { 9135: { keys: { "api:endpoint1": 67, "api:endpoint2": 123000, "api:endpoint3": 289 } }, 9136: { keys: { "api:v2/users": 134000, "api:v2/orders": 456 } } } },
  { connectionId: "S", slots: { 1246: { keys: { "webhook:gh": 98000, "webhook:stripe": 234, "webhook:slack": 56000 } } } },
  { connectionId: "T", slots: { 3680: { keys: { "monitor:cpu": 189, "monitor:ram": 145000, "monitor:disk": 378 } } } },
] as const

