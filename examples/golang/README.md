# Golang Runtime with Dep as Dependencies Manager

## Requirements

Every handler must be in its own `package main` in a file named `handler.go`, and export a main function with the following `lambda.Start()` statement:

```golang
// Must Always be package main
package main

import (
	"encoding/json"
  // Import both of these packages
	"gitlab.infra.online.net/paas/scaleway-functions-go/events"
	"gitlab.infra.online.net/paas/scaleway-functions-go/lambda"
)

// Handler - Your handler function, uses APIGatewayProxy event type as your function will always get HTTP formatted events, even for CRON
func Handler(req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	return events.APIGatewayProxyResponse{
		Body:       "Your response",
		StatusCode: 200,
	}, nil
}

// Main function is mandatory -> Must call lambda.Start(yourHandler) otherwhise your handler will not be called properly.
func main() {
	lambda.Start(Handler)
}
```

Multiple handler must be created with multiple `main` packages in separate directories.

## Deploy

Make sure that your `go.mod` is up-to-date and then vendor your dependencies, so they can be uploaded with your code.

```sh
go build # updates go.mod & go.sum
go mod vendor # install dependencies in ./vendor
serverless deploy
```
