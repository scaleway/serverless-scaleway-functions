package lambda

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/scaleway/scaleway-functions-go/events"
)

const defaultPort = 8081

// FunctionHandler - Handler for Event
type FunctionHandler func(req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error)

// Request structure sent from core runtime
type runtimeRequest struct {
	Event   interface{}
	Context interface{}
}

// Start - Start the process
func Start(handler interface{}) {
	wrappedHandler := NewHandler(handler)
	StartHandler(wrappedHandler)
}

// StartHandler - Execute a Function handler
func StartHandler(handler Handler) {
	portEnv := os.Getenv("SCW_UPSTREAM_PORT")
	port, err := strconv.Atoi(portEnv)
	if err != nil {
		port = defaultPort
	}

	s := &http.Server{
		Addr:           fmt.Sprintf(":%d", port),
		ReadTimeout:    3 * time.Second,
		WriteTimeout:   3 * time.Second,
		MaxHeaderBytes: 1 << 20, // Max header of 1MB
	}

	http.HandleFunc("/", makeRequestHandler(handler))
	log.Fatal(s.ListenAndServe())
}

// Create HTTP Handler, in charge of retrieving events and execution context from upstream requests,
// Invoke a function Handler, and handle responses (error or success)
func makeRequestHandler(handler Handler) func(res http.ResponseWriter, req *http.Request) {
	return func(res http.ResponseWriter, req *http.Request) {
		bodyBytes, err := ioutil.ReadAll(req.Body)
		if err != nil {
			errorMessage := fmt.Sprintf("An error occured while reading request: %v", err)
			handleResponse(res, http.StatusInternalServerError, []byte(errorMessage))
			return
		}

		var runtimeReq runtimeRequest

		if err := json.Unmarshal(bodyBytes, &runtimeReq); err != nil {
			errorMessage := fmt.Sprintf("Unable to parse Request body: %v", err)
			handleResponse(res, http.StatusInternalServerError, []byte(errorMessage))
			return
		}

		// Transform event to []byte for later use
		eventBytes, err := json.Marshal(runtimeReq.Event)
		if err != nil {
			handleResponse(res, http.StatusInternalServerError, []byte("Error during event encoding to JSON"))
			return
		}

		// Invoke function Handler
		response, err := handler.Invoke(nil, eventBytes)
		if err != nil {
			errorMessage := fmt.Sprintf("An error occured during handler execution: %v", err)
			handleResponse(res, http.StatusInternalServerError, []byte(errorMessage))
			return
		}

		handleResponse(res, http.StatusOK, response)
	}
}

func handleResponse(res http.ResponseWriter, statusCode int, message []byte) {
	res.WriteHeader(statusCode)
	res.Write(message)
}
