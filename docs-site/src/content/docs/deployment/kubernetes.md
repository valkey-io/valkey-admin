---
title: Kubernetes Deployment
description: Deploy Valkey Admin with Kubernetes using the metrics sidecar pattern
---

Deploy Valkey Admin on Kubernetes by running metrics collectors as sidecars inside each Valkey pod. This approach eliminates the per-node memory overhead on the main Valkey Admin instance, making it the recommended approach for large clusters.

The workflow below uses Minikube for local development, but the manifests and sidecar pattern apply to any Kubernetes cluster.

## Architecture

- **`valkey-admin-app`**: Main frontend + backend server, deployed as a standalone `Deployment`
- **`metrics` sidecar**: Runs inside each Valkey pod, collects metrics, and registers with the main server
- **Access**: Via `kubectl port-forward` locally, or a Service/Ingress in production

## Manifest Files

| File | Purpose |
|------|---------|
| `k8s/app.yaml` | `valkey-admin-app` deployment and service |
| `k8s/metrics-configmap.yaml` | Sidecar config mounted at `/app/config/config.yml` |
| `k8s/valkey-statefulset-sidecar-patch.yaml` | Patch to add the metrics sidecar to an existing Valkey StatefulSet |
| `k8s/valkey-statefulset.yaml` | Sample standalone StatefulSet for testing |

## Deployment Steps

### 0. Start Minikube and create the namespace

```bash
minikube start
kubectl create namespace valkey
```

### 1. Run Valkey in Kubernetes with Helm

Install Valkey with Helm into namespace `valkey`. After installing, confirm the StatefulSet exists:

```bash
kubectl get statefulset -n valkey
kubectl rollout status statefulset/valkey -n valkey
kubectl get pods -n valkey
```

### 2. Build images into Minikube

For local development, use Minikube's Docker daemon so Kubernetes can see your local images:

```bash
eval $(minikube docker-env)
docker build -f docker/Dockerfile.server -t valkey-admin-app:test .
docker build -f docker/Dockerfile.metrics -t valkey-admin-metrics:test .
```

For a non-local deployment, use published images from a container registry and update the image references in `k8s/app.yaml` and `k8s/valkey-statefulset-sidecar-patch.yaml`.

### 3. Deploy the app server

```bash
kubectl apply -f k8s/app.yaml
kubectl rollout status deployment/valkey-admin-app -n valkey
```

This deploys the frontend + backend server on port `8080` in cluster-orchestrator mode for sidecar registration.

### 4. Apply the metrics config

```bash
kubectl apply -n valkey -f k8s/metrics-configmap.yaml
```

This configures the sidecar collectors for CPU, memory, command logs, and monitor-based features.

### 5. Add the metrics sidecar

Patch the Helm-created StatefulSet:

```bash
kubectl patch statefulset valkey \
  -n valkey \
  --type strategic \
  --patch-file k8s/valkey-statefulset-sidecar-patch.yaml
```

### 6. Wait for rollout

```bash
kubectl rollout status statefulset/valkey -n valkey
kubectl get pods -n valkey
```

Expected result — each Valkey pod becomes `2/2`:

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

### 7. Verify registration

Check a sidecar:

```bash
kubectl logs -n valkey valkey-0 -c metrics
```

Check the app:

```bash
kubectl logs -n valkey deploy/valkey-admin-app -f
```

Look for `Register success` in the metrics logs and cluster nodes staying in sync in the app logs.

### 8. Verify collected metrics files

```bash
kubectl exec -n valkey valkey-0 -c metrics -- ls -l /app/data
```

Expected output:

```text
total 768
-rw-r--r-- 1 node node   2010 Mar 31 00:50 commandlog_large_reply_20260331.ndjson
-rw-r--r-- 1 node node   2070 Mar 31 00:50 commandlog_large_request_20260331.ndjson
-rw-r--r-- 1 node node   1800 Mar 31 00:50 commandlog_slow_20260331.ndjson
-rw-r--r-- 1 node node 720788 Mar 31 00:50 cpu_20260331.ndjson
-rw-r--r-- 1 node node  44412 Mar 31 00:50 memory_20260331.ndjson
```

### 9. Open the UI

```bash
kubectl port-forward -n valkey svc/valkey-admin-app 8080:8080
```

Then open `http://localhost:8080`.

## Development Iteration

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

Make sure you built the image after `eval $(minikube docker-env)`. Check the pod description for `ErrImageNeverPull`.

### Metrics Server URI Missing

Check both logs:

```bash
kubectl logs -n valkey deploy/valkey-admin-app
kubectl logs -n valkey valkey-0 -c metrics
```

You want to see `Register success` in the metrics sidecar log.

### Charts Empty in the UI

Check whether the sidecar is writing NDJSON files:

```bash
kubectl exec -n valkey valkey-0 -c metrics -- ls -l /app/data
kubectl logs -n valkey valkey-0 -c metrics --since=10m
```

To get more detail, set `debug_metrics: true` in `k8s/metrics-configmap.yaml`, reapply, and restart the StatefulSet.

### Inspect the Metrics API Directly

Port-forward one sidecar:

```bash
kubectl port-forward -n valkey pod/valkey-0 3000:3000
```

The easiest option after port-forwarding is to use the existing HTTP request file at `apps/metrics/api-requests.http`, which is already set up for the metrics API.

Or use `curl`:

```bash
curl -s 'http://localhost:3000/cpu?since=0&maxPoints=10'
curl -s 'http://localhost:3000/memory?since=0&maxPoints=10'
curl -s 'http://localhost:3000/commandlog?type=slow'
```

## Notes

- The example workflow in this document is aimed at local Minikube development.
- `k8s/valkey-statefulset.yaml` is available as a repo-managed sample, but the main development path described here assumes a Helm-installed Valkey StatefulSet.
- The Helm-based development path here is based on [valkey-io/valkey-helm PR #116](https://github.com/valkey-io/valkey-helm/pull/116).
- For broader Kubernetes use, replace the local image workflow with registry-backed images and adapt the same manifests or patches to your cluster conventions.
