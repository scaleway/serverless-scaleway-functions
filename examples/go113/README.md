# Golang Runtime (< 1.17)

## Requirements

Every handler must be in its own package, identified by `package main`, and exporting a main function with the following `lambda.Start` statement:
```go
// Must Always be package main
package main

import (
	"encoding/json"
	"http"
	
  // Import both of these packages
	"github.com/scaleway/scaleway-functions-go/events"
	"github.com/scaleway/scaleway-functions-go/lambda"
)

// Handler - Your handler function, uses APIGatewayProxy event type as your function will always get HTTP formatted events, even for CRON
func Handler(req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	return events.APIGatewayProxyResponse{
		Body:       "Your response",
		StatusCode: http.StatusOK,
	}, nil
}

// Main function is mandatory -> Must call lambda.Start(yourHandler) otherwhise your handler will not be called properly.
func main() {
	lambda.Start(Handler)
}
```

## Run

Additonnaly you may run `go mod vendor`.

We are building `golang` binaries inside our APIs, although we need you to package all your code with `vendors` (dependencies), so a `go build` command would work properly without prior installations on our side.
