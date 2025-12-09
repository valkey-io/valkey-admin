const getSlots = (client) => {
  const raw = client.sendCommand("CLUSTER", "SLOT-STATS", "ORDERBY" )
}
