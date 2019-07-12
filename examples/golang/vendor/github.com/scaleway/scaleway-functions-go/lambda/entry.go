package lambda

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/scaleway/scaleway-functions-go/events"
)

const defaultPort = 8080

// FunctionHandler - Handler for Event
type FunctionHandler func(req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error)

// Start takes the function Handler, at the moment only supporting HTTP Triggers (Api Gateway Proxy events)
// It takes care of wrapping the handler with an HTTP server, which receives requests when functions are triggered
// And execute the handler after formatting the HTTP Request to an API Gateway Proxy Event
func Start(handler FunctionHandler) {
	portEnv := os.Getenv("PORT")
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

func makeRequestHandler(handler FunctionHandler) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var input string

		if r.Body != nil {
			defer r.Body.Close()

			bodyBytes, bodyErr := ioutil.ReadAll(r.Body)

			if bodyErr != nil {
				log.Printf("Error reading body from request.")
			}

			input = string(bodyBytes)
		}

		// HTTP Headers - only first value
		// TODO: use HeaderMultipleValue
		headers := map[string]string{}
		for key, value := range r.Header {
			headers[key] = value[len(value)-1]
		}

		queryParameters := map[string]string{}
		for key, value := range r.URL.Query() {
			queryParameters[key] = value[len(value)-1]
		}

		isBase64Encoded := true
		_, err := base64.StdEncoding.DecodeString(input)
		if err != nil {
			isBase64Encoded = false
		}

		event := events.APIGatewayProxyRequest{
			Path:                  r.URL.Path,
			HTTPMethod:            r.Method,
			Headers:               headers,
			QueryStringParameters: queryParameters,
			StageVariables:        map[string]string{},
			Body:                  input,
			IsBase64Encoded:       isBase64Encoded,
			RequestContext: events.APIGatewayProxyRequestContext{
				Stage:      "",
				HTTPMethod: r.Method,
			},
		}

		result, resultErr := handler(event)

		if result.Headers != nil {
			for key, value := range result.Headers {
				w.Header().Set(key, value)
			}
		}

		if resultErr != nil {
			log.Print(resultErr)
			w.WriteHeader(http.StatusInternalServerError)
		} else {
			if result.StatusCode == 0 {
				w.WriteHeader(http.StatusOK)
			} else {
				w.WriteHeader(result.StatusCode)
			}
		}

		responseBody := []byte(result.Body)
		w.Write(responseBody)
	}
}
