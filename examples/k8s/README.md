# Kubernetes Deployment Notes

This directory contains Kubernetes manifests and patches for running Valkey Admin with a Valkey StatefulSet.

The workflow documented below focuses on local development with Minikube, but the manifests and sidecar pattern are not inherently limited to Minikube.

The workflow described in this document is:

- run Valkey in Kubernetes
- run `valkey-admin-app` as a separate `Deployment`
- run `metrics` as a sidecar inside each Valkey pod
- access the UI from localhost with `kubectl port-forward`

## What lives here

- `app.yaml`: `valkey-admin-app` deployment and service
- `metrics-configmap.yaml`: sidecar config mounted into `/app/config/config.yml`
- `valkey-statefulset-sidecar-patch.yaml`: patch for an existing Valkey StatefulSet
- `valkey-statefulset.yaml`: sample standalone StatefulSet for repo-managed K8s experiments

## Local Development Workflow

The example path described below is:

- run Minikube locally
- install Valkey into namespace `valkey` with Helm
- patch the resulting `statefulset/valkey` to add the metrics sidecar
- run `valkey-admin-app` as a separate deployment
- access the UI from localhost with `kubectl port-forward`

## 0. Start Minikube and create the namespace

If you are following the local Minikube workflow and do not already have Minikube running:

```bash
minikube start
kubectl create namespace valkey
```

If the namespace already exists, `kubectl create namespace valkey` will fail harmlessly and you can ignore it.

## 1. Run Valkey in Kubernetes with Helm

Install Valkey with Helm into namespace `valkey`.

