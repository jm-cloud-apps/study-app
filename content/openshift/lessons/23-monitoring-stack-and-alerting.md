# Operating the Monitoring Stack: Prometheus, Thanos, and Alertmanager

> **The one-sentence version:** OpenShift ships a managed Prometheus/Thanos/Alertmanager stack you configure through two ConfigMaps and a handful of CRs — and the two things people get wrong are forgetting persistent storage for metrics and never wiring an Alertmanager receiver to a human.

Lesson 13 introduced what's built in. This lesson is about **configuring and operating** it.

## Why it matters

An alert nobody receives is a log line. A cluster that silently drops its metrics on every pod restart can't answer "was this happening yesterday?" Both are default-shaped mistakes, and both are fixed with a few lines of YAML.

## What's actually running

Two stacks, deliberately separated:

| Stack | Namespace | Watches |
|---|---|---|
| **Platform monitoring** | `openshift-monitoring` | The cluster itself. Always on; its rules and alerts are **managed and not editable**. |
| **User-workload monitoring** | `openshift-user-workload-monitoring` | *Your* apps. **Off by default** — you opt in. |

**Thanos Querier** sits in front of both so a single query can span platform and user metrics (and so the console shows one unified view). **Alertmanager** takes fired alerts and decides who hears about them.

```bash
oc get pods -n openshift-monitoring
oc get pods -n openshift-user-workload-monitoring
```

🔑 **You don't edit the Prometheus CR.** The Cluster Monitoring Operator owns it and will revert you. Configuration happens through the two ConfigMaps below.

## The two configuration ConfigMaps

Platform stack — `cluster-monitoring-config` in `openshift-monitoring`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-monitoring-config
  namespace: openshift-monitoring
data:
  config.yaml: |
    enableUserWorkload: true          # turn on the user-workload stack
    prometheusK8s:
      retention: 15d
      volumeClaimTemplate:            # <- persistent metrics
        spec:
          storageClassName: gp3-csi
          resources:
            requests:
              storage: 100Gi
    alertmanagerMain:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3-csi
          resources:
            requests:
              storage: 20Gi
```

User-workload stack — `user-workload-monitoring-config` in `openshift-user-workload-monitoring`, same shape but under `prometheus:`.

> ⚠️ **Without a `volumeClaimTemplate`, Prometheus uses ephemeral storage and loses every metric when its pod restarts** — including during any upgrade. If your cluster can't answer questions about last week, this is almost always why.

> ⚠️ Editing these ConfigMaps triggers a redeploy of the monitoring pods. Do it in a quiet window; you'll have a short gap in collection.

## Scraping your own apps

Once `enableUserWorkload: true` is set, you expose metrics with a **ServiceMonitor** (or **PodMonitor**) in your own namespace:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: payments
  namespace: payments
spec:
  selector:
    matchLabels:
      app: payments          # matches the *Service's* labels
  endpoints:
    - port: metrics          # the Service port NAME, not the number
      interval: 30s
      path: /metrics
```

> 💡 The two classic mistakes: matching the **Pod's** labels instead of the **Service's**, and giving `port:` a number instead of the port's *name*. If a target never appears, check both, then look at the target list in the console's Metrics UI.

And your own alert and recording rules with a **PrometheusRule**:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: payments-alerts
  namespace: payments
spec:
  groups:
    - name: payments.rules
      rules:
        - alert: PaymentsHighErrorRate
          expr: |
            sum(rate(http_requests_total{job="payments",status=~"5.."}[5m]))
              / sum(rate(http_requests_total{job="payments"}[5m])) > 0.05
          for: 10m
          labels:
            severity: warning
          annotations:
            summary: "Payments 5xx rate above 5% for 10 minutes"
            runbook_url: "https://wiki.example.com/runbooks/payments-5xx"
