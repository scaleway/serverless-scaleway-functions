package main

import (
	"encoding/json"

	"github.com/scaleway/scaleway-functions-go/events"
	"github.com/scaleway/scaleway-functions-go/lambda"
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
