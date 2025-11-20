# Timestream Metrics

## Overview
Standalone service to poll info, memory and other data from Valkey cluster and store in files to produce timeseries of CPU load changes and other metrics trends over time.

## Getting started
**Note:** valkey-cluster must be running before the following steps.

`docker compose up --build`

To examine the metrics with curl:
`curl -s http://localhost:3000/slowlog | jq`
`curl -s http://localhost:3000/cpu | jq`
`curl -s http://localhost:3000/memory | jq`