This workflow was developed against the Valkey Helm chart work in [valkey-io/valkey-helm PR #116](https://github.com/valkey-io/valkey-helm/pull/116), which adds cluster support with sharding.

The important part for the rest of this guide is:

- the namespace is `valkey`
- the Helm release creates a StatefulSet named `valkey`

After installing the chart, confirm the StatefulSet exists:

```bash
kubectl get statefulset -n valkey
kubectl rollout status statefulset/valkey -n valkey
kubectl get pods -n valkey
```

Expected result:

- a StatefulSet named `valkey` exists in namespace `valkey`
- the Valkey pods are `Running`

If your Helm install uses different names, adjust the commands in the rest of this document accordingly.

## 2. Build images into Minikube

For local development, use Minikube's Docker daemon so Kubernetes can see your local images:

```bash
eval $(minikube docker-env)
docker build -f docker/Dockerfile.server -t valkey-admin-app:test .
docker build -f docker/Dockerfile.metrics -t valkey-admin-metrics:test .
```

This local image flow is meant for development.

In a normal deployment, use published images from a container registry and update the image references in:

- `k8s/app.yaml`
- `k8s/valkey-statefulset-sidecar-patch.yaml`
- optionally `k8s/valkey-statefulset.yaml` if you use the sample StatefulSet

## 3. Deploy the app server

```bash
kubectl apply -f k8s/app.yaml
kubectl rollout status deployment/valkey-admin-app -n valkey
```

This deploys:

- the frontend + backend server on port `8080`
- cluster-orchestrator mode for sidecar registration

## 4. Apply the metrics config

```bash
kubectl apply -n valkey -f k8s/metrics-configmap.yaml
```

This configures the sidecar collectors for:

- CPU
- memory
- command logs
- monitor-based features

## 5. Add the metrics sidecar

Patch the Helm-created StatefulSet:

```bash
kubectl patch statefulset valkey \
  -n valkey \
  --type strategic \
  --patch-file k8s/valkey-statefulset-sidecar-patch.yaml
```

The patch adds a `metrics` container to each Valkey pod.

## 6. Wait for rollout

```bash
kubectl rollout status statefulset/valkey -n valkey
kubectl get pods -n valkey
```

Expected result:

- each Valkey pod becomes `2/2`
- the app deployment stays `1/1`

Example:

```text
NAME                                READY   STATUS    RESTARTS   AGE
valkey-0                            2/2     Running   0          44h
valkey-1                            2/2     Running   0          44h
valkey-2                            2/2     Running   0          44h
valkey-3                            2/2     Running   0          44h
valkey-4                            2/2     Running   0          44h
valkey-5                            2/2     Running   0          44h
valkey-admin-app-86df879d67-dgcgv   1/1     Running   0          45h
```

## 7. Verify registration

Check one sidecar:

```bash
kubectl logs -n valkey valkey-0 -c metrics
```

Check the app:

```bash
kubectl logs -n valkey deploy/valkey-admin-app -f
```

Expected signals:

- metrics logs show `Register success`
- app logs show cluster nodes and metrics servers staying in sync

## 8. Verify collected metrics files

Check that the sidecar is writing NDJSON files:

```bash
kubectl exec -n valkey valkey-0 -c metrics -- ls -l /app/data
```

Expected result:

```text
total 768
-rw-r--r-- 1 node node   2010 Mar 31 00:50 commandlog_large_reply_20260331.ndjson
-rw-r--r-- 1 node node   2070 Mar 31 00:50 commandlog_large_request_20260331.ndjson
-rw-r--r-- 1 node node   1800 Mar 31 00:50 commandlog_slow_20260331.ndjson
-rw-r--r-- 1 node node 720788 Mar 31 00:50 cpu_20260331.ndjson
-rw-r--r-- 1 node node  44412 Mar 31 00:50 memory_20260331.ndjson
```

## 9. Open the UI on localhost

```bash
kubectl port-forward -n valkey svc/valkey-admin-app 8080:8080
```

Then open:

```text
http://localhost:8080
```

The app server connects to the Valkey node configured in [k8s/app.yaml](/Users/arsenyk/Documents/valkey-skyscope/k8s/app.yaml):

```text
VALKEY_HOST=valkey-0.valkey-headless.valkey.svc.cluster.local
VALKEY_PORT=6379
```

## Development Iteration Loop

When you change the metrics sidecar:

```bash
eval $(minikube docker-env)
docker build -f docker/Dockerfile.metrics -t valkey-admin-metrics:test .
kubectl apply -n valkey -f k8s/metrics-configmap.yaml
kubectl rollout restart statefulset/valkey -n valkey
kubectl rollout status statefulset/valkey -n valkey
```

When you change the app server:

```bash
eval $(minikube docker-env)
docker build -f docker/Dockerfile.server -t valkey-admin-app:test .
kubectl apply -f k8s/app.yaml
kubectl rollout restart deployment/valkey-admin-app -n valkey
kubectl rollout status deployment/valkey-admin-app -n valkey
```

## Troubleshooting

### Sidecar Image Not Found

Make sure you built it after `eval $(minikube docker-env)`.

Check the pod description for `ErrImageNeverPull`.

### Metrics Server URI Missing

Check:

```bash
kubectl logs -n valkey deploy/valkey-admin-app
kubectl logs -n valkey valkey-0 -c metrics
```

You want to see `Register success` in the metrics sidecar log.

### Charts Empty In The UI

Check whether the sidecar is writing NDJSON files and whether the collector logs show errors:

```bash
kubectl exec -n valkey valkey-0 -c metrics -- ls -l /app/data
kubectl logs -n valkey valkey-0 -c metrics --since=10m
```

If you need more detail from the metrics sidecar, temporarily set `debug_metrics: true` in [k8s/metrics-configmap.yaml](/Users/arsenyk/Documents/valkey-skyscope/k8s/metrics-configmap.yaml), reapply the ConfigMap, and restart the StatefulSet.

### Inspect The Metrics API Directly

Port-forward one metrics sidecar:

```bash
kubectl port-forward -n valkey pod/valkey-0 3000:3000
```

The easiest option after port-forwarding is to use the existing HTTP request file at [apps/metrics/api-requests.http](/Users/arsenyk/Documents/valkey-skyscope/apps/metrics/api-requests.http), which is already set up for the metrics API.

Or if you prefer, you can use `curl`:

```bash
curl -s 'http://localhost:3000/cpu?since=0&maxPoints=10'
curl -s 'http://localhost:3000/memory?since=0&maxPoints=10'
curl -s 'http://localhost:3000/commandlog?type=slow'
```

## Notes

- The example workflow in this document is aimed at local Minikube development.
- `k8s/valkey-statefulset.yaml` is still available as a repo-managed sample, but the main development path described here assumes a Helm-installed Valkey StatefulSet.
- The Helm-based development path here is based on [valkey-io/valkey-helm PR #116](https://github.com/valkey-io/valkey-helm/pull/116).
- For broader Kubernetes use, replace the local image workflow with registry-backed images and adapt the same manifests or patches to your cluster conventions.