```

> 💡 `for:` is what separates an alert from a flap. And a `runbook_url` annotation is the kindest thing you can do for whoever gets paged at 3 a.m. — including future you.

## Alertmanager: routing alerts to humans

Alertmanager's job is **grouping, inhibition, silencing, and delivery**. Configuration lives in the `alertmanager-main` secret in `openshift-monitoring`, and the console offers a form-based editor for the same thing (Administration → Cluster Settings → Configuration → Alertmanager).

```yaml
route:
  receiver: default-null
  group_by: [namespace, alertname]
  group_wait: 30s          # wait for friends before sending the first notification
  group_interval: 5m       # then batch further changes to the group
  repeat_interval: 12h     # re-nag if still firing
  routes:
    - matchers: [ 'alertname = Watchdog' ]
      receiver: default-null
    - matchers: [ 'severity = critical' ]
      receiver: pagerduty-critical
    - matchers: [ 'namespace = payments' ]
      receiver: slack-payments

receivers:
  - name: default-null
  - name: pagerduty-critical
    pagerduty_configs:
      - routing_key_file: /etc/alertmanager/secrets/pd/routing-key
  - name: slack-payments
    slack_configs:
      - api_url_file: /etc/alertmanager/secrets/slack/webhook-url
        channel: '#payments-alerts'
        title: '{{ .CommonAnnotations.summary }}'
```

Receiver types you'll actually use: **PagerDuty**, **Slack** (incoming webhook), **email**, and generic **webhook** (for ticketing or a custom bridge).

Three concepts worth naming precisely:

- **Grouping** (`group_by`) collapses many related alerts into one notification. Group too finely and you get a storm; too coarsely and unrelated problems hide behind each other.
- **Inhibition** suppresses a lower-severity alert while a related higher-severity one is firing — "the node is down" should silence "the pod on it is unreachable."
- **Silencing** is the temporary, human, time-boxed mute you set during planned maintenance — from the console or `amtool`. Silences expire; that's the point.

> 🔑 **The `Watchdog` alert always fires, by design.** It's the dead-man's switch: route it to an external service that alarms if it *stops* arriving. Otherwise a broken monitoring stack looks exactly like a healthy cluster.

Secrets for receivers (webhook URLs, routing keys) are mounted into Alertmanager by listing them under `alertmanagerMain.secrets` in `cluster-monitoring-config` — keep the credentials in Secrets, not inline in the config.

Namespaced teams can own their own routing with the **AlertmanagerConfig** CR, once user-workload alert routing is enabled in the cluster config. That lets the payments team change their Slack channel without a cluster-admin.

## Day-to-day commands

```bash
# Where are the alerts right now?
oc get prometheusrules -A
oc -n openshift-monitoring get secret alertmanager-main -o jsonpath='{.data.alertmanager\.yaml}' | base64 -d

# Query from the CLI via the Thanos Querier route
TOKEN=$(oc whoami -t)
HOST=$(oc get route thanos-querier -n openshift-monitoring -o jsonpath='{.spec.host}')
curl -sH "Authorization: Bearer $TOKEN" \
  --data-urlencode 'query=up{job="payments"}' \
  "https://$HOST/api/v1/query" | jq
```

The console's **Observe → Alerting / Metrics / Targets** pages are the fastest way to check whether a scrape target is up and whether a rule is firing.

## Check yourself

1. Your team asks why CPU graphs reset to empty after last night's upgrade. What one piece of configuration was missing?
2. A ServiceMonitor exists, the app serves `/metrics`, and no target shows up. Name the two label/port mistakes to check.
3. What would you route the `Watchdog` alert to, and what does its *absence* mean?

## Key takeaways

- Platform monitoring is always on and **not editable**; user-workload monitoring is opt-in via `enableUserWorkload: true`.
- Configure through **`cluster-monitoring-config`** and **`user-workload-monitoring-config`**, never by editing the Prometheus CR.
- Add a **`volumeClaimTemplate`** or your metrics are ephemeral — this is the most common operational regret.
- **ServiceMonitor/PodMonitor** define scraping; **PrometheusRule** defines alerts and recording rules. Use `for:` and add a `runbook_url`.
- **Alertmanager** does grouping, inhibition, silencing, and delivery to PagerDuty/Slack/email/webhook; credentials belong in mounted Secrets.
- Route the always-firing **`Watchdog`** alert externally as a dead-man's switch.
- **AlertmanagerConfig** lets namespaced teams own their own routing.
