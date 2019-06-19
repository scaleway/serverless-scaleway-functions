package main

import (
	"encoding/json"

	"gitlab.infra.online.net/paas/scaleway-functions-go/events"
	"gitlab.infra.online.net/paas/scaleway-functions-go/lambda"
)

// Handler - Handle event
func Handler(req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	response := map[string]interface{}{
		"message": "We're all good",
		"healthy": true,
		"number":  4,
	}

	responseB, err := json.Marshal(response)
	if err != nil {
		return events.APIGatewayProxyResponse{}, err
	}

	return events.APIGatewayProxyResponse{
		Body:       string(responseB),
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(Handler)
}
