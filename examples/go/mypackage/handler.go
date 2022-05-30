package myfunc

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// Handle - Handle event
func Handle(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"message": "We're all good",
		"healthy": true,
		"number":  4,
	}

	responseB, err := json.Marshal(response)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, string(responseB))
}
