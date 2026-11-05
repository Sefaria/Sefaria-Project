package authz

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

type PromRecorder struct {
	decisions *prometheus.CounterVec
	latency   prometheus.Histogram
}

func NewPromRecorder(reg prometheus.Registerer) *PromRecorder {
	f := promauto.With(reg)
	return &PromRecorder{
		decisions: f.NewCounterVec(prometheus.CounterOpts{Name: "authsvc_decisions_total"}, []string{"result", "allow"}),
		latency: f.NewHistogram(prometheus.HistogramOpts{
			Name:    "authsvc_decision_seconds",
			Buckets: []float64{.00001, .00002, .00005, .0001, .0002, .0005, .001, .002, .005},
		}),
	}
}

func (p *PromRecorder) Observe(result string, allow bool, d time.Duration) {
	if result == "" {
		result = "ok"
	}
	p.decisions.WithLabelValues(result, strconv.FormatBool(allow)).Inc()
	p.latency.Observe(d.Seconds())
}
