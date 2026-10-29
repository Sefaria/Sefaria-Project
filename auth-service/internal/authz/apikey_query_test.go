package authz

import (
	"reflect"
	"sort"
	"testing"
)

func removals(t *testing.T, path string) []string {
	t.Helper()
	resp, _ := checkDecision(t, enforce, "GET", path, nil)
	qp := append([]string(nil), resp.GetOkResponse().GetQueryParametersToRemove()...)
	sort.Strings(qp)
	return qp
}

func TestKeyParamNamesAreDerivedFromTheRequest(t *testing.T) {
	cases := map[string][]string{
		"/api/texts/Genesis.1?API_KEY=x&a=1":        {"API_KEY"},
		"/api/texts?apikey=x":                       {"apikey"},
		"/api/texts?%61pi_key=x":                    {"%61pi_key"},
		"/api/texts?api_%6bey=x":                    {"api_%6bey"},
		"/api/texts?API%5FKEY=x":                    {"API%5FKEY"},
		"/api/texts?api%5fkey=x":                    {"api%5fkey"},
		"/api/texts?%41pI%5fK%65y=x":                {"%41pI%5fK%65y"},
		"/api/texts?api_key=a&api_key=b":            {"api_key"},
		"/api/texts?api_key=a&API_KEY=b&%61pikey=c": {"%61pikey", "API_KEY", "api_key"},
		"/api/texts?api_key&x=1":                    {"api_key"},
		"/api/texts?a=1&api_key=x#frag":             {"api_key"},
	}
	for path, want := range cases {
		sort.Strings(want)
		if got := removals(t, path); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: want %v, got %v", path, want, got)
		}
	}
}

func TestUnrelatedParamsAreNeverRemoved(t *testing.T) {
	for _, path := range []string{
		"/api/texts?apikeys=1&my_api_key=2&next=3&api_keyx=4&xapikey=5&api-key=6&api%2Dkey=7",
		"/api/texts?next=https://example.org/?apikey=public",
		"/api/texts",
		"/api/texts?",
	} {
		if got := removals(t, path); len(got) != 0 {
			t.Errorf("%s: want no removals, got %v", path, got)
		}
	}
}

func TestOnlyTheNameAfterAnAmpersandCounts(t *testing.T) {
	got := removals(t, "/api/texts?apikey=sfr_test1&next=https://e.org/?api_key=2")
	if want := []string{"apikey"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("want %v, got %v", want, got)
	}
}
