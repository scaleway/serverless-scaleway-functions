package main

import (
	"encoding/json"
	"net/http"

	"github.com/scaleway/scaleway-functions-go/events"
	"github.com/scaleway/scaleway-functions-go/lambda"
)

// Handler - Handle event
func Handler(req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	response := map[string]interface{}{
		"message": "My Custom Package",
	}

	responseB, err := json.Marshal(response)
	if err != nil {
		return events.APIGatewayProxyResponse{}, err
	}

	return events.APIGatewayProxyResponse{
		Body:       string(responseB),
		StatusCode: http.StatusOK,
	}, nil
}

func main() {
	lambda.Start(Handler)
}
