package myfunc

import (
	"encoding/json"
	"net/http"
)

// Handle - Handle event
func Handle(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"message": "We're all good",
		"healthy": true,
		"number":  4,
	}

	responseBytes, err := json.Marshal(response)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	// Set the header explicitly depending the returned data
	w.Header().Set("Content-Type", "application/json")

	// Customise status code.
	w.WriteHeader(http.StatusOK)

	// Add content to the response
	_, _ = w.Write(responseBytes)
}
